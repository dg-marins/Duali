import { expect, test, type Page } from "@playwright/test";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";

const email = "person-create-golden@example.test";
const password = "PersonCreateGolden!2026";

async function openCreate(page: Page) {
  await page.goto("/app/pessoas/nova?q=Golden&page=2&tipo=ESTAGIO");
  await expect(
    page.getByRole("heading", { name: "Nova pessoa", exact: true }),
  ).toBeVisible();
}

async function fillPersonal(page: Page) {
  await page.getByLabel("Nome completo").fill("Marina Cadastro Golden");
  await page.getByLabel("CPF").fill("52998224725");
  await page.getByLabel("RG").fill("123456789");
  await page.getByLabel("Data de nascimento").fill("1994-05-18");
  await page.getByLabel("E-mail").fill("marina.cadastro@example.test");
  await page.getByLabel("Telefone").fill("21987654321");
  await page
    .getByLabel("Observações")
    .fill("Cadastro preparado para a referência visual.");
}

async function goToLink(page: Page) {
  await fillPersonal(page);
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(
    page.getByRole("heading", { name: "Vínculo", exact: true }),
  ).toBeVisible();
}

async function goToInternship(page: Page, unitId: string, teamId: string) {
  await goToLink(page);
  await page.getByLabel("Unidade").selectOption(unitId);
  await page.getByLabel("Equipe").selectOption(teamId);
  await page.getByLabel("Tipo").selectOption("ESTAGIO");
  await page.getByLabel("Admissão").fill("2026-02-02");
  await page.getByLabel("Matrícula").fill("EST-2026-014");
  await page.getByLabel("Cargo/Função").fill("Estágio em Produto");
  await page.getByLabel("Gestor").fill("Douglas Marins");
  await page.getByLabel("Modalidade").selectOption("DIAS_SEMANA");
  await page.getByLabel("Segunda").check();
  await page.getByLabel("Quarta").check();
  await page.getByLabel("Sexta").check();
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(
    page.getByRole("heading", { name: "Dados do estágio" }),
  ).toBeVisible();
}

async function fillInternship(page: Page, institutionId: string) {
  await page.getByLabel("Instituição de ensino").selectOption(institutionId);
  await page.getByLabel("Período acadêmico").fill("4º período");
  await page.getByLabel("Bolsa").fill("R$ 1.850,00");
  await page.getByLabel("Bolsa").press("Tab");
  await page.getByLabel("Fim previsto do estágio").fill("2027-12-01");
  await page.getByLabel("Periodicidade do TCE/aditivo (meses)").fill("6");
}

test("Golden Reference do Cadastro de Pessoa", async ({ page }) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15_000);
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  try {
    await db.usuario.upsert({
      where: { email },
      update: {
        nome: "Marina Cadastro",
        senhaHash: await argon2.hash(password),
        ativo: true,
      },
      create: {
        nome: "Marina Cadastro",
        email,
        senhaHash: await argon2.hash(password),
      },
    });
    const unit = await db.unidade.upsert({
      where: { sigla: "UCG" },
      update: { nome: "Unidade Cadastro Golden", uf: "RJ", ativa: true },
      create: {
        nome: "Unidade Cadastro Golden",
        sigla: "UCG",
        uf: "RJ",
      },
    });
    const team = await db.equipe.upsert({
      where: { nome: "Equipe Cadastro Golden" },
      update: { ativa: true },
      create: { nome: "Equipe Cadastro Golden" },
    });
    const existingInstitution = await db.instituicaoEnsino.findFirst({
      where: { nome: "Universidade Cadastro Golden" },
    });
    const institution = existingInstitution
      ? await db.instituicaoEnsino.update({
          where: { id: existingInstitution.id },
          data: { sigla: "UCG", ativa: true },
        })
      : await db.instituicaoEnsino.create({
          data: {
            nome: "Universidade Cadastro Golden",
            sigla: "UCG",
          },
        });

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(
      page.getByRole("heading", { name: "Visão geral", exact: true }),
    ).toBeVisible();

    await openCreate(page);
    await expect(page).toHaveScreenshot(
      "cadastro-pessoa-dados-desktop-1366x768.png",
      { animations: "disabled" },
    );
    await page.getByRole("button", { name: "Próximo" }).click();
    await expect(page.getByText("Informe o nome completo.")).toBeVisible();
    await expect(page.getByLabel("Nome completo")).toBeFocused();
    await expect(page).toHaveScreenshot(
      "cadastro-pessoa-validation-desktop-1366x768.png",
      { animations: "disabled" },
    );

    await goToLink(page);
    await expect(page).toHaveScreenshot(
      "cadastro-pessoa-vinculo-desktop-1366x768.png",
      { animations: "disabled" },
    );
    await page.getByLabel("Unidade").selectOption(unit.id);
    await page.getByLabel("Equipe").selectOption(team.id);
    await page.getByLabel("Tipo").selectOption("ESTAGIO");
    await page.getByLabel("Admissão").fill("2026-02-02");
    await page.getByRole("button", { name: "Próximo" }).click();
    await expect(page).toHaveScreenshot(
      "cadastro-pessoa-estagio-desktop-1366x768.png",
      { animations: "disabled" },
    );
    await fillInternship(page, institution.id);
    await page.getByRole("button", { name: "Próximo" }).click();
    await expect(page).toHaveScreenshot(
      "cadastro-pessoa-revisao-desktop-1366x768.png",
      { animations: "disabled" },
    );

    await page.getByRole("button", { name: "Editar" }).last().click();
    await expect(page.getByLabel("Bolsa")).toHaveValue("R$ 1.850,00");
    await page.getByRole("button", { name: "Voltar" }).click();
    await page.getByLabel("Tipo").selectOption("CLT");
    await page.getByRole("button", { name: "Próximo" }).click();
    await expect(
      page.getByText("Dados do estágio", { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Editar" }).nth(1).click();
    await page.getByLabel("Tipo").selectOption("ESTAGIO");
    await page.getByRole("button", { name: "Próximo" }).click();
    await expect(page.getByLabel("Bolsa")).toHaveValue("R$ 1.850,00");

    await page.setViewportSize({ width: 390, height: 844 });
    await openCreate(page);
    await expect(page).toHaveScreenshot(
      "cadastro-pessoa-mobile-dados-390x844.png",
      { animations: "disabled" },
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await goToInternship(page, unit.id, team.id);
    await fillInternship(page, institution.id);
    await expect(page).toHaveScreenshot(
      "cadastro-pessoa-mobile-estagio-390x844.png",
      { animations: "disabled" },
    );
    await page.getByRole("button", { name: "Próximo" }).click();
    await expect(page).toHaveScreenshot(
      "cadastro-pessoa-mobile-revisao-390x844.png",
      { animations: "disabled" },
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Editar" }).first().click();
    await page.getByLabel("Nome completo").fill("Alteração pendente");
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(
      page.getByRole("dialog", { name: "Descartar alterações?" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      "cadastro-pessoa-dirty-confirmation-390x844.png",
      { animations: "disabled" },
    );
    await page
      .getByRole("dialog", { name: "Descartar alterações?" })
      .getByRole("button", { name: "Continuar editando" })
      .click();
    await expect(page.getByLabel("Nome completo")).toHaveValue(
      "Alteração pendente",
    );
    await page.goBack();
    await expect(
      page.getByRole("dialog", { name: "Descartar alterações?" }),
    ).toBeVisible();
    await page
      .getByRole("dialog", { name: "Descartar alterações?" })
      .getByRole("button", { name: "Continuar editando" })
      .click();
    await expect(page).toHaveURL(/\/app\/pessoas\/nova\?/);

    await page.setViewportSize({ width: 1366, height: 768 });
    await openCreate(page);
    await fillPersonal(page);
    await page.getByRole("button", { name: "Próximo" }).click();
    await page.getByLabel("Adicionar vínculo inicial").uncheck();
    await page.getByRole("button", { name: "Próximo" }).click();
    await page.route("**/api/pessoas", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
      });
    });
    await page.getByRole("button", { name: "Confirmar cadastro" }).click();
    await expect(
      page.getByRole("heading", { name: "Pessoa cadastrada" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      "cadastro-pessoa-sucesso-desktop-1366x768.png",
      { animations: "disabled" },
    );

    await openCreate(page);
    await fillPersonal(page);
    await page.getByRole("button", { name: "Próximo" }).click();
    await page.getByLabel("Unidade").selectOption(unit.id);
    await page.getByLabel("Admissão").fill("2026-02-02");
    await page.getByRole("button", { name: "Próximo" }).click();
    let requests = 0;
    await page.route("**/api/pessoas-com-vinculo", async (route) => {
      requests += 1;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          pessoa: { id: "22222222-2222-4222-8222-222222222222" },
          vinculo: { id: "33333333-3333-4333-8333-333333333333" },
          estagio: null,
        }),
      });
    });
    await page.getByRole("button", { name: "Confirmar cadastro" }).dblclick();
    await expect(
      page.getByRole("heading", { name: "Pessoa cadastrada" }),
    ).toBeVisible();
    expect(requests).toBe(1);
    await page.getByRole("button", { name: "Abrir perfil" }).click();
    await expect(page).toHaveURL(
      /\/app\/pessoas\/22222222-2222-4222-8222-222222222222$/,
    );
  } finally {
    await db.$disconnect();
  }
});
