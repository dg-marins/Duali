import { expect, test } from "vitest";
import { fixture } from "./test-helper.js";

function cpfFrom(text: string) {
  const base = Array.from(text)
    .map((character) => character.charCodeAt(0) % 10)
    .join("")
    .padEnd(9, "1")
    .slice(0, 9)
    .split("")
    .map(Number);
  if (base.every((digit) => digit === base[0])) base[8] = (base[8]! + 1) % 10;
  for (let length = 9; length <= 10; length += 1) {
    const sum = base
      .slice(0, length)
      .reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    const result = (sum * 10) % 11;
    base.push(result === 10 ? 0 : result);
  }
  return base.join("");
}

test("operational people search, current link, profile and audit filters", async () => {
  const f = await fixture();
  try {
    const create = async <T extends { id: string }>(
      path: string,
      payload: unknown,
    ) => {
      const response = await f.app.inject({
        method: "POST",
        url: `/api/${path}`,
        headers: f.headers,
        payload,
      });
      expect(response.statusCode, response.body).toBe(201);
      return response.json<T>();
    };
    const cpf = cpfFrom(f.suffix);
    const person = await create("pessoas", {
      nomeCompleto: `Perfil operacional ${f.suffix}`,
      cpf,
      email: `${f.suffix}@operacional.test`,
      cep: "20000-000",
      logradouro: "Rua sintética",
      numeroEndereco: "15",
      bairro: "Centro",
      cidadeEndereco: "Rio de Janeiro",
      ufEndereco: "RJ",
      endereco: "Valor legado preservado",
    });
    const unit = await create("unidades", {
      nome: `Unidade operacional ${f.suffix}`,
      sigla: f.suffix.slice(0, 14),
      uf: "RJ",
    });
    await create("vinculos", {
      pessoaId: person.id,
      unidadeId: unit.id,
      tipo: "CLT",
      matricula: `MAT-${f.suffix}`,
      dataAdmissao: "2020-01-01",
    });
    const current = await create("vinculos", {
      pessoaId: person.id,
      unidadeId: unit.id,
      tipo: "ESTAGIO",
      dataAdmissao: "2025-01-01",
    });
    const institution = await create("instituicoes", {
      nome: `Instituição ${f.suffix}`,
    });
    await create("estagios", {
      vinculoId: current.id,
      instituicaoEnsinoId: institution.id,
      matriculaAcademica: `ACA-${f.suffix}`,
      dataTerminoPrevista: "2026-12-31",
    });

    for (const query of [
      f.suffix,
      cpf,
      `${f.suffix}@operacional.test`,
      `MAT-${f.suffix}`,
    ]) {
      const response = await f.app.inject({
        url: `/api/pessoas-operacional?q=${encodeURIComponent(query)}`,
        headers: f.headers,
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json<{ total: number }>().total).toBe(1);
    }
    const textSearch = await f.app.inject({
      url: "/api/pessoas-operacional?q=Perfil%20operacional",
      headers: f.headers,
    });
    expect(
      textSearch.json<{ items: Array<{ id: string }> }>().items,
    ).toContainEqual(expect.objectContaining({ id: person.id }));

    const filtered = await f.app.inject({
      url: `/api/pessoas-operacional?tipo=ESTAGIO&unidadeId=${unit.id}`,
      headers: f.headers,
    });
    expect(
      filtered.json<{ items: Array<{ id: string; vinculo: string }> }>().items,
    ).toContainEqual(
      expect.objectContaining({ id: person.id, vinculo: "ESTAGIO" }),
    );

    const profile = await f.app.inject({
      url: `/api/pessoas/${person.id}/perfil`,
      headers: f.headers,
    });
    expect(profile.statusCode, profile.body).toBe(200);
    const body = profile.json<{
      pessoa: { cep: string; endereco: string };
      vinculoAtual: { id: string };
      multiplosVinculosAtivos: boolean;
    }>();
    expect(body.pessoa).toMatchObject({
      cep: "20000-000",
      endereco: "Valor legado preservado",
    });
    expect(body.vinculoAtual.id).toBe(current.id);
    expect(body.multiplosVinculosAtivos).toBe(true);

    const interns = await f.app.inject({
      url: `/api/estagiarios-operacional?q=${encodeURIComponent(`ACA-${f.suffix}`)}&instituicaoId=${institution.id}`,
      headers: f.headers,
    });
    expect(interns.statusCode, interns.body).toBe(200);
    expect(interns.json<{ total: number }>().total).toBe(1);

    const audit = await f.app.inject({
      url: "/api/auditoria?entidade=pessoa&acao=criar",
      headers: f.headers,
    });
    expect(audit.statusCode, audit.body).toBe(200);
    expect(
      audit.json<{ items: Array<{ entidadeId: string }> }>().items,
    ).toContainEqual(expect.objectContaining({ entidadeId: person.id }));
  } finally {
    await f.app.close();
  }
});
