import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import { fixture } from "./test-helper.js";
import { json, transaction } from "./core.js";
import { confirm } from "./modules/imports.js";
import {
  isGeneralInternList,
  readGeneralInternList,
  stageGeneralInternList,
} from "./modules/intern-import-profile.js";

test("perfil de estagiários transforma pessoa, vínculo, estágio, documentos, seguro e movimentação", async () => {
  const f = await fixture();
  try {
    const workbook = new ExcelJS.Workbook();
    const bsb = workbook.addWorksheet("BSB");
    bsb.addRows([
      [new Date("2026-01-01")],
      ["BRASÍLIA"],
      ["Estagiário", "Admissão", "TCE"],
      [
        "Pessoa Estagiária Sintética",
        new Date("2024-01-10"),
        "Assinado",
        new Date("2024-07-10"),
        "",
        "",
        new Date("2026-01-10"),
        "",
        "",
        "",
        "Contencioso",
        "Gestora",
        "8º",
        "R$ 2.150,00",
        "Banco sintético",
        "(61) 99999-0000",
        `${f.suffix}@example.test`,
        new Date("2001-03-20"),
        "123456 SSP/DF",
        "529.982.247-25",
        "MAT-1",
        "Endereço sintético",
        "Universidade Sintética",
        "AP-123",
        "Observação",
      ],
    ]);
    const insurance = workbook.addWorksheet("Seguro estagiários");
    insurance.addRows([
      [new Date("2026-01-01")],
      [
        "Estagiário",
        "CPF",
        "Nascimento",
        "Praça",
        "Seguro",
        "Movimentação",
        "Data",
      ],
      [
        "Pessoa Estagiária Sintética",
        "529.982.247-25",
        new Date("2001-03-20"),
        "DF",
        "Yellum",
        "Inclusão",
        new Date("2024-01-10"),
      ],
    ]);
    const obs = workbook.addWorksheet("OBS");
    obs.addRows([
      ["Período de contrato e aditivos"],
      ["DF"],
      ["Universidade Sintética", "1 ano", "contato@example.test"],
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    expect(
      isGeneralInternList("Listagem Estagiários Geral (12) (1).xlsx"),
    ).toBe(true);
    const parsed = await readGeneralInternList(buffer);
    const batch = await f.db.importacao.create({
      data: {
        usuarioId: f.user.id,
        nomeArquivo: "Listagem Estagiários Geral.xlsx",
        arquivo: buffer,
        planilhas: json(parsed.sheets),
      },
    });
    const analysis = await transaction(
      f.db,
      (tx) => stageGeneralInternList(tx, batch.id, f.user.id, parsed),
      120000,
    );
    expect(analysis.pendencias).toBe(0);
    const domains = await f.db.importacaoItem.groupBy({
      by: ["dominio"],
      where: { importacaoId: batch.id },
      _count: true,
    });
    expect(domains.map((d) => d.dominio)).toEqual(
      expect.arrayContaining([
        "pessoas",
        "vinculos",
        "estagios",
        "documentos",
        "seguros",
        "seguro-movimentacoes",
      ]),
    );
    await transaction(f.db, (tx) => confirm(tx, batch.id, f.user.id), 120000);
    const saved = await f.db.estagio.findFirstOrThrow({
      where: { vinculo: { pessoa: { cpf: "52998224725" } } },
      include: {
        vinculo: { include: { pessoa: true } },
        instituicaoEnsino: true,
      },
    });
    expect(saved.valorBolsa.toString()).toBe("2150");
    expect(saved.dataTerminoPrevista?.toISOString().slice(0, 10)).toBe(
      "2026-01-10",
    );
    expect(saved.instituicaoEnsino?.nome).toBe("Universidade Sintética");
    expect(
      await f.db.documentoVinculo.count({
        where: { vinculoId: saved.vinculoId },
      }),
    ).toBe(2);
    expect(await f.db.seguroMovimentacao.count()).toBeGreaterThan(0);
  } finally {
    await f.app.close();
  }
});

test("perfil mantém vínculo incompleto em revisão", async () => {
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet("RJ");
  sheet.addRows([
    [new Date()],
    ["RIO DE JANEIRO"],
    ["Estagiário", "Admissão"],
    ["Pessoa Sem Admissão", ""],
  ]);
  const parsed = await readGeneralInternList(
    Buffer.from(await workbook.xlsx.writeBuffer()),
  );
  expect(parsed.records[0]?.link?.dataAdmissao).toBe("");
});
