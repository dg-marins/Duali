import { test, expect } from "vitest";
import { fixture } from "./test-helper.js";
import { exportRows, safeCell } from "./modules/reporting.js";
import ExcelJS from "exceljs";
test("exports preserve text without executing spreadsheet formulas", async () => {
  expect(safeCell('  =HYPERLINK("unsafe")')).toBe('\'  =HYPERLINK("unsafe")');
  const rows = [{ Nome: "=1+1", Valor: 20 }];
  const csv = await exportRows(rows, "csv");
  expect(csv.toString("utf8")).toContain("'=1+1");
  const xlsx = await exportRows(rows, "xlsx"),
    wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx as unknown as ExcelJS.Buffer);
  expect(wb.worksheets[0]!.getCell("A2").value).toBe("'=1+1");
});
test("report filters and export authentication and audit", async () => {
  const f = await fixture();
  try {
    expect(
      (await f.app.inject("/api/exportacoes/pessoas/csv")).statusCode,
    ).toBe(401);
    const response = await f.app.inject({
      url: "/api/exportacoes/pessoas/csv?q=" + f.suffix,
      headers: f.headers,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(
      await f.db.auditoria.count({
        where: { usuarioId: f.user.id, acao: "EXPORTAR" },
      }),
    ).toBe(1);
    const report = await f.app.inject({
      url: "/api/relatorios/pessoas?q=" + f.suffix,
      headers: f.headers,
    });
    expect(report.json<{ total: number }>().total).toBe(0);
    const dashboard = await f.app.inject({
      url: "/api/dashboard",
      headers: f.headers,
    });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json()).toMatchObject({
      pendenciasCriticas: expect.any(Number),
      contratosVencendo: expect.any(Number),
      tcesAguardandoAssinatura: expect.any(Number),
      feriasAtencao: expect.any(Number),
      custoBeneficios: expect.stringMatching(/^\d+\.\d{2}$/),
      divergenciasBeneficios: expect.any(Number),
      distribuicaoVinculos: expect.objectContaining({
        CLT: expect.any(Number),
        ESTAGIO: expect.any(Number),
        APRENDIZ: expect.any(Number),
      }),
      pendenciasPrioritarias: expect.any(Array),
    });
    const invalidCompetence = await f.app.inject({
      url: "/api/dashboard?competencia=2026-09-10",
      headers: f.headers,
    });
    expect(invalidCompetence.statusCode).toBe(422);
  } finally {
    await f.app.close();
  }
});

test("dashboard groups monthly preparation by unit, category and supplier and omits zero totals", async () => {
  const f = await fixture();
  try {
    const unit = await f.db.unidade.create({
        data: {
          nome: `Unidade gráfico ${f.suffix}`,
          sigla: f.suffix.slice(0, 8),
          uf: "RJ",
        },
      }),
      person = await f.db.pessoa.create({
        data: { nomeCompleto: `Pessoa gráfico ${f.suffix}` },
      }),
      link = await f.db.vinculo.create({
        data: {
          pessoaId: person.id,
          unidadeId: unit.id,
          tipo: "CLT",
          dataAdmissao: new Date("2026-01-01"),
        },
      }),
      [foodSupplier, firstTransportSupplier, secondTransportSupplier] =
        await Promise.all(
          ["Alimentação", "Transporte A", "Transporte B"].map((name) =>
            f.db.fornecedor.create({
              data: { nome: `${name} ${f.suffix}` },
            }),
          ),
        ),
      [foodConfig, firstTransportConfig, zeroConfig] = await Promise.all([
        f.db.configuracaoBeneficio.create({
          data: {
            unidadeId: unit.id,
            fornecedorId: foodSupplier.id,
            tipo: "ALIMENTACAO",
          },
        }),
        f.db.configuracaoBeneficio.create({
          data: {
            unidadeId: unit.id,
            fornecedorId: firstTransportSupplier.id,
            tipo: "TRANSPORTE",
          },
        }),
        f.db.configuracaoBeneficio.create({
          data: {
            unidadeId: unit.id,
            fornecedorId: secondTransportSupplier.id,
            tipo: "TRANSPORTE",
          },
        }),
        f.db.configuracaoBeneficio.create({
          data: {
            unidadeId: unit.id,
            fornecedorId: foodSupplier.id,
            tipo: "CESTA_BASICA",
          },
        }),
      ]),
      [foodBenefit, transportBenefit, zeroBenefit] = await Promise.all([
        f.db.beneficioVinculo.create({
          data: {
            vinculoId: link.id,
            tipo: "ALIMENTACAO",
            inicioVigencia: new Date("2026-01-01"),
            configuracaoRecorrenteId: foodConfig.id,
          },
        }),
        f.db.beneficioVinculo.create({
          data: {
            vinculoId: link.id,
            tipo: "TRANSPORTE",
            inicioVigencia: new Date("2026-01-01"),
          },
        }),
        f.db.beneficioVinculo.create({
          data: {
            vinculoId: link.id,
            tipo: "CESTA_BASICA",
            inicioVigencia: new Date("2026-01-01"),
            configuracaoRecorrenteId: zeroConfig.id,
          },
        }),
      ]),
      month = new Date("2026-09-01T00:00:00.000Z"),
      [foodCompetence, transportCompetence] = await Promise.all([
        f.db.beneficioCompetencia.create({
          data: {
            beneficioVinculoId: foodBenefit.id,
            configuracaoId: foodConfig.id,
            competencia: month,
            quantidadeDias: 10,
            valorUnitario: 20,
          },
        }),
        f.db.beneficioCompetencia.create({
          data: {
            beneficioVinculoId: transportBenefit.id,
            configuracaoId: firstTransportConfig.id,
            competencia: month,
            quantidadeDias: 2,
          },
        }),
      ]);
    await f.db.beneficioCompetencia.create({
      data: {
        beneficioVinculoId: zeroBenefit.id,
        configuracaoId: zeroConfig.id,
        competencia: month,
        quantidade: 0,
        valorUnitario: 50,
      },
    });
    await f.db.beneficioTransporteCompetenciaItem.createMany({
      data: [
        {
          competenciaId: transportCompetence.id,
          tipoConducao: "ONIBUS",
          fornecedorId: firstTransportSupplier.id,
          valorDiario: 3,
        },
        {
          competenciaId: transportCompetence.id,
          tipoConducao: "METRO",
          fornecedorId: secondTransportSupplier.id,
          valorDiario: 4,
        },
      ],
    });

    const response = await f.app.inject({
      url: `/api/dashboard?unidadeId=${unit.id}&competencia=2026-09-01`,
      headers: f.headers,
    });
    expect(response.statusCode, response.body).toBe(200);
    const rows = response.json<{
      preparacaoMensalPorFornecedor: Array<{
        unidadeId: string;
        tipo: string;
        fornecedorId: string;
        valorPrevisto: string;
      }>;
    }>().preparacaoMensalPorFornecedor;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unidadeId: unit.id,
          tipo: "ALIMENTACAO",
          fornecedorId: foodSupplier.id,
          valorPrevisto: "200.00",
        }),
        expect.objectContaining({
          tipo: "TRANSPORTE",
          fornecedorId: firstTransportSupplier.id,
          valorPrevisto: "6.00",
        }),
        expect.objectContaining({
          tipo: "TRANSPORTE",
          fornecedorId: secondTransportSupplier.id,
          valorPrevisto: "8.00",
        }),
      ]),
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.valorPrevisto !== "0.00")).toBe(true);
    expect(foodCompetence.id).toBeTruthy();
  } finally {
    await f.app.close();
  }
});
