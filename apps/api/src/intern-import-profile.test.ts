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

function uniqueCpf(seed: string) {
  const digits = [...seed.replace(/\D/g, "")]
    .slice(0, 9)
    .join("")
    .padEnd(9, "1")
    .split("")
    .map(Number);
  if (digits.every((digit) => digit === digits[0]))
    digits[8] = (digits[8]! + 1) % 10;
  for (let length = 9; length <= 10; length++) {
    const sum = digits
      .slice(0, length)
      .reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    const result = (sum * 10) % 11;
    digits.push(result === 10 ? 0 : result);
  }
  return digits.join("");
}

test("perfil de estagiários transforma pessoa, vínculo, estágio, documentos, seguro e movimentação", async () => {
  const f = await fixture();
  const cpf = uniqueCpf(f.suffix);
  const personName = f.suffix.slice(0, 8) + " Pessoa Estagiária Sintética";
  const phone = "61" + f.suffix.replace(/\D/g, "").slice(0, 9).padEnd(9, "1");
  try {
    const workbook = new ExcelJS.Workbook();
    const bsb = workbook.addWorksheet("BSB");
    bsb.addRows([
      [new Date("2026-01-01")],
      ["BRASÍLIA"],
      ["Estagiário", "Admissão", "TCE"],
      [
        personName,
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
        phone,
        `${f.suffix}@example.test`,
        new Date("2001-03-20"),
        "123456 SSP/DF",
        cpf,
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
        personName,
        cpf,
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
      where: { vinculo: { pessoa: { cpf } } },
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
