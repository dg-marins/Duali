import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import {
  identifyAuditedProfile,
  readAuditedWorkbook,
  stageAuditedWorkbook,
} from "./modules/audited-import-profiles.js";
import { fixture } from "./test-helper.js";
import { publishReady } from "./modules/imports.js";
import { review } from "./modules/imports.js";
import { transaction } from "./core.js";

test("specialized profiles are detected without trusting the extension", async () => {
  expect(identifyAuditedProfile("Planilha de Férias Funcionários.xlsx")).toBe(
    "FERIAS_FUNCIONARIOS",
  );
  expect(identifyAuditedProfile("Férias_Planilha Definitiva RJ (1).xlsx")).toBe(
    "DESCANSO_ESTAGIARIOS",
  );
  expect(identifyAuditedProfile("Benefícios - 2026.xlsx")).toBe(
    "BENEFICIOS_2026",
  );
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("RJ").addRow(["Colaborador", "Unidade", "Admissão"]);
  const parsed = readAuditedWorkbook(
    "Planilha de Férias Funcionários.xlsx",
    Buffer.from(await workbook.xlsx.writeBuffer()),
  );
  expect(parsed?.profile).toBe("FERIAS_FUNCIONARIOS");
  expect(parsed?.sheets[0]?.nome).toBe("RJ");
});

test("benefits profile keeps name-only match for review and releases its children afterwards", async () => {
  const f = await fixture();
  try {
    const unit = await f.db.unidade.create({
      data: {
        nome: `RJ ${f.suffix}`,
        sigla: `R${f.suffix.slice(0, 8)}`,
        uf: "RJ",
      },
    });
    const person = await f.db.pessoa.create({
      data: { nomeCompleto: `Benefício ${f.suffix}` },
    });
    await f.db.vinculo.create({
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
    const workbook = {
      profile: "BENEFICIOS_2026" as const,
      sheets: [],
      raw: [
        {
          nome: "RJ - CLT",
          rows: [
            ["", "", "", "", "JANEIRO"],
            [
              "CLT",
              person.nomeCompleto,
              "Área",
              "Segunda a sexta",
              "Ônibus",
              20,
              "RIOCARD/dia",
              "R$ 10,00",
              "RIOCARD/total",
              "R$ 200,00",
            ],
          ],
        },
      ],
    };
    await transaction(f.db, (tx) =>
      stageAuditedWorkbook(tx, batch.id, f.user.id, workbook),
    );
    const personItem = await f.db.importacaoItem.findFirstOrThrow({
      where: { importacaoId: batch.id, dominio: "pessoas" },
    });
    expect(personItem.status).toBe("DUPLICIDADE");
    await transaction(f.db, (tx) =>
      review(
        tx,
        personItem.id,
        {
          dados: personItem.dadosNormalizados,
          acao: "VINCULAR",
          destinoId: person.id,
          motivo: "Correspondência conferida",
        },
        f.user.id,
      ),
    );
    await transaction(f.db, (tx) => publishReady(tx, batch.id, f.user.id));
    expect(
      await f.db.beneficioCompetencia.count({
        where: { beneficioVinculo: { vinculo: { pessoaId: person.id } } },
      }),
    ).toBe(1);
  } finally {
    await f.app.close();
  }
});

test("employee leave profile publishes valid parents and historical periods idempotently", async () => {
  const f = await fixture();
  try {
    const personName = `Pessoa férias ${f.suffix}`;
    const batch = await f.db.importacao.create({
      data: {
        usuarioId: f.user.id,
        nomeArquivo: "Planilha de Férias Funcionários.xlsx",
        arquivo: new Uint8Array([1]),
        planilhas: [],
      },
    });
    const workbook = {
      profile: "FERIAS_FUNCIONARIOS" as const,
      sheets: [],
      raw: [
        {
          nome: "RJ",
          rows: [
            [
              "Colaborador",
              "Unidade",
              "Admissão",
              "Período",
              "Concessivo",
              "Dias",
            ],
            [
              personName,
              "RJ",
              new Date("2024-01-01"),
              "",
              "",
              30,
              new Date("2025-01-02"),
              new Date("2025-01-10"),
            ],
          ],
        },
      ],
    };
    await transaction(f.db, (tx) =>
      stageAuditedWorkbook(tx, batch.id, f.user.id, workbook),
    );
    const first = await transaction(f.db, (tx) =>
      publishReady(tx, batch.id, f.user.id),
    );
    expect(first.publicados).toBeGreaterThanOrEqual(4);
    expect(
      (await transaction(f.db, (tx) => publishReady(tx, batch.id, f.user.id)))
        .publicados,
    ).toBe(0);
    expect(
      await f.db.descansoPeriodo.count({
        where: { vinculo: { pessoa: { nomeCompleto: personName } } },
      }),
    ).toBe(1);
  } finally {
    await f.app.close();
  }
});
