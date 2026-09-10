import { test, expect } from "vitest";
import { fixture } from "./test-helper.js";
import { benefitCalculation } from "./modules/benefits.js";
test("benefit amounts use decimal arithmetic and retain discrepancies", () => {
  const result = benefitCalculation({
    quantidadeDias: "3",
    valorUnitario: ".10",
    valorInformado: ".50",
    ajustes: [{ tipo: "CREDITO", valor: ".05" }],
  });
  expect(result.valorBaseCalculado).toBe("0.30");
  expect(result.totalAjustes).toBe("0.05");
  expect(result.valorFinal).toBe("0.35");
  expect(result.valorCalculado).toBe("0.30");
  expect(result.divergencia).toBe("0.15");
});
test("unit configuration supports multiple monthly components and rejects incompatible unit", async () => {
  const f = await fixture();
  try {
    const p = await f.db.pessoa.create({
      data: { nomeCompleto: "Pessoa benefícios" },
    });
    const unit = await f.db.unidade.create({
      data: { nome: "Unidade", sigla: f.suffix, uf: "DF" },
    });
    const v = await f.db.vinculo.create({
      data: {
        pessoaId: p.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-01"),
      },
    });
    const provider = await f.db.fornecedor.create({ data: { nome: f.suffix } });
    const config = await f.db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: provider.id,
        tipo: "TRANSPORTE",
      },
    });
    const benefit = await f.db.beneficioVinculo.create({
      data: {
        vinculoId: v.id,
        tipo: "TRANSPORTE",
        inicioVigencia: new Date("2025-01-01"),
      },
    });
    for (const componente of ["Ônibus", "Metrô"]) {
      const r = await f.app.inject({
        method: "POST",
        url: "/api/competencias",
        headers: f.headers,
        payload: {
          beneficioVinculoId: benefit.id,
          configuracaoId: config.id,
          componente,
          competencia: "2025-02-01",
          quantidadeDias: 20,
          valorUnitario: 5,
          valorInformado: 101,
        },
      });
      expect(r.statusCode, r.body).toBe(201);
    }
    expect(
      await f.db.beneficioCompetencia.count({
        where: { beneficioVinculoId: benefit.id },
      }),
    ).toBe(2);
    const invalid = await f.app.inject({
      method: "POST",
      url: "/api/competencias",
      headers: f.headers,
      payload: {
        beneficioVinculoId: benefit.id,
        configuracaoId: config.id,
        componente: "Outro",
        competencia: "2025-02-01",
        quantidadeDias: 20,
        quantidade: 1,
      },
    });
    expect(invalid.statusCode).toBe(422);
  } finally {
    await f.app.close();
  }
});
test("benefit closing is scoped by month and unit and requires audited reopening", async () => {
  const f = await fixture();
  try {
    const person = await f.db.pessoa.create({
      data: { nomeCompleto: "Pessoa fechamento" },
    });
    const unit = await f.db.unidade.create({
      data: { nome: "Unidade fechamento", sigla: f.suffix, uf: "RJ" },
    });
    const link = await f.db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-01"),
      },
    });
    const provider = await f.db.fornecedor.create({
      data: { nome: `Fornecedor ${f.suffix}` },
    });
    const config = await f.db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: provider.id,
        tipo: "TRANSPORTE",
      },
    });
    const benefit = await f.db.beneficioVinculo.create({
      data: {
        vinculoId: link.id,
        tipo: "TRANSPORTE",
        inicioVigencia: new Date("2025-01-01"),
      },
    });
    const create = await f.app.inject({
      method: "POST",
      url: "/api/beneficios/fechamentos",
      headers: f.headers,
      payload: { unidadeId: unit.id, competencia: "2025-02-01" },
    });
    expect(create.statusCode, create.body).toBe(201);
    const closing = create.json<{ id: string }>();
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: `/api/beneficios/fechamentos/${closing.id}/revisar`,
          headers: f.headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: `/api/beneficios/fechamentos/${closing.id}/fechar`,
          headers: f.headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    const blocked = await f.app.inject({
      method: "POST",
      url: "/api/competencias",
      headers: f.headers,
      payload: {
        beneficioVinculoId: benefit.id,
        configuracaoId: config.id,
        componente: "Principal",
        competencia: "2025-02-01",
        quantidade: 1,
        valorUnitario: 10,
      },
    });
    expect(blocked.statusCode).toBe(409);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: `/api/beneficios/fechamentos/${closing.id}/reabrir`,
          headers: f.headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: `/api/beneficios/fechamentos/${closing.id}/reabrir`,
          headers: f.headers,
          payload: { motivo: "Correção operacional" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/competencias",
          headers: f.headers,
          payload: {
            beneficioVinculoId: benefit.id,
            configuracaoId: config.id,
            componente: "Principal",
            competencia: "2025-02-01",
            quantidade: 1,
            valorUnitario: 10,
          },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      await f.db.auditoria.count({
        where: {
          acao: "REABRIR_COMPETENCIA_BENEFICIO",
          entidadeId: closing.id,
        },
      }),
    ).toBe(1);
  } finally {
    await f.app.close();
  }
});

test("structured transport snapshots calculate by card and conduction with Decimal arithmetic", async () => {
  const f = await fixture();
  try {
    const person = await f.db.pessoa.create({
      data: { nomeCompleto: "Pessoa transporte" },
    });
    const unit = await f.db.unidade.create({
      data: {
        nome: "Unidade transporte",
        sigla: f.suffix.slice(0, 8),
        uf: "RJ",
      },
    });
    const link = await f.db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-01"),
      },
    });
    const supplier = await f.db.fornecedor.create({
      data: { nome: `Fornecedor transporte ${f.suffix}` },
    });
    const config = await f.db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: supplier.id,
        tipo: "TRANSPORTE",
      },
    });
    const benefit = await f.db.beneficioVinculo.create({
      data: {
        vinculoId: link.id,
        tipo: "TRANSPORTE",
        inicioVigencia: new Date("2025-01-01"),
      },
    });
    const cards = await f.db.cartaoTransporte.findMany({
      where: { nome: { in: ["RioCard", "JAÉ"] } },
    });
    const rio = cards.find((card) => card.nome === "RioCard")!;
    const jae = cards.find((card) => card.nome === "JAÉ")!;
    const items = await f.app.inject({
      method: "PUT",
      url: `/api/beneficios-vinculo/${benefit.id}/transporte`,
      headers: f.headers,
      payload: {
        items: [
          {
            tipoConducao: "ONIBUS",
            cartaoTransporteId: rio.id,
            valorDiario: 11.2,
            inicioVigencia: "2026-01-01",
          },
          {
            tipoConducao: "BARCA",
            cartaoTransporteId: rio.id,
            valorDiario: 9.4,
            inicioVigencia: "2026-01-01",
          },
          {
            tipoConducao: "METRO",
            cartaoTransporteId: jae.id,
            valorDiario: 15.8,
            inicioVigencia: "2026-01-01",
          },
        ],
      },
    });
    expect(items.statusCode, items.body).toBe(200);
    const response = await f.app.inject({
      method: "POST",
      url: "/api/competencias-transporte",
      headers: f.headers,
      payload: {
        beneficioVinculoId: benefit.id,
        configuracaoId: config.id,
        competencia: "2026-01-01",
        quantidadeDias: 22,
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json<{
      transporteTotalDiario: string;
      transporteTotalMensal: string;
      transportePorCartaoDiario: Record<string, string>;
      transportePorCartaoMensal: Record<string, string>;
      transportePorConducaoDiario: Record<string, string>;
    }>();
    expect(result.transporteTotalDiario).toBe("36.40");
    expect(result.transporteTotalMensal).toBe("800.80");
    expect(result.transportePorCartaoDiario.RioCard).toBe("20.60");
    expect(result.transportePorCartaoMensal.RioCard).toBe("453.20");
    expect(result.transportePorCartaoMensal["JAÉ"]).toBe("347.60");
    expect(result.transportePorConducaoDiario.ONIBUS).toBe("11.20");
    expect(
      await f.db.auditoria.count({
        where: { entidade: "beneficioTransporteItem" },
      }),
    ).toBeGreaterThanOrEqual(3);
  } finally {
    await f.app.close();
  }
});
