import { expect, test, type Page } from "@playwright/test";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";

const email = "design-system-baseline@example.test";
const password = "DualiBaseline!2026";
const competence = "2026-09-01";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
}

test("baseline visual anterior às foundations do Design System", async ({
  page,
}) => {
  test.skip(
    true,
    "Baseline histórico anterior ao AppShell; os snapshots before-* são imutáveis.",
  );
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });

  try {
    await db.usuario.upsert({
      where: { email },
      update: {
        nome: "Marina Baseline",
        senhaHash: await argon2.hash(password),
        ativo: true,
      },
      create: {
        nome: "Marina Baseline",
        email,
        senhaHash: await argon2.hash(password),
      },
    });
    const unit = await db.unidade.upsert({
      where: { sigla: "DSBASE" },
      update: { nome: "Unidade Baseline", uf: "RJ", ativa: true },
      create: {
        nome: "Unidade Baseline",
        sigla: "DSBASE",
        uf: "RJ",
      },
    });
    const team = await db.equipe.upsert({
      where: { nome: "Equipe Baseline" },
      update: { ativa: true },
      create: { nome: "Equipe Baseline" },
    });
    const person = await db.pessoa.upsert({
      where: { cpf: "00000000000" },
      update: {
        nomeCompleto: "Ana Baseline Visual",
        email: "ana.baseline@example.test",
        ativa: true,
      },
      create: {
        nomeCompleto: "Ana Baseline Visual",
        cpf: "00000000000",
        email: "ana.baseline@example.test",
      },
    });
    let link = await db.vinculo.findFirst({
      where: { pessoaId: person.id, unidadeId: unit.id, tipo: "CLT" },
    });
    link ??= await db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        equipeId: team.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-06"),
      },
    });
    await db.descansoDireito.upsert({
      where: {
        vinculoId_dataAquisicao: {
          vinculoId: link.id,
          dataAquisicao: new Date("2026-01-06"),
        },
      },
      update: { quantidadeDias: "30.00" },
      create: {
        vinculoId: link.id,
        dataAquisicao: new Date("2026-01-06"),
        quantidadeDias: "30.00",
      },
    });
    const supplier = await db.fornecedor.upsert({
      where: { nome: "Fornecedor Baseline" },
      update: { ativo: true },
      create: { nome: "Fornecedor Baseline" },
    });
    const configuration = await db.configuracaoBeneficio.upsert({
      where: {
        unidadeId_tipo_fornecedorId: {
          unidadeId: unit.id,
          tipo: "ALIMENTACAO",
          fornecedorId: supplier.id,
        },
      },
      update: { ativa: true },
      create: {
        unidadeId: unit.id,
        tipo: "ALIMENTACAO",
        fornecedorId: supplier.id,
      },
    });
    let benefit = await db.beneficioVinculo.findFirst({
      where: { vinculoId: link.id, tipo: "ALIMENTACAO" },
    });
    benefit ??= await db.beneficioVinculo.create({
      data: {
        vinculoId: link.id,
        tipo: "ALIMENTACAO",
        inicioVigencia: new Date("2026-01-01"),
        configuracaoRecorrenteId: configuration.id,
        valorDiario: "35.00",
      },
    });
    await db.beneficioCompetencia.upsert({
      where: {
        beneficioVinculoId_configuracaoId_competencia_componente: {
          beneficioVinculoId: benefit.id,
          configuracaoId: configuration.id,
          competencia: new Date(competence),
          componente: "Principal",
        },
      },
      update: {
        quantidadeDias: "22.00",
        valorUnitario: "35.00",
        status: "PENDENTE",
      },
      create: {
        beneficioVinculoId: benefit.id,
        configuracaoId: configuration.id,
        competencia: new Date(competence),
        quantidadeDias: "22.00",
        valorUnitario: "35.00",
      },
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto("/app/pessoas?q=Ana%20Baseline%20Visual");
    await expect(page.getByText("1 pessoas encontradas")).toBeVisible();
    await expect(page).toHaveScreenshot("before-shell-pessoas-1440x900.png", {
      animations: "disabled",
      fullPage: true,
    });

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByRole("button", { name: "+ Nova pessoa" }).click();
    await expect(
      page.locator(".person-create-dialog .form-panel h2", {
        hasText: "Nova pessoa",
      }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("before-cadastro-pessoa-1366x768.png", {
      animations: "disabled",
      fullPage: true,
    });
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(
      `/app/beneficios?unidadeId=${unit.id}&competencia=${competence}`,
    );
    await expect(
      page.getByRole("heading", { name: "Benefícios", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".refreshing-content")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(page).toHaveScreenshot("before-beneficios-1280x720.png", {
      animations: "disabled",
      fullPage: true,
    });

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/app/ferias?unidadeId=${unit.id}`);
    await expect(
      page.getByRole("heading", { name: "Férias", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Ana Baseline Visual")).toBeVisible();
    await expect(page).toHaveScreenshot("before-ferias-1366x768.png", {
      animations: "disabled",
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/pessoas?q=Ana%20Baseline%20Visual");
    await expect(page.getByText("1 pessoas encontradas")).toBeVisible();
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(page.locator("aside.drawer-open")).toBeVisible();
    await expect(page).toHaveScreenshot("before-shell-pessoas-390x844.png", {
      animations: "disabled",
      fullPage: true,
    });
  } finally {
    await db.$disconnect();
  }
});
