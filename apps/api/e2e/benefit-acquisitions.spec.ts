import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";

test("administra preparação, pedido e confirmação de aquisição mensal", async ({
  page,
}) => {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const suffix = randomUUID(),
    password = `${suffix}Aa!`;
  try {
    const user = await db.usuario.create({
      data: {
        nome: "Aquisição E2E",
        email: `${suffix}@example.test`,
        senhaHash: await argon2.hash(password),
      },
    });
    const unit = await db.unidade.create({
      data: {
        nome: "Unidade aquisição E2E",
        sigla: suffix.slice(0, 8),
        uf: "RJ",
      },
    });
    const person = await db.pessoa.create({
      data: { nomeCompleto: "Colaboradora aquisição E2E" },
    });
    const link = await db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-01"),
      },
    });
    const supplier = await db.fornecedor.create({
      data: { nome: `Fornecedor E2E ${suffix}` },
    });
    const configuration = await db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: supplier.id,
        tipo: "ALIMENTACAO",
      },
    });
    await db.beneficioVinculo.create({
      data: {
        vinculoId: link.id,
        tipo: "ALIMENTACAO",
        inicioVigencia: new Date("2025-01-01"),
        configuracaoRecorrenteId: configuration.id,
        valorDiario: "25.50",
      },
    });
    await page.goto("/");
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByText("Aquisição E2E", { exact: true }).first(),
    ).toBeVisible();
    await page.goto("/app/beneficios/aquisicao");
    await expect(
      page.getByRole("heading", { name: "Aquisição mensal" }),
    ).toBeVisible({ timeout: 15000 });
    const unitSelect = page.getByRole("combobox", {
      name: "Unidade",
      exact: true,
    });
    await expect(unitSelect.locator(`option[value="${unit.id}"]`)).toHaveCount(
      1,
    );
    await unitSelect.selectOption(unit.id);
    await page.getByRole("button", { name: "Preparar competência" }).click();
    await expect(
      page.getByText("Colaboradora aquisição E2E", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/R\$\s*561,00/).first()).toBeVisible();
    await page.getByLabel("Selecionar Colaboradora aquisição E2E").check();
    await page.getByRole("button", { name: /Gerar 1 pedido/ }).click();
    await expect(page.getByText("Pendente", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await page
      .getByRole("button", { name: "Confirmar aquisição", exact: true })
      .click();
    await expect(page.getByText("Confirmada", { exact: true })).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});

test("cadastra alimentação em lote e a apresenta no perfil", async ({
  page,
}) => {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const suffix = randomUUID(),
    password = `${suffix}Aa!`;
  try {
    const user = await db.usuario.create({
      data: {
        nome: "Lote E2E",
        email: `${suffix}@example.test`,
        senhaHash: await argon2.hash(password),
      },
    });
    const unit = await db.unidade.create({
      data: { nome: "Unidade lote E2E", sigla: suffix.slice(0, 8), uf: "RJ" },
    });
    const person = await db.pessoa.create({
      data: { nomeCompleto: "Pessoa lote E2E" },
    });
    const link = await db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-01"),
      },
    });
    const supplier = await db.fornecedor.create({
      data: { nome: `Fornecedor lote E2E ${suffix}` },
    });
    await db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: supplier.id,
        tipo: "ALIMENTACAO",
      },
    });
    await page.goto("/");
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByText("Lote E2E", { exact: true }).first(),
    ).toBeVisible();
    await page.goto("/app/beneficios/lote");
    await expect(
      page.getByRole("heading", { name: "Cadastrar benefícios em lote" }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("combobox", { name: "Unidade" }).selectOption(unit.id);
    await expect(
      page.getByText("Pessoa lote E2E", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Selecionar Pessoa lote E2E").check();
    const inputs = page.locator('tbody input[type="number"]');
    await inputs.nth(0).fill("22");
    await inputs.nth(1).fill("25.50");
    await page.getByRole("button", { name: "Revisar cadastro" }).click();
    await page.getByRole("button", { name: "Confirmar cadastro" }).click();
    await expect(page).toHaveURL(/\/app\/beneficios\/aquisicao/);
    await page.goto(`/app/pessoas/${person.id}`);
    await page.getByRole("tab", { name: "Benefícios" }).click();
    await expect(page.getByText("Alimentação", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Editar benefício" }),
    ).toBeVisible();
    expect(
      await db.beneficioVinculo.count({
        where: { vinculoId: link.id, tipo: "ALIMENTACAO" },
      }),
    ).toBe(1);
  } finally {
    await db.$disconnect();
  }
});
