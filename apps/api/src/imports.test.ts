import { test, expect } from "vitest";
import ExcelJS from "exceljs";
import { fixture } from "./test-helper.js";
import { json, transaction } from "./core.js";
import { readSpreadsheet } from "./modules/import-files.js";
import {
  analyze,
  confirm,
  publishReady,
  review,
  normalizeInput,
  similarName,
} from "./modules/imports.js";
test("spreadsheet reader supports sheets and preserves formulas without execution", async () => {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet("Pessoas");
  a.addRow(["Nome", "Data"]);
  a.addRow(["Pessoa", { formula: "1+1", result: 2 }]);
  const b = wb.addWorksheet("Histórico");
  b.addRow(["Nome"]);
  b.addRow(["Outra"]);
  const sheets = await readSpreadsheet(
    "dados.xlsx",
    Buffer.from(await wb.xlsx.writeBuffer()),
  );
  expect(sheets).toHaveLength(2);
  expect(sheets[0]!.linhas[0]!.dados.Data).toBe("=1+1");
  expect(
    normalizeInput({ dataNascimento: "01/02/2000" }).messages,
  ).toHaveLength(1);
  expect(similarName("Maria da Silva", "Maria da Silve")).toBe(true);
  await expect(
    readSpreadsheet("dados.xlsx", Buffer.from("invalid")),
  ).rejects.toThrow();
});
test("partial publisher resolves parent groups and is idempotent under concurrency", async () => {
  const f = await fixture();
  try {
    const unit = await f.db.unidade.create({
      data: { nome: "Unidade", sigla: f.suffix, uf: "RJ" },
    });
    const sheets = await readSpreadsheet(
      "pessoas.csv",
      Buffer.from(
        "Nome;Admissao;Aquisicao\n" + f.suffix + ";2024-01-01;2024-07-01",
      ),
    );
    const batch = await f.db.importacao.create({
      data: {
        usuarioId: f.user.id,
        nomeArquivo: "pessoas.csv",
        arquivo: new Uint8Array([1]),
        planilhas: json(sheets),
      },
    });
    const mapping = {
      aba: "CSV",
      grupos: [
        {
          nome: "pessoa",
          dominio: "pessoas",
          campos: { nomeCompleto: { coluna: "Nome" } },
        },
        {
          nome: "vinculo",
          dominio: "vinculos",
          campos: {
            pessoaId: { grupo: "pessoa" },
            unidadeId: { valor: unit.id },
            tipo: { valor: "ESTAGIO" },
            dataAdmissao: { coluna: "Admissao" },
          },
        },
        {
          nome: "direito",
          dominio: "direitos",
          campos: {
            vinculoId: { grupo: "vinculo" },
            dataAquisicao: { coluna: "Aquisicao" },
            quantidadeDias: { valor: 15 },
            origem: { valor: "IMPORTACAO" },
            observacoes: { valor: "Histórico sintético" },
          },
        },
      ],
    };
    await transaction(f.db, (tx) => analyze(tx, batch.id, mapping, f.user.id));
    expect(await f.db.pessoa.count({ where: { nomeCompleto: f.suffix } })).toBe(
      0,
    );
    const results = await Promise.allSettled([
      transaction(f.db, (tx) => publishReady(tx, batch.id, f.user.id)),
      transaction(f.db, (tx) => publishReady(tx, batch.id, f.user.id)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(
      results.reduce(
        (sum, result) =>
          sum + (result.status === "fulfilled" ? result.value.publicados : 0),
        0,
      ),
    ).toBe(3);
    expect(await f.db.pessoa.count({ where: { nomeCompleto: f.suffix } })).toBe(
      1,
    );
    const person = await f.db.pessoa.findFirstOrThrow({
      where: { nomeCompleto: f.suffix },
      include: { vinculos: true },
    });
    const right = await f.db.descansoDireito.findUniqueOrThrow({
      where: {
        vinculoId_dataAquisicao: {
          vinculoId: person.vinculos[0]!.id,
          dataAquisicao: new Date("2024-07-01"),
        },
      },
    });
    expect(right.origem).toBe("IMPORTACAO");
  } finally {
    await f.app.close();
  }
});
test("partial publisher keeps invalid parents pending and releases or rejects their children", async () => {
  const f = await fixture();
  try {
    const unit = await f.db.unidade.create({
      data: { nome: "Unidade parcial", sigla: f.suffix, uf: "SP" },
    });
    const sheets = await readSpreadsheet(
      "parcial.csv",
      Buffer.from(
        `Nome;Admissao\nVálida ${f.suffix};2024-01-01\n;2024-02-01\n;2024-03-01`,
      ),
    );
    const batch = await f.db.importacao.create({
      data: {
        usuarioId: f.user.id,
        nomeArquivo: "parcial.csv",
        arquivo: new Uint8Array([1]),
        planilhas: json(sheets),
      },
    });
    await transaction(f.db, (tx) =>
      analyze(
        tx,
        batch.id,
        {
          aba: "CSV",
          grupos: [
            {
              nome: "pessoa",
              dominio: "pessoas",
              campos: {
                nomeCompleto: { coluna: "Nome" },
                observacoes: { coluna: "Admissao" },
              },
            },
            {
              nome: "vinculo",
              dominio: "vinculos",
              campos: {
                pessoaId: { grupo: "pessoa" },
                unidadeId: { valor: unit.id },
                tipo: { valor: "ESTAGIO" },
                dataAdmissao: { coluna: "Admissao" },
              },
            },
          ],
        },
        f.user.id,
      ),
    );
    const first = await transaction(f.db, (tx) =>
      publishReady(tx, batch.id, f.user.id),
    );
    expect(first).toMatchObject({ publicados: 2, status: "PARCIAL" });
    expect(
      await f.db.importacaoItem.count({
        where: { importacaoId: batch.id, status: "AGUARDANDO_DEPENDENCIA" },
      }),
    ).toBe(2);
    const pending = await f.db.importacaoItem.findMany({
      where: { importacaoId: batch.id, acao: "PENDENTE" },
      orderBy: { ordem: "asc" },
    });
    await transaction(f.db, (tx) =>
      review(
        tx,
        pending[0]!.id,
        {
          dados: { nomeCompleto: `Corrigida ${f.suffix}` },
          acao: "CRIAR",
          motivo: "Nome informado",
        },
        f.user.id,
      ),
    );
    expect(
      await transaction(f.db, (tx) => publishReady(tx, batch.id, f.user.id)),
    ).toMatchObject({ publicados: 2, status: "PARCIAL" });
    await transaction(f.db, (tx) =>
      review(
        tx,
        pending[1]!.id,
        {
          dados: pending[1]!.dadosNormalizados,
          acao: "REJEITAR",
          motivo: "Linha sem identificação",
        },
        f.user.id,
      ),
    );
    expect(
      await transaction(f.db, (tx) => publishReady(tx, batch.id, f.user.id)),
    ).toMatchObject({ publicados: 0, status: "CONFIRMADA" });
    expect(
      await f.db.importacaoItem.count({
        where: { importacaoId: batch.id, acao: "REJEITAR" },
      }),
    ).toBe(2);
  } finally {
    await f.app.close();
  }
});
test("duplicate revision detects stale target and requires another review", async () => {
  const f = await fixture();
  try {
    const person = await f.db.pessoa.create({
      data: { nomeCompleto: f.suffix },
    });
    const sheets = await readSpreadsheet(
      "p.csv",
      Buffer.from("Nome\n" + f.suffix),
    );
    const batch = await f.db.importacao.create({
      data: {
        usuarioId: f.user.id,
        nomeArquivo: "p.csv",
        arquivo: new Uint8Array([1]),
        planilhas: json(sheets),
      },
    });
    await transaction(f.db, (tx) =>
      analyze(
        tx,
        batch.id,
        {
          aba: "CSV",
          grupos: [
            {
              nome: "p",
              dominio: "pessoas",
              campos: { nomeCompleto: { coluna: "Nome" } },
            },
          ],
        },
        f.user.id,
      ),
    );
    const item = await f.db.importacaoItem.findFirstOrThrow({
      where: { importacaoId: batch.id },
    });
    expect(item.status).toBe("DUPLICIDADE");
    await transaction(f.db, (tx) =>
      review(
        tx,
        item.id,
        {
          dados: item.dadosNormalizados,
          acao: "VINCULAR",
          destinoId: person.id,
          motivo: "Mesma pessoa",
        },
        f.user.id,
      ),
    );
    await f.db.pessoa.update({
      where: { id: person.id },
      data: { observacoes: "Alteração concorrente" },
    });
    await expect(
      transaction(f.db, (tx) => confirm(tx, batch.id, f.user.id)),
    ).rejects.toThrow("Destino alterado");
    await transaction(f.db, (tx) =>
      review(
        tx,
        item.id,
        {
          dados: item.dadosNormalizados,
          acao: "VINCULAR",
          destinoId: person.id,
          motivo: "Revisado novamente",
        },
        f.user.id,
      ),
    );
    expect(
      (await transaction(f.db, (tx) => confirm(tx, batch.id, f.user.id)))
        .registros,
    ).toBe(1);
  } finally {
    await f.app.close();
  }
});
test("duplicates within file can explicitly link to previous staged row", async () => {
  const f = await fixture();
  try {
    const sheets = await readSpreadsheet(
      "p.csv",
      Buffer.from("Nome\n" + f.suffix + "\n" + f.suffix),
    );
    const batch = await f.db.importacao.create({
      data: {
        usuarioId: f.user.id,
        nomeArquivo: "p.csv",
        arquivo: new Uint8Array([1]),
        planilhas: json(sheets),
      },
    });
    await transaction(f.db, (tx) =>
      analyze(
        tx,
        batch.id,
        {
          aba: "CSV",
          grupos: [
            {
              nome: "p",
              dominio: "pessoas",
              campos: { nomeCompleto: { coluna: "Nome" } },
            },
          ],
        },
        f.user.id,
      ),
    );
    const items = await f.db.importacaoItem.findMany({
      where: { importacaoId: batch.id },
      orderBy: { ordem: "asc" },
    });
    await transaction(f.db, (tx) =>
      review(
        tx,
        items[1]!.id,
        {
          dados: items[1]!.dadosNormalizados,
          acao: "VINCULAR",
          destinoId: items[0]!.destinoId,
          motivo: "Duplicado no arquivo",
        },
        f.user.id,
      ),
    );
    await transaction(f.db, (tx) => confirm(tx, batch.id, f.user.id));
    expect(await f.db.pessoa.count({ where: { nomeCompleto: f.suffix } })).toBe(
      1,
    );
  } finally {
    await f.app.close();
  }
});
