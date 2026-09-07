import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";
test("administrator creates and updates a person through the browser", async ({
  page,
}) => {
  test.setTimeout(120000);
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const suffix = randomUUID(),
    email = suffix + "@example.test",
    senha = randomUUID() + "Aa!";
  await db.usuario.create({
    data: { nome: "Operador E2E", email, senhaHash: await argon2.hash(senha) },
  });
  try {
    await page.goto("/");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(senha);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page
      .getByRole("button", { name: "Abrir grupo Pessoas", exact: true })
      .click();
    await page.getByRole("button", { name: "Pessoas", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Pessoas", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Novo registro", exact: true })
      .click();
    await page.getByLabel("Nome completo").fill("Pessoa E2E " + suffix);
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Registro salvo" }),
    ).toContainText("Registro salvo");
    await page.getByLabel("Buscar registros").fill(suffix);
    await expect(
      page.getByRole("cell", { name: "Pessoa E2E " + suffix, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByLabel("Telefone", { exact: true }).fill("21999990000");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Registro salvo" }),
    ).toContainText("Registro salvo");
    const person = await db.pessoa.findFirstOrThrow({
      where: { nomeCompleto: "Pessoa E2E " + suffix },
    });
    const unit = await db.unidade.create({
      data: {
        nome: "Unidade E2E " + suffix,
        sigla: suffix.slice(0, 12),
        uf: "RJ",
      },
    });
    await page.getByRole("button", { name: "Vínculos", exact: true }).click();
    await page
      .getByRole("button", { name: "Novo registro", exact: true })
      .click();
    await page.getByLabel("Pessoa", { exact: true }).selectOption(person.id);
    await page.getByLabel("Tipo", { exact: true }).selectOption("ESTAGIO");
    await page.getByLabel("Unidade", { exact: true }).selectOption(unit.id);
    await page.locator("form input[type=date]").first().fill("2024-01-01");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Registro salvo" }),
    ).toContainText("Registro salvo");
    const link = await db.vinculo.findFirstOrThrow({
      where: { unidadeId: unit.id },
    });

    await page
      .getByRole("button", { name: "Abrir grupo Estágios", exact: true })
      .click();
    await page.getByRole("button", { name: "Estágios", exact: true }).click();
    await page
      .getByRole("button", { name: "Novo registro", exact: true })
      .click();
    await page.getByLabel("Vínculo", { exact: true }).selectOption(link.id);
    await page.getByLabel("Período acadêmico", { exact: true }).fill("5º");
    await page.getByLabel("Bolsa (R$)", { exact: true }).fill("1800");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();

    await page
      .getByRole("button", {
        name: "Abrir grupo Férias e descanso",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Férias e descanso", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Novo registro", exact: true })
      .click();
    await page.getByLabel("Vínculo", { exact: true }).selectOption(link.id);
    await page
      .getByLabel("Tipo", { exact: true })
      .selectOption("DESCANSO_ESTAGIO");
    await page.locator("form input[type=date]").nth(0).fill("2026-01-01");
    await page.locator("form input[type=date]").nth(1).fill("2026-01-05");
    await page.locator("form input[type=number]").first().fill("5");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();

    await page
      .getByRole("button", { name: "Abrir grupo Benefícios", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Benefícios do vínculo", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Novo registro", exact: true })
      .click();
    await page.getByLabel("Vínculo", { exact: true }).selectOption(link.id);
    await page.getByLabel("Tipo", { exact: true }).selectOption("ALIMENTACAO");
    await page.locator("form input[type=date]").first().fill("2026-01-01");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    expect(await db.estagio.count({ where: { vinculoId: link.id } })).toBe(1);
    expect(
      await db.descansoPeriodo.count({ where: { vinculoId: link.id } }),
    ).toBe(1);
    expect(
      await db.beneficioVinculo.count({ where: { vinculoId: link.id } }),
    ).toBe(1);
    await page.screenshot({
      path: "artifacts/pessoas-desktop.png",
      fullPage: true,
    });

    await page
      .getByRole("button", { name: "Abrir grupo Operação", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Importações", exact: true })
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name: "sintetico.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Nome\nImportado " + suffix),
    });
    await page
      .getByLabel("Origem Pessoas Nome completo", { exact: true })
      .selectOption("coluna:Nome");
    await page
      .getByRole("button", { name: "Analisar e gerar prévia", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /sintetico.csv/ }),
    ).toContainText("CONFIRMADA");
    await page.getByRole("button", { name: "Relatórios", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar CSV", exact: true })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("duali-pessoas.csv");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "artifacts/relatorios-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Entrar", exact: true }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
