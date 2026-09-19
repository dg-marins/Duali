import { test, expect } from "vitest";
import { fixture } from "./test-helper.js";
import { internshipAlerts } from "./modules/internship.js";
test("internship records, renewals and expiry alerts preserve history", async () => {
  const f = await fixture();
  try {
    const p = await f.db.pessoa.create({
      data: { nomeCompleto: "Estagiário sintético" },
    });
    const u = await f.db.unidade.create({
      data: { nome: "Unidade", sigla: f.suffix, uf: "SP" },
    });
    const v = await f.db.vinculo.create({
      data: {
        pessoaId: p.id,
        unidadeId: u.id,
        tipo: "ESTAGIO",
        dataAdmissao: new Date("2020-01-01"),
      },
    });
    for (const tipo of ["TCE", "RENOVACAO", "RENOVACAO"]) {
      const response = await f.app.inject({
        method: "POST",
        url: "/api/documentos",
        headers: f.headers,
        payload: {
          vinculoId: v.id,
          tipo,
          inicioVigencia: "2020-01-01",
          fimVigencia: "2020-12-31",
          status: "VIGENTE",
        },
      });
      expect(response.statusCode, response.body).toBe(201);
    }
    expect(
      await f.db.documentoVinculo.count({ where: { vinculoId: v.id } }),
    ).toBe(3);
    expect(
      (await internshipAlerts(f.db)).filter((a) => a.vinculoId === v.id),
    ).toHaveLength(3);
    const aditivo = await f.app.inject({
      method: "POST",
      url: "/api/documentos",
      headers: f.headers,
      payload: {
        vinculoId: v.id,
        tipo: "ADITIVO",
        inicioVigencia: "2026-08-01",
        status: "PENDENTE",
      },
    });
    expect(aditivo.statusCode, aditivo.body).toBe(201);
    expect(
      aditivo.json<{ fimVigencia: string }>().fimVigencia.slice(0, 10),
    ).toBe("2027-02-01");
    const invalid = await f.app.inject({
      method: "POST",
      url: "/api/seguros",
      headers: f.headers,
      payload: {
        vinculoId: v.id,
        seguradora: "Seguro",
        inicioVigencia: "2025-01-01",
        fimVigencia: "2024-01-01",
      },
    });
    expect(invalid.statusCode).toBe(422);
    const pendingDistrato = await f.app.inject({
      method: "POST",
      url: "/api/documentos",
      headers: f.headers,
      payload: {
        vinculoId: v.id,
        tipo: "DISTRATO",
        dataReferencia: "2026-01-15",
        status: "PENDENTE",
      },
    });
    expect(pendingDistrato.statusCode, pendingDistrato.body).toBe(201);
    expect(
      await f.db.vinculo.findUnique({ where: { id: v.id } }),
    ).toMatchObject({ status: "ATIVO", dataDesligamento: null });
    const distrato = await f.app.inject({
      method: "POST",
      url: "/api/documentos",
      headers: f.headers,
      payload: {
        vinculoId: v.id,
        tipo: "DISTRATO",
        dataReferencia: "2026-02-01",
        status: "VIGENTE",
      },
    });
    expect(distrato.statusCode, distrato.body).toBe(201);
    expect(
      await f.db.pessoa.findUnique({ where: { id: v.pessoaId } }),
    ).toMatchObject({ ativa: false });
    expect(
      await f.db.vinculo.findUnique({ where: { id: v.id } }),
    ).toMatchObject({
      status: "DESLIGADO",
      dataDesligamento: new Date("2026-02-01"),
    });
    const secondDistrato = await f.app.inject({
      method: "POST",
      url: "/api/documentos",
      headers: f.headers,
      payload: {
        vinculoId: v.id,
        tipo: "DISTRATO",
        dataReferencia: "2026-02-02",
        status: "VIGENTE",
      },
    });
    expect(secondDistrato.statusCode, secondDistrato.body).toBe(409);
    const genericCancel = await f.app.inject({
      method: "PUT",
      url: `/api/documentos/${distrato.json<{ id: string }>().id}`,
      headers: f.headers,
      payload: {
        vinculoId: v.id,
        tipo: "DISTRATO",
        numero: null,
        dataReferencia: "2026-02-01",
        inicioVigencia: null,
        fimVigencia: null,
        status: "CANCELADO",
        observacoes: null,
      },
    });
    expect(genericCancel.statusCode, genericCancel.body).toBe(409);
    const revert = await f.app.inject({
      method: "POST",
      url: `/api/documentos/${distrato.json<{ id: string }>().id}/reverter-distrato`,
      headers: f.headers,
      payload: { motivo: "Registro lançado em duplicidade" },
    });
    expect(revert.statusCode, revert.body).toBe(200);
    expect(
      await f.db.pessoa.findUnique({ where: { id: v.pessoaId } }),
    ).toMatchObject({ ativa: true });
    expect(
      await f.db.vinculo.findUnique({ where: { id: v.id } }),
    ).toMatchObject({
      status: "ATIVO",
      dataDesligamento: null,
    });
  } finally {
    await f.app.close();
  }
});
