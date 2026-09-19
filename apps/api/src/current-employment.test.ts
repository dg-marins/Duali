import { expect, test } from "vitest";
import { fixture } from "./test-helper.js";
import { currentEmployment } from "./modules/current-employment.js";
test("current employment excludes history and rejects ambiguity", () => {
  expect(currentEmployment([{ status: "DESLIGADO" }])).toBeNull();
  expect(
    currentEmployment([{ status: "DESLIGADO" }, { status: "AFASTADO" }]),
  ).toEqual({ status: "AFASTADO" });
  expect(() =>
    currentEmployment([{ status: "ATIVO" }, { status: "AFASTADO" }]),
  ).toThrow("Mais de um vínculo");
});
test("segments partition the population independently of selection and pagination", async () => {
  const f = await fixture();
  try {
    const unit = await f.db.unidade.create({
      data: { nome: f.suffix, sigla: f.suffix.slice(0, 12), uf: "RJ" },
    });
    const types = ["CLT", "ESTAGIO", "APRENDIZ", "TRAINEE"] as const;
    for (const [index, tipo] of types.entries()) {
      const person = await f.db.pessoa.create({
        data: { nomeCompleto: f.suffix + index },
      });
      await f.db.vinculo.create({
        data: {
          pessoaId: person.id,
          unidadeId: unit.id,
          tipo: "ESTAGIO",
          status: "DESLIGADO",
          dataAdmissao: new Date("2020-01-01"),
          dataDesligamento: new Date("2021-01-01"),
        },
      });
      await f.db.vinculo.create({
        data: {
          pessoaId: person.id,
          unidadeId: unit.id,
          tipo,
          status: index === 0 ? "AFASTADO" : "ATIVO",
          dataAdmissao: new Date("2024-01-01"),
        },
      });
    }
    const historical = await f.db.pessoa.create({
      data: { nomeCompleto: f.suffix + "historical" },
    });
    await f.db.vinculo.create({
      data: {
        pessoaId: historical.id,
        unidadeId: unit.id,
        tipo: "CLT",
        status: "DESLIGADO",
        dataAdmissao: new Date("2020-01-01"),
        dataDesligamento: new Date("2021-01-01"),
      },
    });
    await f.db.pessoa.create({
      data: { nomeCompleto: f.suffix + "standalone" },
    });
    const query = async (extra = "") => {
      const response = await f.app.inject({
        url: "/api/pessoas-operacional?q=" + f.suffix + extra,
        headers: f.headers,
      });
      expect(response.statusCode, response.body).toBe(200);
      return response.json<{
        items: Array<{ id: string; vinculo: string | null; unidade: unknown }>;
        total: number;
        totalPopulacao: number;
        segmentos: Record<string, number>;
      }>();
    };
    const all = await query();
    expect(all.total).toBe(6);
    expect(all.segmentos).toEqual({
      CLT: 1,
      ESTAGIO: 1,
      APRENDIZ: 1,
      TRAINEE: 1,
      SEM_VINCULO: 1,
      INATIVO: 1,
    });
    for (const tipo of types) {
      const selected = await query("&tipo=" + tipo + "&pageSize=1");
      expect(selected.total).toBe(1);
      expect(selected.segmentos).toEqual(all.segmentos);
      expect(selected.items[0]?.vinculo).toBe(tipo);
    }
    const none = await query("&tipo=SEM_VINCULO");
    expect(
      none.items.every(
        (item) => item.vinculo === null && item.unidade === null,
      ),
    ).toBe(true);
    const filtered = await query("&unidadeId=" + unit.id);
    expect(filtered.total).toBe(4);
    expect(Object.values(filtered.segmentos).reduce((a, b) => a + b, 0)).toBe(
      4,
    );
    const invalid = await f.app.inject({
      method: "POST",
      url: "/api/vinculos",
      headers: f.headers,
      payload: {
        pessoaId: historical.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: "2025-01-01",
      },
    });
    expect(invalid.statusCode).toBe(201);
    const duplicate = await f.app.inject({
      method: "POST",
      url: "/api/vinculos",
      headers: f.headers,
      payload: {
        pessoaId: historical.id,
        unidadeId: unit.id,
        tipo: "ESTAGIO",
        dataAdmissao: "2026-01-01",
      },
    });
    expect(duplicate.statusCode).toBe(409);
  } finally {
    await f.app.close();
  }
});
test("multiunit configuration is atomic and preserves existing inactive associations", async () => {
  const f = await fixture();
  try {
    const units = await Promise.all(
      [0, 1].map((i) =>
        f.db.unidade.create({
          data: {
            nome: f.suffix + i,
            sigla: f.suffix.slice(0, 10) + i,
            uf: "RJ",
          },
        }),
      ),
    );
    const supplier = await f.db.fornecedor.create({ data: { nome: f.suffix } });
    const existing = await f.db.configuracaoBeneficio.create({
      data: {
        unidadeId: units[0]!.id,
        fornecedorId: supplier.id,
        tipo: "ALIMENTACAO",
        ativa: false,
      },
    });
    const payload = {
      tipo: "ALIMENTACAO",
      fornecedorId: supplier.id,
      unidadeIds: units.map((unit) => unit.id),
    };
    for (let i = 0; i < 2; i++) {
      const response = await f.app.inject({
        method: "POST",
        url: "/api/configuracoes-beneficios/multiunidade",
        headers: f.headers,
        payload,
      });
      expect(response.statusCode, response.body).toBe(200);
    }
    expect(
      await f.db.configuracaoBeneficio.count({
        where: { fornecedorId: supplier.id },
      }),
    ).toBe(2);
    expect(
      (
        await f.db.configuracaoBeneficio.findUniqueOrThrow({
          where: { id: existing.id },
        })
      ).ativa,
    ).toBe(false);
    const invalid = await f.app.inject({
      method: "POST",
      url: "/api/configuracoes-beneficios/multiunidade",
      headers: f.headers,
      payload: {
        ...payload,
        tipo: "TRANSPORTE",
        unidadeIds: [units[0]!.id, f.suffix],
      },
    });
    expect(invalid.statusCode).toBe(422);
    expect(
      await f.db.configuracaoBeneficio.count({
        where: { fornecedorId: supplier.id, tipo: "TRANSPORTE" },
      }),
    ).toBe(0);
  } finally {
    await f.app.close();
  }
});
