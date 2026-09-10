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
    await expect(container.getByRole("button", { name: label, exact: true })).toBeFocused();
    await container.getByRole("button", { name: label, exact: true }).click();
    if (query) await container.getByLabel(`Buscar ${label}`).fill(query);
    await container.getByRole("option", { name: new RegExp(option) }).click();
  } else await match.click();
}

test("administrator completes the operational RH journey", async ({ page }) => {
  test.setTimeout(150_000);
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
    await expect(page.getByRole("button", { name: "Equipes", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Cadastros", exact: true }).click();
    await expect(page.getByRole("button", { name: "Equipes", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Expandir menu" }).click();
    await page.getByRole("button", { name: "Equipes", exact: true }).click();
    await page.getByRole("button", { name: "Novo registro" }).click();
    const teamDialog = page.getByRole("dialog", { name: /Novo registro · Equipes/ });
    await expect(teamDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(teamDialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Novo registro" })).toBeFocused();
    await page.getByRole("button", { name: "Novo registro" }).click();
    await teamDialog.getByLabel("Nome *").fill(`Equipe descartada ${suffix}`);
    await teamDialog.getByRole("button", { name: "Cancelar" }).click();
    const discardDialog = page.getByRole("dialog", { name: "Descartar alterações?" });
    await expect(discardDialog).toBeVisible();
    await discardDialog.getByRole("button", { name: "Descartar" }).click();
    await expect(teamDialog).toBeHidden();

    await page.getByRole("button", { name: "Pessoas", exact: true }).click();
    await page.getByRole("button", { name: "+ Nova pessoa" }).click();
    const personForm = page.locator(".form-panel");
    await personForm.getByLabel("Nome completo *").fill("Rascunho");
    await page.getByRole("button", { name: "← Voltar" }).click();
    await expect(page.getByRole("dialog", { name: "Descartar alterações?" })).toBeVisible();
    await page.getByRole("button", { name: "Continuar editando" }).click();
    await personForm.getByLabel("Nome completo *").fill(`Pessoa E2E ${suffix}`);
    await personForm.getByLabel("E-mail").fill(`pessoa-${suffix}@example.test`);
    await personForm.getByLabel("CEP").fill("20000-000");
    await personForm.getByLabel("Logradouro").fill("Rua do teste");
    await personForm.getByLabel("Número").fill("15");
    await personForm.getByLabel("UF").fill("RJ");
    await personForm
      .getByRole("button", { name: "Salvar", exact: true })
      .click();
    await expect(personForm).toBeHidden();
    await page.getByLabel("Buscar pessoa").fill(suffix);
    await page.getByRole("cell", { name: `Pessoa E2E ${suffix}` }).click();
    await expect(
      page.getByRole("heading", { name: `Pessoa E2E ${suffix}` }),
    ).toBeVisible();

    const person = await db.pessoa.findFirstOrThrow({
      where: { nomeCompleto: `Pessoa E2E ${suffix}` },
    });
    expect(person.logradouro).toBe("Rua do teste");
    const unit = await db.unidade.create({
      data: {
        nome: `Unidade E2E ${suffix}`,
        sigla: suffix.slice(0, 12),
        uf: "RJ",
      },
    });
    await page.getByRole("tab", { name: "Vínculo", exact: true }).click();
    await page.getByRole("button", { name: "Adicionar vínculo" }).click();
    const linkForm = page.locator(".form-panel");
    await linkForm.getByLabel("Tipo", { exact: true }).selectOption("ESTAGIO");
    await selectLookup(linkForm, "Unidade", suffix, suffix, true);
    await linkForm.getByLabel("Admissão").fill("2024-01-01");
    await linkForm.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(linkForm).toBeHidden();
    const link = await db.vinculo.findFirstOrThrow({
      where: { pessoaId: person.id },
    });

    await page
      .getByRole("button", { name: "Estagiários", exact: true })
      .click();
    await page.getByRole("button", { name: "Novo estágio" }).click();
    const internshipForm = page.locator(".form-panel");
    await selectLookup(internshipForm, "Vínculo", suffix, suffix);
    await internshipForm.getByLabel("Período acadêmico").fill("5º");
    await internshipForm.getByLabel("Bolsa (R$)").fill("1800");
    await internshipForm
      .getByRole("button", { name: "Salvar", exact: true })
      .click();
    await expect(internshipForm).toBeHidden();

    await page
      .getByRole("button", { name: "Férias e descanso", exact: true })
      .click();
    await page.getByRole("button", { name: "Programar período" }).click();
    const leaveForm = page.locator(".form-panel");
    await selectLookup(leaveForm, "Vínculo", suffix, suffix);
    await leaveForm
      .getByLabel("Tipo", { exact: true })
      .selectOption("DESCANSO_ESTAGIO");
    await leaveForm.getByLabel("Início").fill("2026-01-01");
    await leaveForm.getByLabel("Fim").fill("2026-01-05");
    await leaveForm.getByRole("button", { name: "Usar sugestão" }).click();
    await leaveForm
      .getByRole("button", { name: "Salvar", exact: true })
      .click();
    await expect(leaveForm).toBeHidden();

    const supplier = await db.fornecedor.create({
      data: { nome: `Fornecedor E2E ${suffix}` },
    });
    const config = await db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: supplier.id,
        tipo: "ALIMENTACAO",
      },
    });
    await page.getByRole("button", { name: "Benefícios", exact: true }).click();
    await page.getByRole("button", { name: "Nova adesão" }).click();
    const enrollmentForm = page.locator(".form-panel");
    await selectLookup(enrollmentForm, "Vínculo", suffix, suffix);
    await enrollmentForm
      .getByLabel("Tipo", { exact: true })
      .selectOption("ALIMENTACAO");
    await enrollmentForm.getByLabel("Início da vigência").fill("2026-01-01");
    await enrollmentForm
      .getByRole("button", { name: "Salvar", exact: true })
      .click();
    await expect(enrollmentForm).toBeHidden();
    const enrollment = await db.beneficioVinculo.findFirstOrThrow({
      where: { vinculoId: link.id },
    });
    await page.getByRole("button", { name: "Nova competência" }).click();
    const competenceForm = page.locator(".form-panel");
    await selectLookup(competenceForm, "Benefício do vínculo", enrollment.id, enrollment.id);
    await selectLookup(competenceForm, "Configuração por unidade", config.id, config.id);
    await competenceForm
      .getByLabel("Competência (primeiro dia do mês)")
      .fill("2026-01-01");
    await competenceForm.getByLabel("Dias", { exact: true }).fill("20");
    await competenceForm.getByLabel("Valor unitário (R$)").fill("25");
    await competenceForm
      .getByRole("button", { name: "Salvar", exact: true })
      .click();
    await expect(competenceForm).toBeHidden();
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("beneficios-operacional") && response.url().includes("competencia=2026-01")),
      page.locator('input[type="month"]').fill("2026-01"),
    ]);
    await page.getByLabel("Buscar", { exact: true }).fill(suffix);
    await expect(
      page.getByRole("button", { name: `Pessoa E2E ${suffix}`, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Detalhes" }).click();
    await expect(page.locator(".mobile-details-row").getByText("Fornecedor", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });

    expect(await db.estagio.count({ where: { vinculoId: link.id } })).toBe(1);
    expect(
      await db.descansoPeriodo.count({ where: { vinculoId: link.id } }),
    ).toBe(1);
    expect(
      await db.beneficioCompetencia.count({
        where: { beneficioVinculoId: enrollment.id },
      }),
    ).toBe(1);
    await page.screenshot({
      path: "artifacts/beneficios-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Fechamento por competência" })
      .click();
    await page.getByLabel("Buscar unidade").fill(suffix);
    await page.getByLabel("Unidade", { exact: true }).selectOption(unit.id);
    await page.getByRole("textbox", { name: "Competência", exact: true }).fill("2026-01");
    await page.getByRole("button", { name: "Preparar competência" }).click();
    await page.getByRole("button", { name: "Iniciar revisão" }).click();
    await page.getByRole("button", { name: "Fechar competência" }).click();
    await expect(page.getByText("FECHADA", { exact: true })).toBeVisible();

    await page
      .getByRole("button", { name: "Importações", exact: true })
      .click();
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

    await page.getByRole("button", { name: "Relatórios", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar CSV" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe(
      "duali-pessoas.csv",
    );

    await page.getByRole("button", { name: /Administração/ }).click();
    await page.getByRole("button", { name: "Auditoria", exact: true }).click();
    await page.getByPlaceholder("Usuário, entidade ou ação").fill("pessoa");
    await expect(
      page.getByRole("heading", { name: "Auditoria" }),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(page.locator("aside.drawer-open")).toHaveCSS(
      "transform",
      "matrix(1, 0, 0, 1, 0, 0)",
    );
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
