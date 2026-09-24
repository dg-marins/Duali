import { expect, test, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";

async function selectLookup(
  container: Locator,
  label: string,
  option: string,
  query?: string,
  keyboard = false,
) {
  await container.getByRole("button", { name: label, exact: true }).click();
  const search = container.getByLabel(`Buscar ${label}`);
  if (query) await search.fill(query);
  const match = container.getByRole("option", { name: new RegExp(option) });
  await expect(match).toBeVisible();
  if (keyboard) {
    await search.press("ArrowDown");
    await search.press("Escape");
    await expect(
      container.getByRole("button", { name: label, exact: true }),
    ).toBeFocused();
    await container.getByRole("button", { name: label, exact: true }).click();
    if (query) await container.getByLabel(`Buscar ${label}`).fill(query);
    await container.getByRole("option", { name: new RegExp(option) }).click();
  } else await match.click();
}

test("administrator completes the operational RH journey", async ({ page }) => {
  test.setTimeout(240_000);
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const suffix = randomUUID(),
    email = `${suffix}@example.test`,
    password = `${randomUUID()}Aa!`;
  await db.usuario.create({
    data: {
      nome: "Operador E2E",
      email,
      senhaHash: await argon2.hash(password),
    },
  });
  const unit = await db.unidade.create({
    data: {
      nome: `Unidade E2E ${suffix}`,
      sigla: suffix.slice(0, 12),
      uf: "RJ",
    },
  });
  try {
    await page.goto("/");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Visão geral" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pendências", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Pendências" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Recolher menu" }).click();
    await expect(
      page.getByRole("button", { name: "Equipes", exact: true }),
    ).toBeHidden();
    await page.getByRole("button", { name: /^Cadastros\b/ }).click();
    await expect(
      page.getByRole("menuitem", { name: "Equipes", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Expandir menu" }).click();
    await page.getByRole("button", { name: /^Cadastros\b/ }).click();
    await page.getByRole("button", { name: "Equipes", exact: true }).click();
    await page.getByRole("button", { name: "Novo registro" }).click();
    const teamDialog = page.getByRole("dialog", {
      name: /Novo registro · Equipes/,
    });
    await expect(teamDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(teamDialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Novo registro" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Novo registro" }).click();
    await teamDialog.getByLabel("Nome *").fill(`Equipe descartada ${suffix}`);
    await teamDialog.getByRole("button", { name: "Cancelar" }).click();
    const discardDialog = page.getByRole("dialog", {
      name: "Descartar alterações?",
    });
    await expect(discardDialog).toBeVisible();
    await discardDialog.getByRole("button", { name: "Descartar" }).click();
    await expect(teamDialog).toBeHidden();

    await page.getByRole("button", { name: "Pessoas", exact: true }).click();
    await page.getByRole("button", { name: "+ Nova pessoa" }).click();
    await page.getByLabel("Nome completo").fill("Rascunho");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Descartar alterações?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continuar editando" }).click();
    await page.getByLabel("Nome completo").fill(`Pessoa E2E ${suffix}`);
    await page.getByLabel("E-mail").fill(`pessoa-${suffix}@example.test`);
    await page.getByRole("button", { name: "Próximo" }).click();
    await page.getByLabel("Unidade").selectOption(unit.id);
    await page.getByLabel("Admissão").fill("2024-01-01");
    await page.getByRole("button", { name: "Próximo" }).click();
    await page.getByRole("button", { name: "Confirmar cadastro" }).click();
    await expect(
      page.getByRole("heading", { name: "Pessoa cadastrada" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Voltar para Pessoas" }).click();
    await page.getByLabel("Buscar pessoa").fill(suffix);
    await page.getByRole("cell", { name: `Pessoa E2E ${suffix}` }).click();
    await expect(
      page.getByRole("heading", { name: `Pessoa E2E ${suffix}` }),
    ).toBeVisible();

    const person = await db.pessoa.findFirstOrThrow({
      where: { nomeCompleto: `Pessoa E2E ${suffix}` },
    });
    await page.getByRole("tab", { name: "Vínculo", exact: true }).click();
    await page
      .getByRole("button", { name: "Editar vínculo", exact: true })
      .click();
    const closeCurrent = page.getByRole("dialog");
    await page
      .getByRole("combobox", { name: "Status" })
      .selectOption("DESLIGADO");
    await page
      .getByRole("textbox", { name: "Data de desligamento" })
      .fill("2024-12-31");
    await closeCurrent
      .getByRole("button", { name: "Salvar", exact: true })
      .click();
    await expect(closeCurrent).toBeHidden();
    await page.getByRole("button", { name: "Adicionar vínculo" }).click();
    const linkForm = page.locator(".form-panel");
    await linkForm.getByLabel("Tipo", { exact: true }).selectOption("ESTAGIO");
    await selectLookup(linkForm, "Unidade", suffix, suffix, true);
    await linkForm.getByLabel("Admissão").fill("2024-01-01");
    await linkForm.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(linkForm).toBeHidden();
    const link = await db.vinculo.findFirstOrThrow({
      where: { pessoaId: person.id, tipo: "ESTAGIO" },
    });

    await page.goto(`/app/pessoas/${person.id}?tab=vinculo`);
    await page
      .getByRole("button", { name: "Editar vínculo", exact: true })
      .last()
      .click();
    const internshipForm = page.getByRole("dialog").last();
    await internshipForm.getByLabel("Período acadêmico").fill("5º");
    await internshipForm.getByLabel("Bolsa", { exact: true }).fill("1800");
    await internshipForm
      .getByRole("button", { name: "Salvar", exact: true })
      .click();
    await expect(internshipForm).toBeHidden();

    await page.goto(`/app/ferias?q=${suffix}`);
    await page
      .getByRole("button", { name: "Programar férias ou descanso" })
      .click();
    const leaveForm = page.getByRole("dialog", {
      name: "Programar férias ou descanso",
    });
    await leaveForm
      .getByRole("button", { name: new RegExp(`${suffix} Estágio`) })
      .click();
    await leaveForm.getByRole("button", { name: "Continuar" }).click();
    await leaveForm.getByRole("button", { name: "Continuar" }).click();
    await leaveForm.getByLabel("Data inicial").fill("2026-01-01");
    await leaveForm.getByLabel("Data final").fill("2026-01-05");
    await leaveForm.getByRole("button", { name: "Continuar" }).click();
    await leaveForm
      .getByRole("button", { name: "Confirmar programação" })
      .click();
    await expect(leaveForm).toBeHidden();

    expect(await db.estagio.count({ where: { vinculoId: link.id } })).toBe(1);
    expect(
      await db.descansoPeriodo.count({ where: { vinculoId: link.id } }),
    ).toBe(1);
    await page.goto("/app/importacoes");
    await expect(page.getByLabel("Etapas da importação")).toBeVisible();
    await page.locator("input[type=file]").setInputFiles({
      name: "sintetico.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`Nome\nImportado ${suffix}`),
    });
    await page
      .getByLabel("Origem Pessoas Nome completo", { exact: true })
      .selectOption("coluna:Nome");
    await page.getByRole("button", { name: "Analisar e gerar prévia" }).click();
    await expect(
      page.getByRole("heading", { name: /sintetico.csv/ }),
    ).toContainText("CONFIRMADA");

    await page.goto("/app/relatorios");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar CSV" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe(
      "duali-pessoas.csv",
    );

    await page.goto("/app/admin/auditoria");
    await page.getByPlaceholder("Usuário, entidade ou ação").fill("pessoa");
    await expect(
      page.getByRole("heading", { name: "Auditoria" }),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(
      page.getByRole("dialog", { name: "Navegação principal" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Pessoas", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "artifacts/menu-mobile.png",
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
