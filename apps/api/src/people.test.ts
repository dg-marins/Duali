import { test, expect } from "vitest";
import { fixture } from "./test-helper.js";
test("authentication, CSRF, people, team history, uniqueness and revocation", async () => {
  const f = await fixture();
  try {
    expect((await f.app.inject("/api/pessoas")).statusCode).toBe(401);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/pessoas",
          headers: { cookie: f.headers.cookie, origin: f.headers.origin },
          payload: { nomeCompleto: "Pessoa" },
        })
      ).statusCode,
    ).toBe(403);
    const create = async (path: string, payload: unknown) => {
      const response = await f.app.inject({
        method: "POST",
        url: "/api/" + path,
        headers: f.headers,
        payload: JSON.stringify(payload),
      });
      expect(response.statusCode, response.body).toBe(201);
      return response.json<{ id: string }>();
    };
    const pessoa = await create("pessoas", {
      nomeCompleto: "Pessoa sintética " + f.suffix,
    });
    const unit = await create("unidades", {
      nome: "Unidade sintética",
      sigla: f.suffix.slice(0, 15),
      uf: "RJ",
    });
    const team = await create("equipes", { nome: "Equipe " + f.suffix });
    const vinculo = await create("vinculos", {
      pessoaId: pessoa.id,
      unidadeId: unit.id,
      equipeId: team.id,
      tipo: "CLT",
      dataAdmissao: "2020-02-29",
    });
    const apprentice = await create("vinculos", {
      pessoaId: pessoa.id,
      unidadeId: unit.id,
      tipo: "APRENDIZ",
      escala: "Segunda a quinta (rodízio)",
      dataAdmissao: "2026-01-01",
    });
    expect(
      (await f.db.vinculo.findUniqueOrThrow({ where: { id: apprentice.id } }))
        .escala,
    ).toBe("Segunda a quinta (rodízio)");
    expect(
      await f.db.vinculoEquipeHistorico.count({
        where: { vinculoId: vinculo.id },
      }),
    ).toBe(1);
    const audits = await f.db.auditoria.findMany({
      where: { entidadeId: pessoa.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.requestId).toBeTruthy();
    const duplicate = await f.app.inject({
      method: "POST",
      url: "/api/equipes",
      headers: f.headers,
      payload: { nome: "Equipe " + f.suffix },
    });
    expect(duplicate.statusCode).toBe(409);
    const before = await f.db.auditoria.count();
    const invalid = await f.app.inject({
      method: "POST",
      url: "/api/vinculos",
      headers: f.headers,
      payload: {
        pessoaId: pessoa.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: "2020-01-01",
        status: "DESLIGADO",
      },
    });
    expect(invalid.statusCode).toBe(422);
    expect(await f.db.auditoria.count()).toBe(before);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/auth/logout",
          headers: f.headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await f.app.inject({ url: "/api/pessoas", headers: f.headers }))
        .statusCode,
    ).toBe(401);
  } finally {
    await f.app.close();
  }
});
