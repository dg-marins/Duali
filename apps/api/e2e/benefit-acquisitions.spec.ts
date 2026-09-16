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
    password = `${suffix}Aa!`,
    personName = `Pessoa lote E2E ${suffix.slice(0, 8)}`;
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
      data: { nomeCompleto: personName },
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
    const otherUnit = await db.unidade.create({
      data: {
        nome: "Outra unidade lote E2E",
        sigla: `O${suffix.slice(0, 7)}`,
        uf: "SP",
      },
    });
    const otherSupplier = await db.fornecedor.create({
      data: { nome: `Fornecedor indevido ${suffix}` },
    });
    await db.configuracaoBeneficio.create({
      data: {
        unidadeId: otherUnit.id,
        fornecedorId: otherSupplier.id,
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
    await expect(page.getByText(personName, { exact: true })).toBeVisible();
    await page.getByLabel(`Selecionar ${personName}`).check();
    const inputs = page.locator('tbody input[type="number"]');
    await inputs.nth(0).fill("22");
    await inputs.nth(1).fill("25.50");
    await page.getByRole("button", { name: "Revisar cadastro" }).click();
    await page.getByRole("button", { name: "Confirmar cadastro" }).click();
    await expect(page).toHaveURL(/\/app\/beneficios\/aquisicao/);
    await page.goto(
      `/app/pessoas/${person.id}?tab=beneficios&competencia=2026-09-01`,
    );
    await page.getByRole("tab", { name: "Benefícios" }).click();
    await expect(page.getByText("Alimentação", { exact: true })).toBeVisible();
    await expect(page.getByText("22", { exact: true })).toBeVisible();
    await expect(page.getByText(/R\$\s*561,00/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Editar benefício" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Adicionar benefício" }).click();
    await expect(
      page.locator(".form-context-card").getByText(personName, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Vínculo", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Fornecedor recorrente")).toContainText(
      supplier.nome,
    );
    await expect(page.getByLabel("Fornecedor recorrente")).not.toContainText(
      otherSupplier.nome,
    );
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();

    await page.goto(
      `/app/beneficios?competencia=2026-09&q=${encodeURIComponent(personName)}`,
    );
    const competenceRow = page.getByRole("row").filter({ hasText: personName });
    await competenceRow
      .getByRole("button", { name: "Ações da competência" })
      .click();
    await page.getByText("Editar lançamento", { exact: true }).click();
    await page.getByLabel("Dias *", { exact: true }).fill("21");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(
      competenceRow.getByText("PENDENTE", { exact: true }),
    ).toBeVisible();
    await competenceRow
      .getByRole("button", { name: "Ações da competência" })
      .click();
    await page.getByText("Marcar como conferido", { exact: true }).click();
    await expect(
      competenceRow.getByText("CONFERIDO", { exact: true }),
    ).toBeVisible();
    await competenceRow
      .getByRole("button", { name: "Ações da competência" })
      .click();
    await page.getByText("Cancelar competência", { exact: true }).click();
    await page
      .getByRole("button", { name: "Cancelar competência" })
      .last()
      .click();
    await expect(
      competenceRow.getByText("CANCELADO", { exact: true }),
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

test("edita transporte no perfil e prepara totais por fornecedor", async ({
  page,
}) => {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const suffix = randomUUID(),
    password = `${suffix}Aa!`,
    personName = `Pessoa transporte E2E ${suffix.slice(0, 8)}`;
  try {
    const user = await db.usuario.create({
      data: {
        nome: "Transporte E2E",
        email: `${suffix}@example.test`,
        senhaHash: await argon2.hash(password),
      },
    });
    const unit = await db.unidade.create({
      data: {
        nome: "Unidade transporte E2E",
        sigla: suffix.slice(0, 8),
        uf: "RJ",
      },
    });
    const person = await db.pessoa.create({
      data: { nomeCompleto: personName },
    });
    const link = await db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-01"),
      },
    });
    const suppliers = await Promise.all(
      ["Fornecedor Rio E2E", "Fornecedor JAÉ E2E"].map((name) =>
        db.fornecedor.create({ data: { nome: `${name} ${suffix}` } }),
      ),
    );
    await Promise.all(
      suppliers.map((supplier) =>
        db.configuracaoBeneficio.create({
          data: {
            unidadeId: unit.id,
            fornecedorId: supplier.id,
            tipo: "TRANSPORTE",
          },
        }),
      ),
    );
    const benefit = await db.beneficioVinculo.create({
      data: {
        vinculoId: link.id,
        tipo: "TRANSPORTE",
        inicioVigencia: new Date("2026-09-01"),
        transporteItens: {
          create: [
            {
              tipoConducao: "ONIBUS",
              fornecedorId: suppliers[0]!.id,
              valorDiario: "11.20",
              inicioVigencia: new Date("2026-09-01"),
            },
            {
              tipoConducao: "BARCA",
              fornecedorId: suppliers[0]!.id,
              valorDiario: "9.40",
              inicioVigencia: new Date("2026-09-01"),
            },
            {
              tipoConducao: "METRO",
              fornecedorId: suppliers[1]!.id,
              valorDiario: "15.80",
              inicioVigencia: new Date("2026-09-01"),
            },
          ],
        },
      },
    });
    await page.goto("/");
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByText("Transporte E2E", { exact: true }).first(),
    ).toBeVisible();
    await page.goto(
      `/app/pessoas/${person.id}?tab=beneficios&competencia=2026-09-01`,
    );
    await page.getByRole("tab", { name: "Benefícios" }).click();
    await expect(
      page.getByText(suppliers[0]!.nome, { exact: false }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(suppliers[1]!.nome, { exact: false }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Editar benefício" }).click();
    await expect(page.getByText("Transportes recorrentes")).toBeVisible();
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Transportes recorrentes")).not.toBeVisible();
    expect(
      await db.beneficioTransporteItem.count({
        where: { beneficioVinculoId: benefit.id, ativo: true },
      }),
    ).toBe(3);

    await page.goto(
      `/app/beneficios/aquisicao?unidadeId=${unit.id}&competencia=2026-09-01&tipo=TRANSPORTE`,
    );
    await page.getByRole("button", { name: "Preparar competência" }).click();
    await expect(page.getByText(/R\$\s*453,20/).first()).toBeVisible();
    await expect(page.getByText(/R\$\s*347,60/).first()).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
