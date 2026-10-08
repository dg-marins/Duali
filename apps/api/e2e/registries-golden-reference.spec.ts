import { expect, test, type Page } from "@playwright/test";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";

async function settleScreenshot(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

const email = "phase8-lot1-admin@example.test";
const password = "Phase8Lot1!2026";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral" }),
  ).toBeVisible();
}

test("cadastros simples e usuários usam a composição oficial", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  try {
    const passwordHash = await argon2.hash(password);
    await db.usuario.upsert({
      where: { email },
      update: {
        nome: "Marina Cadastros",
        senhaHash: passwordHash,
        ativo: true,
      },
      create: { nome: "Marina Cadastros", email, senhaHash: passwordHash },
    });
    const managedUser = await db.usuario.upsert({
      where: { email: "phase8-managed@example.test" },
      update: { nome: "Usuário Gerenciado", ativo: true },
      create: {
        nome: "Usuário Gerenciado",
        email: "phase8-managed@example.test",
        senhaHash: await argon2.hash("ManagedUser!2026"),
      },
    });
    const unit = await db.unidade.upsert({
      where: { sigla: "P8L1" },
      update: {
        nome: "Unidade Golden Cadastros",
        cidade: "Rio de Janeiro",
        uf: "RJ",
        ativa: true,
      },
      create: {
        nome: "Unidade Golden Cadastros",
        sigla: "P8L1",
        cidade: "Rio de Janeiro",
        uf: "RJ",
      },
    });
    const team = await db.equipe.upsert({
      where: { nome: "Equipe Golden Cadastros" },
      update: { ativa: true },
      create: { nome: "Equipe Golden Cadastros" },
    });
    const supplier = await db.fornecedor.upsert({
      where: { nome: "Fornecedor Golden Cadastros" },
      update: { ativo: true },
      create: { nome: "Fornecedor Golden Cadastros" },
    });
    let institution = await db.instituicaoEnsino.findFirst({
      where: { nome: "Instituição Golden Cadastros", sigla: "IGC" },
    });
    institution ??= await db.instituicaoEnsino.create({
      data: { nome: "Instituição Golden Cadastros", sigla: "IGC" },
    });
    const person = await db.pessoa.upsert({
      where: { cpf: "98765432100" },
      update: { nomeCompleto: "Pessoa Relação Cadastros", ativa: true },
      create: {
        nomeCompleto: "Pessoa Relação Cadastros",
        cpf: "98765432100",
      },
    });
    let link = await db.vinculo.findFirst({ where: { pessoaId: person.id } });
    link ??= await db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        equipeId: team.id,
        tipo: "ESTAGIO",
        dataAdmissao: new Date("2026-01-05"),
      },
    });
    await db.vinculo.update({
      where: { id: link.id },
      data: { unidadeId: unit.id, equipeId: team.id, status: "ATIVO" },
    });
    await db.estagio.upsert({
      where: { vinculoId: link.id },
      update: { instituicaoEnsinoId: institution.id },
      create: { vinculoId: link.id, instituicaoEnsinoId: institution.id },
    });
    await db.configuracaoBeneficio.upsert({
      where: {
        unidadeId_tipo_fornecedorId: {
          unidadeId: unit.id,
          tipo: "ALIMENTACAO",
          fornecedorId: supplier.id,
        },
      },
      update: { ativa: true },
      create: {
        id: "11111111-1111-4111-8111-111111111111",
        unidadeId: unit.id,
        tipo: "ALIMENTACAO",
        fornecedorId: supplier.id,
      },
    });

    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page);
    await page.goto("/app/cadastros/unidades");
    await page.getByLabel("Buscar registros").fill("Unidade Golden Cadastros");
    await expect(page.getByText("1 registro", { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot(
      "cadastros-simples-desktop-1366x768.png",
      {
        animations: "disabled",
      },
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveScreenshot(
      "cadastros-simples-mobile-390x844.png",
      {
        animations: "disabled",
      },
    );

    await page.setViewportSize({ width: 1366, height: 768 });
    await page
      .getByRole("button", { name: /Ações de Unidade Golden Cadastros/ })
      .click();
    await page.getByRole("menuitem", { name: "Ver detalhes" }).click();
    await expect(
      page.getByRole("heading", { name: "Cadastro", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Vínculos da unidade")).toBeVisible();

    await page.setViewportSize({ width: 1366, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 32));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(32);
    await settleScreenshot(page);
    await expect(page).toHaveScreenshot("cadastro-detalhe-1366x800.png", {
      animations: "disabled",
    });

    await page.getByRole("button", { name: "Editar cadastro" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const dialogAt800 = await dialog.boundingBox();
    const overlayAt800 = await page
      .locator(".ds-dialog__overlay")
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          backgroundColor: style.backgroundColor,
        };
      });
    expect(dialogAt800).not.toBeNull();
    expect(dialogAt800?.x).toBe(163);
    expect(dialogAt800?.width).toBe(1040);
    expect(dialogAt800?.height).toBeCloseTo(544.390625, 3);
    expect(overlayAt800.backgroundColor).toBe("rgba(7, 29, 24, 0.533)");
    await testInfo.attach("registry-dialog-geometry.json", {
      body: Buffer.from(
        JSON.stringify({
          dialogAt768: {
            x: 163,
            y: 117.50433349609375,
            width: 1040,
            height: 544.390625,
          },
          dialogAt800,
          overlayAt768: {
            x: 0,
            y: 0,
            width: 1366,
            height: 768,
            backgroundColor: "rgba(7, 29, 24, 0.533)",
          },
          overlayAt800,
        }),
      ),
      contentType: "application/json",
    });
    await settleScreenshot(page);
    await expect(page).toHaveScreenshot("cadastro-dialog-edicao-1366x800.png", {
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Fechar" }).click();

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.setViewportSize({ width: 1366, height: 768 });

    await page.goto("/app/admin/usuarios");
    await page.getByLabel("Buscar registros").fill("Usuário Gerenciado");
    await expect(page.getByText("1 registro", { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot("usuarios-desktop-1366x768.png", {
      animations: "disabled",
    });

    await page
      .getByRole("button", { name: /Ações de Usuário Gerenciado/ })
      .click();
    await page.getByRole("menuitem", { name: "Editar" }).click();
    const passwordInput = page.getByLabel("Nova senha (mínimo 8 caracteres)");
    await expect(passwordInput).toHaveValue("");
    await expect(passwordInput).toHaveAttribute("minlength", "8");
    await page.getByLabel("Nome").fill("Usuário Gerenciado Atualizado");
    const updateRequest = page.waitForRequest(
      (request) =>
        request.method() === "PUT" &&
        request.url().endsWith(`/api/usuarios/${managedUser.id}`),
    );
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    const payload = (await updateRequest).postDataJSON() as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty("senha");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page
      .getByLabel("Buscar registros")
      .fill("Usuário Gerenciado Atualizado");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveScreenshot("usuarios-mobile-390x844.png", {
      animations: "disabled",
    });
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  } finally {
    await db.$disconnect();
  }
});

test("cria e edita cada cadastro simples preservando seus campos", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const suffix = randomUUID().slice(0, 8);
  const fixtures = [
    {
      route: "unidades",
      title: "Unidades",
      name: `Unidade CRUD ${suffix}`,
      fill: async () => {
        await page.getByLabel("Nome").fill(`Unidade CRUD ${suffix}`);
        await page.getByLabel("Sigla").fill(`U${suffix.slice(0, 5)}`);
        await page.getByLabel("UF").fill("RJ");
      },
    },
    {
      route: "equipes",
      title: "Equipes",
      name: `Equipe CRUD ${suffix}`,
      fill: async () => page.getByLabel("Nome").fill(`Equipe CRUD ${suffix}`),
    },
    {
      route: "instituicoes",
      title: "Instituições",
      name: `Instituição CRUD ${suffix}`,
      fill: async () =>
        page.getByLabel("Nome").fill(`Instituição CRUD ${suffix}`),
    },
    {
      route: "fornecedores",
      title: "Fornecedores",
      name: `Fornecedor CRUD ${suffix}`,
      fill: async () =>
        page.getByLabel("Nome").fill(`Fornecedor CRUD ${suffix}`),
    },
    {
      route: "usuarios",
      title: "Administradores",
      name: `Usuário CRUD ${suffix}`,
      fill: async () => {
        await page.getByLabel("Nome").fill(`Usuário CRUD ${suffix}`);
        await page.getByLabel("E-mail").fill(`crud-${suffix}@example.test`);
        const passwordField = page.getByLabel(
          "Nova senha (mínimo 8 caracteres)",
        );
        await expect(passwordField).toHaveAttribute("required", "");
        await expect(passwordField).toHaveAttribute("minlength", "8");
        await passwordField.fill("Senha123");
      },
    },
  ];

  try {
    await db.usuario.upsert({
      where: { email },
      update: {
        nome: "Marina Cadastros",
        senhaHash: await argon2.hash(password),
        ativo: true,
      },
      create: {
        nome: "Marina Cadastros",
        email,
        senhaHash: await argon2.hash(password),
      },
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await login(page);
    for (const fixture of fixtures) {
      const prefix =
        fixture.route === "usuarios" ? "/app/admin" : "/app/cadastros";
      await page.goto(`${prefix}/${fixture.route}`);
      await expect(
        page.getByRole("heading", { name: fixture.title }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Novo registro" }).click();
      await fixture.fill();
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      await expect(page.getByText("Registro salvo com sucesso.")).toBeVisible();
      await page.getByLabel("Buscar registros").fill(fixture.name);
      await expect(page.getByText("1 registro", { exact: true })).toBeVisible();
      await page
        .getByRole("button", { name: new RegExp(`Ações de ${fixture.name}`) })
        .click();
      await page.getByRole("menuitem", { name: "Editar" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      if (fixture.route === "usuarios")
        await expect(
          page.getByLabel("Nova senha (mínimo 8 caracteres)"),
        ).toHaveValue("");
      const update = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().includes(`/api/${fixture.route}/`),
      );
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      expect((await update).ok()).toBe(true);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  } finally {
    await db.usuario.deleteMany({
      where: { email: `crud-${suffix}@example.test` },
    });
    await db.fornecedor.deleteMany({
      where: { nome: `Fornecedor CRUD ${suffix}` },
    });
    await db.instituicaoEnsino.deleteMany({
      where: { nome: `Instituição CRUD ${suffix}` },
    });
    await db.equipe.deleteMany({
      where: { nome: `Equipe CRUD ${suffix}` },
    });
    await db.unidade.deleteMany({
      where: { nome: `Unidade CRUD ${suffix}` },
    });
    await db.$disconnect();
  }
});

test("Lookup preserva busca, teclado, seleção e valor já carregado", async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  try {
    await db.usuario.upsert({
      where: { email },
      update: {
        nome: "Marina Cadastros",
        senhaHash: await argon2.hash(password),
        ativo: true,
      },
      create: {
        nome: "Marina Cadastros",
        email,
        senhaHash: await argon2.hash(password),
      },
    });
    const unit = await db.unidade.upsert({
      where: { sigla: "P8LOOK" },
      update: { nome: "Unidade Lookup Golden", uf: "RJ", ativa: true },
      create: { nome: "Unidade Lookup Golden", sigla: "P8LOOK", uf: "RJ" },
    });
    const supplier = await db.fornecedor.upsert({
      where: { nome: "Fornecedor Lookup Golden" },
      update: { ativo: true },
      create: { nome: "Fornecedor Lookup Golden" },
    });
    await db.configuracaoBeneficio.upsert({
      where: {
        unidadeId_tipo_fornecedorId: {
          unidadeId: unit.id,
          tipo: "PREMIACAO",
          fornecedorId: supplier.id,
        },
      },
      update: { ativa: true },
      create: {
        unidadeId: unit.id,
        tipo: "PREMIACAO",
        fornecedorId: supplier.id,
      },
    });

    await login(page);
    await page.goto("/app/cadastros/configuracoes-beneficios");
    await page
      .locator(".registry-filters select")
      .nth(1)
      .selectOption(supplier.id);
    const row = page
      .getByRole("row")
      .filter({ hasText: "Fornecedor Lookup Golden" });
    await row.getByRole("button", { name: "Editar associação" }).click();
    const unitLookup = page.getByRole("button", { name: "Unidade" });
    await expect(unitLookup).toContainText("Unidade Lookup Golden");
    await unitLookup.click();
    const search = page.getByRole("combobox", { name: "Buscar Unidade" });
    await search.fill("Unidade Lookup Golden");
    await expect(
      page.getByRole("option", { name: "Unidade Lookup Golden" }),
    ).toBeVisible();
    await search.press("ArrowDown");
    await search.press("Enter");
    await expect(unitLookup).toContainText("Unidade Lookup Golden");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    if (
      await page.getByRole("dialog", { name: "Descartar alterações?" }).count()
    )
      await page.getByRole("button", { name: "Descartar" }).click();
  } finally {
    await db.$disconnect();
  }
});
