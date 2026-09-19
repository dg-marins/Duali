import { test, expect } from "vitest";
import { fixture } from "./test-helper.js";
import { benefitCalculation } from "./modules/benefits.js";
import { beneficioLoteSchema } from "@duali/shared";

test("batch validation keeps missing monetary values explicit and accepts Brazilian decimals", () => {
  const base = {
    unidadeId: "11111111-1111-4111-8111-111111111111",
    tipo: "ALIMENTACAO" as const,
    competencia: "2026-09-01",
    configuracaoId: "22222222-2222-4222-8222-222222222222",
    itens: [
      {
        vinculoId: "33333333-3333-4333-8333-333333333333",
        quantidadeDias: "22",
      },
    ],
  };
  expect(
    beneficioLoteSchema.safeParse({
      ...base,
      itens: [{ ...base.itens[0], valorDiario: "" }],
    }).success,
  ).toBe(false);
  const parsed = beneficioLoteSchema.parse({
    ...base,
    itens: [{ ...base.itens[0], valorDiario: "10,50" }],
  });
  expect(parsed.itens[0]?.valorDiario).toBe(10.5);
});

test("batch options keep simultaneous benefits visible and exclude inactive suppliers", async () => {
  const f = await fixture();
  try {
    const unit = await f.db.unidade.create({
      data: {
        nome: `Unidade lote ${f.suffix}`,
        sigla: f.suffix.slice(0, 8),
        uf: "RJ",
      },
    });
    const person = await f.db.pessoa.create({
      data: { nomeCompleto: `Pessoa lote ${f.suffix}` },
    });
    const link = await f.db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-01"),
      },
    });
    const active = await f.db.fornecedor.create({
      data: { nome: `Ativo ${f.suffix}` },
    });
    const inactive = await f.db.fornecedor.create({
      data: { nome: `Inativo ${f.suffix}`, ativo: false },
    });
    await Promise.all(
      [active, inactive].map((supplier) =>
        f.db.configuracaoBeneficio.create({
          data: {
            unidadeId: unit.id,
            fornecedorId: supplier.id,
            tipo: "ALIMENTACAO",
          },
        }),
      ),
    );
    await f.db.beneficioVinculo.createMany({
      data: [
        {
          vinculoId: link.id,
          tipo: "ALIMENTACAO",
          inicioVigencia: new Date("2026-08-01"),
        },
        {
          vinculoId: link.id,
          tipo: "ALIMENTACAO",
          inicioVigencia: new Date("2026-09-01"),
        },
      ],
    });
    const response = await f.app.inject({
      method: "GET",
      url: `/api/beneficios/lote/opcoes?unidadeId=${unit.id}&tipo=ALIMENTACAO&competencia=2026-09-01`,
      headers: f.headers,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      vinculos: Array<{ beneficios: unknown[] }>;
      configuracoes: Array<{ fornecedorId: string }>;
    }>();
    expect(
      body.vinculos.find((row) => row.beneficios.length === 2),
    ).toBeDefined();
    expect(body.configuracoes.map((row) => row.fornecedorId)).toEqual([
      active.id,
    ]);
  } finally {
    await f.app.close();
  }
});

test("benefit closure preserves the enrollment and records an audit trail", async () => {
  const f = await fixture();
  try {
    const person = await f.db.pessoa.create({
      data: { nomeCompleto: `Pessoa encerramento ${f.suffix}` },
    });
    const unit = await f.db.unidade.create({
      data: {
        nome: `Unidade encerramento ${f.suffix}`,
        sigla: f.suffix.slice(0, 8),
        uf: "RJ",
      },
    });
    const link = await f.db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: new Date("2026-01-01"),
      },
    });
    const benefit = await f.db.beneficioVinculo.create({
      data: {
        vinculoId: link.id,
        tipo: "ALIMENTACAO",
        inicioVigencia: new Date("2026-01-01"),
        status: "ATIVO",
      },
    });

    const response = await f.app.inject({
      method: "POST",
      url: `/api/beneficios-vinculo/${benefit.id}/encerrar`,
      headers: f.headers,
      payload: { fimVigencia: "2026-03-31", motivo: "Fim da elegibilidade" },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(
      await f.db.beneficioVinculo.findUniqueOrThrow({
        where: { id: benefit.id },
      }),
    ).toMatchObject({
      status: "ENCERRADO",
      fimVigencia: new Date("2026-03-31T00:00:00.000Z"),
    });
    expect(
      await f.db.auditoria.count({
        where: {
          entidade: "beneficioVinculo",
          entidadeId: benefit.id,
          acao: "ENCERRAR_BENEFICIO",
        },
      }),
    ).toBe(1);
  } finally {
    await f.app.close();
  }
});
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
test("transport adjustment requires an explicit distribution that totals the adjustment", async () => {
  const f = await fixture();
  try {
    const person = await f.db.pessoa.create({
      data: { nomeCompleto: "Pessoa ajuste transporte" },
    });
    const unit = await f.db.unidade.create({
      data: { nome: "Unidade ajuste", sigla: f.suffix.slice(0, 8), uf: "RJ" },
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
      data: { nome: `Fornecedor ajuste ${f.suffix}` },
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
    const competence = await f.db.beneficioCompetencia.create({
      data: {
        beneficioVinculoId: benefit.id,
        configuracaoId: config.id,
        competencia: new Date("2026-09-01"),
        quantidadeDias: 22,
      },
    });
    const snapshot = await f.db.beneficioTransporteCompetenciaItem.create({
      data: {
        competenciaId: competence.id,
        tipoConducao: "ONIBUS",
        fornecedorId: supplier.id,
        valorDiario: "10.00",
      },
    });
    const invalid = await f.app.inject({
      method: "POST",
      url: "/api/ajustes-beneficios/distribuido",
      headers: f.headers,
      payload: {
        competenciaId: competence.id,
        tipo: "CREDITO",
        valor: "10,00",
        motivo: "Complemento",
        distribuicoes: [
          { transporteCompetenciaItemId: snapshot.id, valor: "9,00" },
        ],
      },
    });
    expect(invalid.statusCode).toBe(422);
    const created = await f.app.inject({
      method: "POST",
      url: "/api/ajustes-beneficios/distribuido",
      headers: f.headers,
      payload: {
        competenciaId: competence.id,
        tipo: "CREDITO",
        valor: "10,00",
        motivo: "Complemento",
        distribuicoes: [
          { transporteCompetenciaItemId: snapshot.id, valor: "10,00" },
        ],
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(
      await f.db.beneficioAjusteTransporteItem.count({
        where: { ajusteId: created.json<{ id: string }>().id },
      }),
    ).toBe(1);
  } finally {
    await f.app.close();
  }
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

test("structured transport snapshots calculate by supplier and conduction with Decimal arithmetic", async () => {
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
    const secondSupplier = await f.db.fornecedor.create({
      data: { nome: `Segundo fornecedor transporte ${f.suffix}` },
    });
    const config = await f.db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: supplier.id,
        tipo: "TRANSPORTE",
      },
    });
    await f.db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: secondSupplier.id,
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
    const items = await f.app.inject({
      method: "PUT",
      url: `/api/beneficios-vinculo/${benefit.id}/transporte`,
      headers: f.headers,
      payload: {
        items: [
          {
            tipoConducao: "ONIBUS",
            fornecedorId: supplier.id,
            valorDiario: 11.2,
            inicioVigencia: "2026-01-01",
          },
          {
            tipoConducao: "BARCA",
            fornecedorId: supplier.id,
            valorDiario: 9.4,
            inicioVigencia: "2026-01-01",
          },
          {
            tipoConducao: "METRO",
            fornecedorId: secondSupplier.id,
            valorDiario: 15.8,
            inicioVigencia: "2026-01-01",
          },
          {
            tipoConducao: "TREM",
            fornecedorId: supplier.id,
            valorDiario: 5,
            inicioVigencia: "2027-01-01",
          },
        ],
      },
    });
    expect(items.statusCode, items.body).toBe(200);
    expect(
      await f.db.beneficioTransporteItem.count({
        where: { beneficioVinculoId: benefit.id, tipoConducao: "TREM" },
      }),
    ).toBe(1);
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
      transportePorConducaoDiario: Record<string, string>;
      transportePorFornecedorDiario: Record<string, string>;
      transportePorFornecedorMensal: Record<string, string>;
    }>();
    expect(result.transporteTotalDiario).toBe("36.40");
    expect(result.transporteTotalMensal).toBe("800.80");
    expect(result.transportePorConducaoDiario.ONIBUS).toBe("11.20");
    expect(result.transportePorFornecedorDiario[supplier.nome]).toBe("20.60");
    expect(result.transportePorFornecedorMensal[supplier.nome]).toBe("453.20");
    expect(result.transportePorFornecedorDiario[secondSupplier.nome]).toBe(
      "15.80",
    );
    expect(result.transportePorFornecedorMensal[secondSupplier.nome]).toBe(
      "347.60",
    );
    expect(
      await f.db.auditoria.count({
        where: { entidade: "beneficioTransporteItem" },
      }),
    ).toBeGreaterThanOrEqual(3);
    const beforeAtomicAttempt = await f.db.beneficioVinculo.count({
      where: { vinculoId: link.id, tipo: "TRANSPORTE" },
    });
    const failedAtomicConfiguration = await f.app.inject({
      method: "POST",
      url: "/api/configuracoes-transporte",
      headers: f.headers,
      payload: {
        beneficio: {
          vinculoId: link.id,
          tipo: "TRANSPORTE",
          inicioVigencia: "2027-01-01",
          status: "ATIVO",
        },
        items: [
          {
            tipoConducao: "ONIBUS",
            fornecedorId: "11111111-1111-4111-8111-111111111111",
            valorDiario: 10,
            inicioVigencia: "2027-01-01",
            ativo: true,
          },
        ],
      },
    });
    expect(failedAtomicConfiguration.statusCode).toBe(422);
    expect(
      await f.db.beneficioVinculo.count({
        where: { vinculoId: link.id, tipo: "TRANSPORTE" },
      }),
    ).toBe(beforeAtomicAttempt);
  } finally {
    await f.app.close();
  }
});

test("monthly acquisition reserves, confirms partially and preserves reversals", async () => {
  const f = await fixture();
  try {
    const pessoa = await f.db.pessoa.create({
      data: { nomeCompleto: "Pessoa aquisição" },
    });
    const unidade = await f.db.unidade.create({
      data: {
        nome: "Unidade aquisição",
        sigla: f.suffix.slice(0, 8),
        uf: "RJ",
      },
    });
    const vinculo = await f.db.vinculo.create({
      data: {
        pessoaId: pessoa.id,
        unidadeId: unidade.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-01"),
      },
    });
    const fornecedor = await f.db.fornecedor.create({
      data: { nome: `Fornecedor aquisição ${f.suffix}` },
    });
    const config = await f.db.configuracaoBeneficio.create({
      data: {
        unidadeId: unidade.id,
        fornecedorId: fornecedor.id,
        tipo: "ALIMENTACAO",
      },
    });
    await f.db.beneficioVinculo.create({
      data: {
        vinculoId: vinculo.id,
        tipo: "ALIMENTACAO",
        inicioVigencia: new Date("2025-01-01"),
        configuracaoRecorrenteId: config.id,
        valorDiario: "25.50",
      },
    });
    const prepared = await f.app.inject({
      method: "POST",
      url: "/api/aquisicoes-beneficios/preparar",
      headers: f.headers,
      payload: {
        unidadeId: unidade.id,
        competencia: "2026-02-01",
        diasAlimentacao: 20,
      },
    });
    expect(prepared.statusCode, prepared.body).toBe(200);
    expect(prepared.json<{ criadas: number }>().criadas).toBe(1);
    const readinessAfterPreparation = await f.app.inject({
      method: "GET",
      url: `/api/aquisicoes-beneficios/prontidao?unidadeId=${unidade.id}&competencia=2026-02-01`,
      headers: f.headers,
    });
    expect(
      readinessAfterPreparation.statusCode,
      readinessAfterPreparation.body,
    ).toBe(200);
    expect(
      readinessAfterPreparation
        .json<Array<{ tipo: string; estado: string }>>()
        .find((item) => item.tipo === "ALIMENTACAO")?.estado,
    ).toBe("PREPARADA");
    const repeat = await f.app.inject({
      method: "POST",
      url: "/api/aquisicoes-beneficios/preparar",
      headers: f.headers,
      payload: {
        unidadeId: unidade.id,
        competencia: "2026-02-01",
        diasAlimentacao: 20,
      },
    });
    expect(repeat.json<{ criadas: number }>().criadas).toBe(0);
    const previous = await f.app.inject({
      method: "GET",
      url: `/api/aquisicoes-beneficios/previa?unidadeId=${unidade.id}&competencia=2026-02-01`,
      headers: f.headers,
    });
    const row = previous.json<Array<{ id: string; previsto: string }>>()[0]!;
    expect(row.previsto).toBe("510.00");
    const summaryUrl = `/api/beneficios/resumo?unidadeId=${unidade.id}&competencia=2026-02-01`;
    const initialSummary = await f.app.inject({
      method: "GET",
      url: summaryUrl,
      headers: f.headers,
    });
    expect(initialSummary.statusCode, initialSummary.body).toBe(200);
    expect(initialSummary.json()).toMatchObject({
      previsto: "510.00",
      compradoLiquido: "0.00",
      emPedido: "0.00",
      lancamentosPendentes: 1,
    });
    const order = await f.app.inject({
      method: "POST",
      url: "/api/aquisicoes-beneficios",
      headers: f.headers,
      payload: {
        unidadeId: unidade.id,
        competencia: "2026-02-01",
        tipo: "ALIMENTACAO",
        fornecedorId: fornecedor.id,
        itens: [{ competenciaId: row.id, valor: 500 }],
      },
    });
    expect(order.statusCode, order.body).toBe(201);
    const reservedSummary = await f.app.inject({
      method: "GET",
      url: summaryUrl,
      headers: f.headers,
    });
    expect(reservedSummary.json()).toMatchObject({ emPedido: "500.00" });
    const itemId = order.json<{ itens: Array<{ id: string }> }>().itens[0]!.id;
    const confirmed = await f.app.inject({
      method: "POST",
      url: `/api/aquisicoes-beneficios/${order.json<{ id: string }>().id}/confirmar`,
      headers: f.headers,
      payload: {
        dataCompra: "2026-02-01",
        itens: [
          {
            itemId,
            valor: 450,
            status: "CONFIRMADO",
            motivo: "Crédito parcial confirmado pela operadora",
          },
        ],
      },
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const readinessAfterPartialPurchase = await f.app.inject({
      method: "GET",
      url: `/api/aquisicoes-beneficios/prontidao?unidadeId=${unidade.id}&competencia=2026-02-01`,
      headers: f.headers,
    });
    expect(
      readinessAfterPartialPurchase
        .json<Array<{ tipo: string; estado: string }>>()
        .find((item) => item.tipo === "ALIMENTACAO")?.estado,
    ).toBe("COMPRA_PARCIAL");
    const reversed = await f.app.inject({
      method: "POST",
      url: `/api/aquisicoes-beneficios/itens/${itemId}/reverter`,
      headers: f.headers,
      payload: { valor: 50, data: "2026-02-03", motivo: "Crédito devolvido" },
    });
    expect(reversed.statusCode, reversed.body).toBe(200);
    const after = await f.app.inject({
      method: "GET",
      url: `/api/aquisicoes-beneficios/previa?unidadeId=${unidade.id}&competencia=2026-02-01`,
      headers: f.headers,
    });
    const final =
      after.json<Array<{ compradoLiquido: string; disponivel: string }>>()[0]!;
    expect(final.compradoLiquido).toBe("400.00");
    expect(final.disponivel).toBe("60.00");
    const finalSummary = await f.app.inject({
      method: "GET",
      url: summaryUrl,
      headers: f.headers,
    });
    expect(finalSummary.json()).toMatchObject({
      previsto: "510.00",
      compradoLiquido: "400.00",
      emPedido: "50.00",
      lancamentosPendentes: 1,
    });
    const purchasedDetails = await f.app.inject({
      method: "GET",
      url: `/api/beneficios-operacional?unidadeId=${unidade.id}&competencia=2026-02&visao=comprado`,
      headers: f.headers,
    });
    expect(purchasedDetails.json<{ total: number }>().total).toBe(1);
    expect(
      await f.db.auditoria.count({ where: { entidade: "aquisicaoBeneficio" } }),
    ).toBeGreaterThanOrEqual(2);
  } finally {
    await f.app.close();
  }
});

test("batch benefit registration preserves history without creating a monthly competence", async () => {
  const f = await fixture();
  try {
    const pessoa = await f.db.pessoa.create({
      data: { nomeCompleto: "Pessoa lote" },
    });
    const unidade = await f.db.unidade.create({
      data: { nome: "Unidade lote", sigla: f.suffix.slice(0, 8), uf: "RJ" },
    });
    const vinculo = await f.db.vinculo.create({
      data: {
        pessoaId: pessoa.id,
        unidadeId: unidade.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-01"),
      },
    });
    const fornecedor = await f.db.fornecedor.create({
      data: { nome: `Fornecedor lote ${f.suffix}` },
    });
    const configuracao = await f.db.configuracaoBeneficio.create({
      data: {
        unidadeId: unidade.id,
        fornecedorId: fornecedor.id,
        tipo: "CESTA_BASICA",
      },
    });
    const first = await f.app.inject({
      method: "POST",
      url: "/api/beneficios/lote",
      headers: f.headers,
      payload: {
        unidadeId: unidade.id,
        tipo: "CESTA_BASICA",
        competencia: "2026-09-01",
        configuracaoId: configuracao.id,
        itens: [{ vinculoId: vinculo.id, quantidade: 2, valorUnitario: 50 }],
      },
    });
    expect(first.statusCode, first.body).toBe(201);
    const repeat = await f.app.inject({
      method: "POST",
      url: "/api/beneficios/lote",
      headers: f.headers,
      payload: {
        unidadeId: unidade.id,
        tipo: "CESTA_BASICA",
        competencia: "2026-09-01",
        configuracaoId: configuracao.id,
        itens: [{ vinculoId: vinculo.id, quantidade: 3, valorUnitario: 50 }],
      },
    });
    expect(repeat.statusCode, repeat.body).toBe(201);
    const benefits = await f.db.beneficioVinculo.findMany({
      where: { vinculoId: vinculo.id },
    });
    expect(benefits).toHaveLength(1);
    const competence = await f.db.beneficioCompetencia.findFirst({
      where: {
        beneficioVinculoId: benefits[0]!.id,
        competencia: new Date("2026-09-01"),
      },
    });
    expect(competence).toBeNull();
    expect(benefits[0]!.quantidadeRecorrente?.toFixed(2)).toBe("3.00");
    const next = await f.app.inject({
      method: "POST",
      url: "/api/beneficios/lote",
      headers: f.headers,
      payload: {
        unidadeId: unidade.id,
        tipo: "CESTA_BASICA",
        competencia: "2026-10-01",
        configuracaoId: configuracao.id,
        itens: [{ vinculoId: vinculo.id, quantidade: 1, valorUnitario: 75 }],
      },
    });
    expect(next.statusCode, next.body).toBe(201);
    expect(
      await f.db.beneficioVinculo.count({ where: { vinculoId: vinculo.id } }),
    ).toBe(2);
    expect(
      await f.db.auditoria.count({
        where: { acao: "CADASTRAR_BENEFICIO_EM_LOTE" },
      }),
    ).toBeGreaterThanOrEqual(2);
  } finally {
    await f.app.close();
  }
});

test("monthly order creates the technical benefit and fixed food snapshot idempotently", async () => {
  const f = await fixture();
  try {
    const person = await f.db.pessoa.create({
      data: { nomeCompleto: "Pedido mensal" },
    });
    const unit = await f.db.unidade.create({
      data: { nome: "Unidade pedido", sigla: f.suffix.slice(0, 8), uf: "RJ" },
    });
    const link = await f.db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-01"),
      },
    });
    const excludedPerson = await f.db.pessoa.create({
      data: { nomeCompleto: "Z Pessoa não incluída" },
    });
    const excludedLink = await f.db.vinculo.create({
      data: {
        pessoaId: excludedPerson.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-01"),
      },
    });
    const supplier = await f.db.fornecedor.create({
      data: { nome: `Fornecedor pedido ${f.suffix}` },
    });
    const configuration = await f.db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: supplier.id,
        tipo: "ALIMENTACAO",
      },
    });
    const preview = await f.app.inject({
      method: "GET",
      url: `/api/aquisicoes-beneficios/pedido/previa?unidadeId=${unit.id}&competencia=2026-09-01&tipo=ALIMENTACAO`,
      headers: f.headers,
    });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(
      preview
        .json<
          Array<{
            vinculoId: string;
            referenciaStatus: string;
            incluirAutomaticamente: boolean;
          }>
        >()
        .find((row) => row.vinculoId === link.id),
    ).toMatchObject({
      vinculoId: link.id,
      referenciaStatus: "NOVA_AQUISICAO",
      incluirAutomaticamente: true,
    });
    expect(
      preview
        .json<Array<{ vinculoId: string; incluirAutomaticamente: boolean }>>()
        .find((row) => row.vinculoId === excludedLink.id),
    ).toMatchObject({ incluirAutomaticamente: true });
    const payload = {
      unidadeId: unit.id,
      competencia: "2026-09-01",
      tipo: "ALIMENTACAO",
      itens: [
        {
          vinculoId: link.id,
          configuracaoId: configuration.id,
          incluir: true,
          modoAlimentacao: "VALOR_MENSAL",
          quantidadeDias: 21,
          valorUnitario: "33.33",
          valorSolicitado: "700.00",
        },
        { vinculoId: excludedLink.id, incluir: false },
      ],
    };
    const headers = { ...f.headers, "idempotency-key": `pedido-${f.suffix}` };
    const created = await f.app.inject({
      method: "POST",
      url: "/api/aquisicoes-beneficios/pedido/gerar",
      headers,
      payload,
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json<{ pedidos: number }>().pedidos).toBe(1);
    const repeat = await f.app.inject({
      method: "POST",
      url: "/api/aquisicoes-beneficios/pedido/gerar",
      headers,
      payload,
    });
    expect(repeat.statusCode, repeat.body).toBe(201);
    expect(
      await f.db.aquisicaoBeneficio.count({ where: { unidadeId: unit.id } }),
    ).toBe(1);
    const competence = await f.db.beneficioCompetencia.findFirstOrThrow({
      where: {
        competencia: new Date("2026-09-01"),
        beneficioVinculo: { vinculoId: link.id, tipo: "ALIMENTACAO" },
      },
    });
    expect(competence.valorMensalBase?.toFixed(2)).toBe("700.00");
    expect(
      await f.db.beneficioVinculo.count({
        where: { vinculoId: link.id, tipo: "ALIMENTACAO" },
      }),
    ).toBe(1);
    const newcomer = await f.db.pessoa.create({
      data: { nomeCompleto: "Nova colaboradora" },
    });
    const newcomerLink = await f.db.vinculo.create({
      data: {
        pessoaId: newcomer.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: new Date("2026-10-01"),
      },
    });
    const nextMonth = await f.app.inject({
      method: "GET",
      url: `/api/aquisicoes-beneficios/pedido/previa?unidadeId=${unit.id}&competencia=2026-10-01&tipo=ALIMENTACAO`,
      headers: f.headers,
    });
    expect(nextMonth.statusCode, nextMonth.body).toBe(200);
    expect(
      nextMonth
        .json<
          Array<{
            vinculoId: string;
            incluirAutomaticamente: boolean;
            referenciaAnterior: string;
            valorSugerido: string;
          }>
        >()
        .find((row) => row.vinculoId === link.id),
    ).toMatchObject({
      incluirAutomaticamente: true,
      referenciaAnterior: "700.00",
      valorSugerido: "700.00",
    });
    expect(
      nextMonth
        .json<Array<{ vinculoId: string; incluirAutomaticamente: boolean }>>()
        .find((row) => row.vinculoId === excludedLink.id),
    ).toMatchObject({ incluirAutomaticamente: false });
    expect(
      nextMonth
        .json<
          Array<{
            vinculoId: string;
            incluirAutomaticamente: boolean;
            referenciaStatus: string;
          }>
        >()
        .find((row) => row.vinculoId === newcomerLink.id),
    ).toMatchObject({
      incluirAutomaticamente: true,
      referenciaStatus: "NOVA_AQUISICAO",
    });
    const originalOrderId = created.json<{ ids: string[] }>().ids[0]!;
    const blocked = await f.app.inject({
      method: "POST",
      url: "/api/aquisicoes-beneficios/pedido/gerar",
      headers: { ...f.headers, "idempotency-key": `bloqueado-${f.suffix}` },
      payload,
    });
    expect(blocked.statusCode).toBe(409);
    const cancelled = await f.app.inject({
      method: "POST",
      url: `/api/aquisicoes-beneficios/${originalOrderId}/cancelar`,
      headers: { ...f.headers, "idempotency-key": `cancelar-${f.suffix}` },
      payload: {},
    });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect(cancelled.json<{ status: string }>().status).toBe("CANCELADA");
    const cancelledAgain = await f.app.inject({
      method: "POST",
      url: `/api/aquisicoes-beneficios/${originalOrderId}/cancelar`,
      headers: { ...f.headers, "idempotency-key": `cancelar-${f.suffix}` },
      payload: {},
    });
    expect(cancelledAgain.statusCode).toBe(200);
    const cancelledSummary = await f.app.inject({
      method: "GET",
      url: `/api/beneficios/resumo?unidadeId=${unit.id}&competencia=2026-09-01`,
      headers: f.headers,
    });
    expect(
      cancelledSummary.json<{ previsto: string; emPedido: string }>(),
    ).toMatchObject({
      previsto: "0.00",
      emPedido: "0.00",
    });
    const cancelledDashboard = await f.app.inject({
      method: "GET",
      url: `/api/dashboard?unidadeId=${unit.id}&competencia=2026-09-01`,
      headers: f.headers,
    });
    expect(
      cancelledDashboard.json<{ preparacaoMensalPorFornecedor: unknown[] }>()
        .preparacaoMensalPorFornecedor,
    ).toHaveLength(0);
    const readyAgain = await f.app.inject({
      method: "GET",
      url: `/api/aquisicoes-beneficios/pedido/previa?unidadeId=${unit.id}&competencia=2026-09-01&tipo=ALIMENTACAO`,
      headers: f.headers,
    });
    expect(
      readyAgain
        .json<Array<{ vinculoId: string; impedimento: string | null }>>()
        .find((row) => row.vinculoId === link.id)?.impedimento,
    ).toBeNull();
    const replacementSupplier = await f.db.fornecedor.create({
      data: { nome: `Fornecedor substituto ${f.suffix}` },
    });
    const replacementConfig = await f.db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: replacementSupplier.id,
        tipo: "ALIMENTACAO",
      },
    });
    const reissued = await f.app.inject({
      method: "POST",
      url: "/api/aquisicoes-beneficios/pedido/gerar",
      headers: { ...f.headers, "idempotency-key": `reemitir-${f.suffix}` },
      payload: {
        ...payload,
        itens: [
          {
            ...payload.itens[0],
            configuracaoId: replacementConfig.id,
            valorSolicitado: "720.00",
          },
          payload.itens[1],
        ],
      },
    });
    expect(reissued.statusCode, reissued.body).toBe(201);
    expect(
      await f.db.beneficioCompetencia.count({
        where: {
          competencia: new Date("2026-09-01"),
          beneficioVinculo: { vinculoId: link.id },
        },
      }),
    ).toBe(1);
    const history = await f.db.aquisicaoBeneficio.findMany({
      where: { unidadeId: unit.id, competencia: new Date("2026-09-01") },
      include: { itens: true },
    });
    expect(history.map((order) => order.status).sort()).toEqual([
      "CANCELADA",
      "PENDENTE",
    ]);
    expect(
      history
        .find((order) => order.status === "CANCELADA")
        ?.itens[0]?.valorSolicitado?.toFixed(2),
    ).toBe("700.00");
    const activeSummary = await f.app.inject({
      method: "GET",
      url: `/api/beneficios/resumo?unidadeId=${unit.id}&competencia=2026-09-01`,
      headers: f.headers,
    });
    expect(
      activeSummary.json<{ previsto: string; emPedido: string }>(),
    ).toMatchObject({
      previsto: "720.00",
      emPedido: "720.00",
    });
    const activeDashboard = await f.app.inject({
      method: "GET",
      url: `/api/dashboard?unidadeId=${unit.id}&competencia=2026-09-01`,
      headers: f.headers,
    });
    expect(
      activeDashboard
        .json<{
          preparacaoMensalPorFornecedor: Array<{ valorPrevisto: string }>;
        }>()
        .preparacaoMensalPorFornecedor.map((item) => item.valorPrevisto),
    ).toEqual(["720.00"]);
    const secondOrderId = reissued.json<{ ids: string[] }>().ids[0]!;
    const closing = await f.db.fechamentoCompetenciaBeneficio.create({
      data: {
        unidadeId: unit.id,
        competencia: new Date("2026-09-01"),
        status: "FECHADA",
      },
    });
    const closedCancellation = await f.app.inject({
      method: "POST",
      url: `/api/aquisicoes-beneficios/${secondOrderId}/cancelar`,
      headers: { ...f.headers, "idempotency-key": `fechada-${f.suffix}` },
      payload: {},
    });
    expect(closedCancellation.statusCode).toBe(409);
    await f.db.fechamentoCompetenciaBeneficio.update({
      where: { id: closing.id },
      data: { status: "ABERTA" },
    });
    const orderItem = await f.db.aquisicaoBeneficioItem.findFirstOrThrow({
      where: { aquisicaoId: secondOrderId },
    });
    const confirmed = await f.app.inject({
      method: "POST",
      url: `/api/aquisicoes-beneficios/${secondOrderId}/confirmar`,
      headers: { ...f.headers, "idempotency-key": `confirmada-${f.suffix}` },
      payload: {
        dataCompra: "2026-09-20",
        itens: [
          {
            itemId: orderItem.id,
            valor: "700.00",
            status: "CONFIRMADO",
            motivo: "Confirmação parcial",
          },
        ],
      },
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    expect(confirmed.json<{ status: string }>().status).toBe("PENDENTE");
    const confirmedCancellation = await f.app.inject({
      method: "POST",
      url: `/api/aquisicoes-beneficios/${secondOrderId}/cancelar`,
      headers: { ...f.headers, "idempotency-key": `compra-${f.suffix}` },
      payload: {},
    });
    expect(confirmedCancellation.statusCode).toBe(409);
  } finally {
    await f.app.close();
  }
});

test("direct order excludes inactive and departed people and rolls back invalid supplier", async () => {
  const f = await fixture();
  try {
    const unit = await f.db.unidade.create({
      data: {
        nome: `Unidade direta ${f.suffix}`,
        sigla: f.suffix.slice(0, 8),
        uf: "RJ",
      },
    });
    const supplier = await f.db.fornecedor.create({
      data: { nome: `Fornecedor direto ${f.suffix}` },
    });
    const config = await f.db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: supplier.id,
        tipo: "CESTA_BASICA",
      },
    });
    const makeLink = async (
      name: string,
      status: "ATIVO" | "AFASTADO" | "DESLIGADO",
      active = true,
    ) => {
      const person = await f.db.pessoa.create({
        data: { nomeCompleto: name, ativa: active },
      });
      return f.db.vinculo.create({
        data: {
          pessoaId: person.id,
          unidadeId: unit.id,
          tipo: "CLT",
          status,
          dataAdmissao: new Date("2025-01-01"),
          ...(status === "DESLIGADO"
            ? { dataDesligamento: new Date("2026-08-01") }
            : {}),
        },
      });
    };
    const active = await makeLink("Ativa direta", "ATIVO");
    const away = await makeLink("Afastada direta", "AFASTADO");
    await makeLink("Desligada direta", "DESLIGADO");
    await makeLink("Inativa direta", "ATIVO", false);
    const draft = await f.app.inject({
      method: "GET",
      url: `/api/aquisicoes-beneficios/pedido/previa?unidadeId=${unit.id}&competencia=2026-09-01&tipo=CESTA_BASICA`,
      headers: f.headers,
    });
    expect(draft.statusCode, draft.body).toBe(200);
    expect(
      draft.json<
        Array<{ vinculoId: string; incluirAutomaticamente: boolean }>
      >(),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vinculoId: active.id,
          incluirAutomaticamente: true,
        }),
        expect.objectContaining({
          vinculoId: away.id,
          incluirAutomaticamente: false,
        }),
      ]),
    );
    expect(draft.json<Array<unknown>>()).toHaveLength(2);
    const payload = {
      unidadeId: unit.id,
      competencia: "2026-09-01",
      tipo: "CESTA_BASICA",
      itens: [
        {
          vinculoId: active.id,
          incluir: true,
          configuracaoId: f.user.id,
          quantidade: 1,
          valorUnitario: "75.00",
        },
        { vinculoId: away.id, incluir: false },
      ],
    };
    const invalid = await f.app.inject({
      method: "POST",
      url: "/api/aquisicoes-beneficios/pedido/gerar",
      headers: { ...f.headers, "idempotency-key": `invalido-${f.suffix}` },
      payload,
    });
    expect(invalid.statusCode).toBe(422);
    expect(
      await f.db.beneficioVinculo.count({ where: { vinculoId: active.id } }),
    ).toBe(0);
    expect(
      await f.db.aquisicaoBeneficio.count({ where: { unidadeId: unit.id } }),
    ).toBe(0);
    const valid = await f.app.inject({
      method: "POST",
      url: "/api/aquisicoes-beneficios/pedido/gerar",
      headers: { ...f.headers, "idempotency-key": `valido-${f.suffix}` },
      payload: {
        ...payload,
        itens: payload.itens.map((item) =>
          item.vinculoId === active.id
            ? { ...item, configuracaoId: config.id }
            : item,
        ),
      },
    });
    expect(valid.statusCode, valid.body).toBe(201);
    const item = await f.db.aquisicaoBeneficioItem.findFirstOrThrow({
      where: { vinculoId: active.id },
    });
    expect(item.valorSolicitado?.toFixed(2)).toBe("75.00");
  } finally {
    await f.app.close();
  }
});

test("monthly benefit can be edited, checked and cancelled without changing its enrollment", async () => {
  const f = await fixture();
  try {
    const person = await f.db.pessoa.create({
      data: { nomeCompleto: "Pessoa competência operacional" },
    });
    const unit = await f.db.unidade.create({
      data: {
        nome: "Unidade competência",
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
      data: { nome: `Fornecedor competência ${f.suffix}` },
    });
    const config = await f.db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: supplier.id,
        tipo: "ALIMENTACAO",
      },
    });
    const benefit = await f.db.beneficioVinculo.create({
      data: {
        vinculoId: link.id,
        tipo: "ALIMENTACAO",
        inicioVigencia: new Date("2026-01-01"),
        configuracaoRecorrenteId: config.id,
        valorDiario: "10.50",
      },
    });
    const competence = await f.db.beneficioCompetencia.create({
      data: {
        beneficioVinculoId: benefit.id,
        configuracaoId: config.id,
        componente: "__RECORRENTE__",
        competencia: new Date("2026-09-01"),
        quantidadeDias: 20,
        valorUnitario: "10.50",
      },
    });
    const checked = await f.app.inject({
      method: "POST",
      url: `/api/competencias/${competence.id}/conferir`,
      headers: f.headers,
      payload: {},
    });
    expect(checked.statusCode, checked.body).toBe(200);
    expect(checked.json<{ status: string }>().status).toBe("CONFERIDO");

    const edited = await f.app.inject({
      method: "PUT",
      url: `/api/competencias/${competence.id}`,
      headers: f.headers,
      payload: {
        beneficioVinculoId: benefit.id,
        configuracaoId: config.id,
        componente: "__RECORRENTE__",
        competencia: "2026-09-01",
        quantidadeDias: "21",
        quantidade: null,
        valorUnitario: "10,50",
        valorInformado: null,
        status: "CONFERIDO",
        observacoes: "Revisado pelo RH",
      },
    });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json<{ status: string }>().status).toBe("PENDENTE");

    const cancelled = await f.app.inject({
      method: "POST",
      url: `/api/competencias/${competence.id}/cancelar`,
      headers: f.headers,
      payload: {},
    });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect(cancelled.json<{ status: string }>().status).toBe("CANCELADO");
    expect(
      await f.db.beneficioVinculo.count({ where: { id: benefit.id } }),
    ).toBe(1);
    expect(
      await f.db.auditoria.count({
        where: {
          entidade: "beneficioCompetencia",
          entidadeId: competence.id,
          acao: {
            in: [
              "CONFERIR_COMPETENCIA_BENEFICIO",
              "CANCELAR_COMPETENCIA_BENEFICIO",
            ],
          },
        },
      }),
    ).toBe(2);

    const overlapping = await f.app.inject({
      method: "POST",
      url: "/api/beneficios-vinculo",
      headers: f.headers,
      payload: {
        vinculoId: link.id,
        tipo: "ALIMENTACAO",
        inicioVigencia: "2026-06-01",
        fimVigencia: null,
        status: "ATIVO",
        configuracaoRecorrenteId: config.id,
        valorDiario: "12.00",
        quantidadeRecorrente: null,
        valorUnitarioRecorrente: null,
        observacoes: null,
      },
    });
    expect(overlapping.statusCode, overlapping.body).toBe(409);

    await f.db.fechamentoCompetenciaBeneficio.create({
      data: {
        unidadeId: unit.id,
        competencia: competence.competencia,
        status: "FECHADA",
      },
    });
    const protectedEnrollment = await f.app.inject({
      method: "PUT",
      url: `/api/beneficios-vinculo/${benefit.id}`,
      headers: f.headers,
      payload: {
        vinculoId: link.id,
        tipo: "ALIMENTACAO",
        inicioVigencia: "2026-01-01",
        fimVigencia: null,
        status: "ATIVO",
        configuracaoRecorrenteId: config.id,
        valorDiario: "12.00",
        quantidadeRecorrente: null,
        valorUnitarioRecorrente: null,
        observacoes: null,
      },
    });
    expect(protectedEnrollment.statusCode, protectedEnrollment.body).toBe(409);
  } finally {
    await f.app.close();
  }
});
