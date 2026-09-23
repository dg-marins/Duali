import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";

test("Golden Reference: exclusive segments, profile, registry and responsive shell", async ({
  page,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(10000);
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const suffix = randomUUID(),
    email = suffix + "@golden.test",
    password = randomUUID() + "Aa!";
  const screenshot = async (name: string) =>
    page.screenshot({
      path: "artifacts/golden-reference/" + name + ".png",
      fullPage: true,
    });
  try {
    await db.usuario.create({
      data: {
        nome: "Marina Costa",
        email,
        senhaHash: await argon2.hash(password),
      },
    });
    const unit = await db.unidade.create({
      data: {
        nome: "Unidade Golden RJ " + suffix,
        sigla: suffix.slice(0, 12),
        uf: "RJ",
      },
    });
    const otherUnit = await db.unidade.create({
      data: {
        nome: "Unidade Golden SP " + suffix,
        sigla: suffix.slice(0, 11) + "S",
        uf: "SP",
      },
    });
    const team = await db.equipe.create({
      data: { nome: "Equipe Golden " + suffix },
    });
    const institution = await db.instituicaoEnsino.create({
      data: {
        nome: "Universidade Golden " + suffix,
        sigla: "UG" + suffix.slice(0, 8),
      },
    });
    const supplier = await db.fornecedor.create({
      data: { nome: "Fornecedor Golden " + suffix },
    });
    let internshipId = "";
    for (const [index, tipo] of (
      ["CLT", "ESTAGIO", "APRENDIZ", "TRAINEE", null] as const
    ).entries()) {
      const person = await db.pessoa.create({
        data: {
          nomeCompleto: [
            "Ana Costa",
            "Bruno Almeida",
            "Carla Santos",
            "Daniel Souza",
            "Elisa Lima",
          ][index],
          email: index + "-" + suffix + "@golden.test",
        },
      });
      if (tipo) {
        const link = await db.vinculo.create({
          data: {
            pessoaId: person.id,
            unidadeId: unit.id,
            equipeId: team.id,
            tipo,
            dataAdmissao: new Date("2026-01-01"),
          },
        });
        if (tipo === "ESTAGIO") {
          internshipId = person.id;
          await db.estagio.create({
            data: {
              vinculoId: link.id,
              instituicaoEnsinoId: institution.id,
              valorBolsa: "1800.00",
              periodoAcademico: "6º",
              dataTerminoPrevista: new Date("2028-01-01"),
            },
          });
          await db.documentoVinculo.create({
            data: {
              vinculoId: link.id,
              tipo: "TCE",
              status: "PENDENTE",
              inicioVigencia: new Date("2026-01-01"),
              fimVigencia: new Date("2026-07-01"),
            },
          });
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Visão geral", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 480 });
    const sidebar = page.locator(".app-shell > .app-sidebar");
    const navigation = sidebar.locator(".app-sidebar-nav");
    const account = sidebar.locator(".app-sidebar-account");
    const operation = page.getByRole("button", {
      name: "Operação",
      exact: true,
    });
    await operation.focus();
    await page.keyboard.press("Enter");
    await expect(operation).toHaveAttribute("aria-expanded", "true");
    await expect(operation.locator(".app-sidebar-chevron")).toHaveClass(
      /app-sidebar-chevron/,
    );
    await page.keyboard.press("Space");
    await expect(operation).toHaveAttribute("aria-expanded", "false");
    for (const title of ["Operação", "Dados", "Cadastros", "Administração"])
      await page.getByRole("button", { name: title, exact: true }).click();
    expect(
      await navigation.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await navigation.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const sidebarBox = await sidebar.boundingBox();
    const accountBox = await account.boundingBox();
    expect(Math.abs(sidebarBox?.y ?? 0)).toBeLessThan(1);
    expect(Math.round(sidebarBox?.height ?? 0)).toBe(480);
    expect(
      (accountBox?.y ?? 0) + (accountBox?.height ?? 0),
    ).toBeLessThanOrEqual(480);
    await page.evaluate(() => {
      const main = document.querySelector(
        ".app-shell > .app-shell-main",
      ) as HTMLElement;
      main.style.minHeight = "2000px";
      window.scrollTo({ top: 600 });
    });
    expect(Math.abs((await sidebar.boundingBox())?.y ?? 0)).toBeLessThan(1);
    await page.evaluate(() => {
      const main = document.querySelector(
        ".app-shell > .app-shell-main",
      ) as HTMLElement;
      main.style.minHeight = "";
      window.scrollTo({ top: 0 });
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(operation.locator(".app-sidebar-chevron")).toHaveCSS(
      "transition-duration",
      "1e-05s",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const title of ["Operação", "Dados", "Cadastros", "Administração"])
      await page.getByRole("button", { name: title, exact: true }).click();
    await navigation.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/app/pessoas?q=" + suffix);
    const segments = page.locator(".people-segment");
    await expect(page.getByText("5 pessoas encontradas")).toBeVisible();
    await expect(
      segments.filter({ has: page.locator('[aria-pressed="true"]') }),
    ).toHaveCount(0);
    await screenshot("pessoas-geral-sidebar-expandida");
    const clt = segments.filter({ hasText: "CLT" });
    await clt.click();
    await expect(page.getByText("1 pessoas encontradas")).toBeVisible();
    await expect(
      page.locator('.people-segment[aria-pressed="true"]'),
    ).toHaveCount(1);
    await expect(page.locator("[data-person-id]")).toHaveCount(1);
    await screenshot("pessoas-clt");
    const internship = segments.filter({ hasText: "Estágio" });
    await internship.press("Enter");
    await expect(
      page.getByRole("columnheader", { name: "Instituição", exact: true }),
    ).toBeVisible();
    await expect(clt).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.locator('[data-person-id="' + internshipId + '"]'),
    ).toBeVisible();
    await expect(
      page.locator(".golden-people .refreshing-content"),
    ).toHaveAttribute("aria-busy", "false");
    await screenshot("pessoas-estagio");
    await internship.click();
    await expect(page.getByText("5 pessoas encontradas")).toBeVisible();
    await page.getByRole("button", { name: "Recolher menu" }).click();
    await screenshot("sidebar-recolhida");
    await page.getByRole("button", { name: /^Cadastros\b/ }).click();
    const flyout = page.locator(".app-sidebar-flyout");
    await expect(
      flyout.getByRole("menuitem", { name: "Benefícios" }),
    ).toBeVisible();
    await screenshot("sidebar-recolhida-flyout");
    await flyout.getByRole("menuitem", { name: "Benefícios" }).click();
    await expect(page).toHaveURL(/\/app\/cadastros\/configuracoes-beneficios/);
    await page.getByRole("button", { name: "Pessoas", exact: true }).click();
    await page.getByRole("button", { name: "Expandir menu" }).click();
    await page.getByLabel("Buscar pessoa").fill(suffix);
    await expect(page.getByText("5 pessoas encontradas")).toBeVisible();
    await page.locator('[data-person-id="' + internshipId + '"]').click();
    await expect(
      page.getByRole("heading", { name: /Bruno Almeida/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Descanso", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".golden-profile").locator("../.."),
    ).toHaveAttribute("aria-busy", "false");
    await screenshot("perfil-pessoa");
    await page.getByRole("button", { name: "← Pessoas", exact: true }).click();
    await expect(page.getByLabel("Buscar pessoa")).toHaveValue(suffix);
    await expect(
      page.locator('[data-person-id="' + internshipId + '"]'),
    ).toBeFocused();
    await page.goto("/app/cadastros/configuracoes-beneficios");
    await page.getByRole("button", { name: "+ Associar benefício" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("combobox", { name: "Benefício" })
      .selectOption("ALIMENTACAO");
    await dialog
      .getByRole("combobox", { name: "Fornecedor" })
      .selectOption(supplier.id);
    await dialog.getByLabel(unit.nome, { exact: true }).check();
    await dialog.getByLabel(otherUnit.nome, { exact: true }).check();
    await dialog.getByRole("button", { name: "Salvar associações" }).click();
    await expect(dialog).toBeHidden();
    await page
      .getByRole("combobox", { name: "Fornecedor" })
      .selectOption(supplier.id);
    await expect(
      page.getByRole("cell", {
        name: "Fornecedor Golden " + suffix,
        exact: true,
      }),
    ).toHaveCount(2);
    await screenshot("cadastros-beneficios");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/pessoas?q=" + suffix + "&tipo=ESTAGIO");
    await expect(page.getByText("1 pessoas encontradas")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await screenshot("pessoas-mobile");
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(
      page.getByRole("dialog", { name: "Navegação principal" }),
    ).toBeVisible();
    await screenshot("sidebar-mobile");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Navegação principal" }),
    ).toHaveCount(0);
  } finally {
    await db.$disconnect();
  }
});
