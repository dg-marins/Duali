import { expect, test } from "vitest";
import {
  money,
  stageAuditedWorkbook,
} from "./modules/audited-import-profiles.js";
import { fixture } from "./test-helper.js";
import { transaction, type Row } from "./core.js";
import { publishReady, review } from "./modules/imports.js";

test.each([
  [10.5, 10.5],
  [0, 0],
  [1234.56, 1234.56],
  ["10,50", 10.5],
  ["R$ 10,50", 10.5],
  [" R$ 1.234,56 ", 1234.56],
  ["0", 0],
  ["0,00", 0],
  ["10", 10],
  ["", null],
  ["   ", null],
  [null, null],
  [undefined, null],
  ["10.5", null],
  ["1.234", null],
  ["1,234.56", null],
  ["12.34,56", null],
  ["1,2,3", null],
  ["R$", null],
  ["1e2", null],
  ["0x10", null],
  ["dez", null],
  [true, null],
  [[], null],
  [Infinity, null],
  [NaN, null],
])(
  "converte valor de origem %j para %j sem inferir separadores",
  (input, expected) => {
    expect(money(input)).toBe(expected);
  },
);

test("benefícios preservam decimais e mantêm valores ausentes ou inválidos em revisão até correção", async () => {
  const f = await fixture();
  try {
    const unit = await f.db.unidade.create({
      data: {
        nome: "Unidade sintética",
        sigla: f.suffix.slice(0, 15),
        uf: "RJ",
      },
    });
    const person = await f.db.pessoa.create({
      data: { nomeCompleto: `Valores ${f.suffix}` },
    });
    const link = await f.db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-01"),
      },
    });
    const batch = await f.db.importacao.create({
      data: {
        usuarioId: f.user.id,
        nomeArquivo: "Benefícios - 2026.xlsx",
        arquivo: new Uint8Array([1]),
        planilhas: [],
      },
    });
    const cases = [
      { days: 10.5, value: 10.5, valid: true },
      { days: "10,50", value: "R$ 1.234,56", valid: true },
      { days: 0, value: 0, valid: true },
      { days: 20, value: "", valid: false },
      { days: 20, value: null, valid: false },
      { days: "", value: 10.5, valid: false },
      { days: null, value: 10.5, valid: false },
      { days: 20, value: "10.5", valid: false },
      { days: 20, value: "inválido", valid: false },
      { days: 20, value: -1, valid: false },
      { days: 20, value: 1.234, valid: false },
      { days: 100000, value: 10, valid: false },
      { days: 20, value: undefined, valid: false },
    ];
    const rows = cases.map((entry, i) => [
      "CLT",
      person.nomeCompleto,
      "Área",
      "Escala",
      "Ônibus",
      entry.days,
      `MEIO${i}/dia`,
      ...(entry.value === undefined ? [] : [entry.value]),
    ]);
    await transaction(f.db, (tx) =>
      stageAuditedWorkbook(tx, batch.id, f.user.id, {
        profile: "BENEFICIOS_2026",
        sheets: [],
        raw: [{ nome: "RJ - CLT", rows }],
      }),
    );
    const staged = await f.db.importacaoItem.findMany({
      where: { importacaoId: batch.id, dominio: "competencias" },
      orderBy: { ordem: "asc" },
    });
    expect(staged).toHaveLength(cases.length);
    for (const [i, entry] of cases.entries()) {
      const item = staged[i]!;
      expect(item.dadosOriginais).toEqual(rows[i]);
      expect(item.dadosNormalizados).toMatchObject({
        quantidadeDias: money(entry.days),
        valorUnitario: money(entry.value),
      });
      expect(item.acao).toBe(entry.valid ? "CRIAR" : "PENDENTE");
      expect(item.status).toBe(entry.valid ? "VALIDO" : "REVISAO");
      if (!entry.valid)
        expect(item.inconsistencias).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              codigo: "AJUSTE_BENEFICIO_PENDENTE",
              severidade: "REVISAO",
            }),
          ]),
        );
    }
    const parent = await f.db.importacaoItem.findFirstOrThrow({
      where: { importacaoId: batch.id, dominio: "pessoas" },
    });
    await transaction(f.db, (tx) =>
      review(
        tx,
        parent.id,
        {
          dados: parent.dadosNormalizados,
          acao: "VINCULAR",
          destinoId: person.id,
          motivo: "Correspondência sintética conferida",
        },
        f.user.id,
      ),
    );
    await transaction(f.db, (tx) => publishReady(tx, batch.id, f.user.id));
    const published = await f.db.beneficioCompetencia.findMany({
      where: { beneficioVinculo: { vinculoId: link.id } },
      orderBy: { componente: "asc" },
    });
    expect(
      published.map((row) => [
        row.quantidadeDias?.toString(),
        row.valorUnitario?.toString(),
      ]),
    ).toEqual([
      ["10.5", "10.5"],
      ["10.5", "1234.56"],
      ["0", "0"],
    ]);
    expect(
      await f.db.importacaoItem.count({
        where: {
          importacaoId: batch.id,
          dominio: "competencias",
          acao: "PENDENTE",
          persistidoId: null,
        },
      }),
    ).toBe(cases.length - 3);
    const pending = staged[3]!;
    await transaction(f.db, (tx) =>
      review(
        tx,
        pending.id,
        {
          dados: { ...(pending.dadosNormalizados as Row), valorUnitario: 7.5 },
          acao: "CRIAR",
          motivo: "Valor conferido no documento sintético",
        },
        f.user.id,
      ),
    );
    await transaction(f.db, (tx) => publishReady(tx, batch.id, f.user.id));
    const corrected = await f.db.beneficioCompetencia.findFirstOrThrow({
      where: { beneficioVinculo: { vinculoId: link.id }, componente: "MEIO3" },
    });
    expect(corrected.valorUnitario?.toString()).toBe("7.5");
    expect(
      (
        await f.db.importacaoItem.findUniqueOrThrow({
          where: { id: pending.id },
        })
      ).dadosOriginais,
    ).toEqual(rows[3]);

    // A cesta histórica também usa o conversor monetário compartilhado.
    const historical = await f.db.importacao.create({
      data: {
        usuarioId: f.user.id,
        nomeArquivo: "Planilha de Férias Funcionários.xlsx",
        arquivo: new Uint8Array([1]),
        planilhas: [],
      },
    });
    await transaction(f.db, (tx) =>
      stageAuditedWorkbook(tx, historical.id, f.user.id, {
        profile: "FERIAS_FUNCIONARIOS",
        sheets: [],
        raw: [
          {
            nome: "Cesta Básica RJ",
            rows: [
              ["Pessoa", "Admissão", "2025 - 2026", "2025 - 2026"],
              [
                person.nomeCompleto,
                "2025-01-01",
                "Pago R$ 1.234",
                "Pago R$ 1.234,56",
              ],
            ],
          },
        ],
      }),
    );
    const historicalItems = await f.db.importacaoItem.findMany({
      where: {
        importacaoId: historical.id,
        dominio: "beneficios-periodos-historicos",
      },
      orderBy: { ordem: "asc" },
    });
    expect(historicalItems).toHaveLength(2);
    expect(historicalItems[0]).toMatchObject({
      status: "REVISAO",
      acao: "PENDENTE",
      dadosNormalizados: { valor: null },
      dadosOriginais: { valor: "Pago R$ 1.234" },
    });
    expect(historicalItems[0]!.inconsistencias).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ codigo: "AJUSTE_BENEFICIO_PENDENTE" }),
      ]),
    );
    expect(historicalItems[1]).toMatchObject({
      status: "VALIDO",
      acao: "CRIAR",
      dadosNormalizados: { valor: 1234.56 },
      dadosOriginais: { valor: "Pago R$ 1.234,56" },
    });
  } finally {
    await f.app.close();
  }
});
