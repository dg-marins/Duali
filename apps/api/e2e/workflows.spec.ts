import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";
test("administrator creates and updates a person through the browser", async ({
  page,
}) => {
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
    await page.screenshot({
      path: "artifacts/pessoas-desktop.png",
      fullPage: true,
    });

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
    ).toContainText("REVISAO");
    await page
      .getByRole("button", { name: "Confirmar importação…", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Gravar registros revisados", exact: true })
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
