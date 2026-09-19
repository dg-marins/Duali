import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";

test("administra pedido e confirmação de aquisição mensal", async ({
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
      page.getByRole("heading", { name: "Fazer pedido" }),
    ).toBeVisible({ timeout: 15000 });
    const unitSelect = page.getByRole("combobox", {
      name: "Unidade",
      exact: true,
    });
    await expect(unitSelect.locator(`option[value="${unit.id}"]`)).toHaveCount(
      1,
    );
    await unitSelect.selectOption(unit.id);
    await expect(
      page.getByText("Colaboradora aquisição E2E", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Dias de Colaboradora aquisição E2E").fill("22");
    await page
      .getByRole("button", { name: "Gerar pedido", exact: true })
      .click();
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
    const inactiveSupplier = await db.fornecedor.create({
      data: { nome: `Fornecedor inativo ${suffix}`, ativo: false },
    });
    await db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: inactiveSupplier.id,
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
    const category = page.getByRole("combobox", { name: "Categoria" });
    await expect(category.locator('option[value="ALIMENTACAO"]')).toHaveText(
      "Alimentação",
    );
    await page.getByRole("combobox", { name: "Unidade" }).selectOption(unit.id);
    await category.selectOption("TRANSPORTE");
    await expect(
      page.getByRole("columnheader", { name: "Conduções e fornecedores" }),
    ).toBeVisible();
    await category.selectOption("ALIMENTACAO");
    await expect(page.getByText(personName, { exact: true })).toBeVisible();
    const supplierSelect = page.getByRole("combobox", {
      name: "Fornecedor",
      exact: true,
    });
    await expect(supplierSelect).toContainText(supplier.nome);
    await expect(supplierSelect).not.toContainText(otherSupplier.nome);
    await expect(supplierSelect).not.toContainText(inactiveSupplier.nome);
    await supplierSelect.selectOption({ label: supplier.nome });
    await page.getByLabel(`Selecionar ${personName}`).check();
    await page.locator('tbody input[type="number"]').first().fill("22");
    await page.getByLabel(`Valor diário de ${personName}`).fill("25,50");
    await category.selectOption("TRANSPORTE");
    await expect(
      page.getByRole("dialog", { name: "Descartar alterações do lote?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continuar editando" }).click();
    await expect(category).toHaveValue("ALIMENTACAO");
    await expect(page.getByLabel(`Valor diário de ${personName}`)).toHaveValue(
      /25,50/,
    );
    await page.getByRole("button", { name: "Revisar cadastro" }).click();
    await expect(
      page.getByRole("heading", { name: "Revisar cadastro" }),
    ).toBeVisible();
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
      `/app/beneficios?competencia=2026-09-01&unidadeId=${unit.id}`,
    );
    await expect(
      page.getByRole("heading", { name: "Benefícios", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Valor previsto/ }),
    ).toContainText(/R\$\s*561,00/, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Benefício Mensal" }),
    ).toBeVisible();
    await page.screenshot({
      path: "artifacts/beneficios-resumo-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const sidebar = document.querySelector(".shell > aside");
      return !sidebar || sidebar.getBoundingClientRect().right <= 0;
    });
    await expect(
      page.getByRole("button", { name: "Cadastrar benefícios em lote" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "artifacts/beneficios-resumo-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page
      .locator(".monthly-preparation-legend-row")
      .filter({ hasText: "Alimentação" })
      .click();
    await expect(
      page
        .locator(".monthly-preparation-legend-row")
        .filter({ hasText: supplier.nome }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Lançamentos pendentes/ }).click();
    await expect(page).toHaveURL(
      /\/app\/beneficios\/lancamentos\?.*visao=pendente/,
    );
    await page.goto(
      `/app/beneficios/lancamentos?competencia=2026-09-01&unidadeId=${unit.id}`,
    );
    await page.getByRole("textbox", { name: "Buscar" }).fill(personName);
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

test("registra ajuste de benefício no fechamento sem painel genérico", async ({
  page,
}) => {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const suffix = randomUUID();
  const password = `${suffix}Aa!`;
  try {
    const user = await db.usuario.create({
      data: {
        nome: "Fechamento E2E",
        email: `${suffix}@example.test`,
        senhaHash: await argon2.hash(password),
      },
    });
    const unit = await db.unidade.create({
      data: {
        nome: `Unidade fechamento ${suffix}`,
        sigla: suffix.slice(0, 8),
        uf: "RJ",
      },
    });
    const person = await db.pessoa.create({
      data: { nomeCompleto: `Pessoa fechamento ${suffix}` },
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
      data: { nome: `Fornecedor fechamento ${suffix}` },
    });
    const config = await db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: supplier.id,
        tipo: "ALIMENTACAO",
      },
    });
    const benefit = await db.beneficioVinculo.create({
      data: {
        vinculoId: link.id,
        tipo: "ALIMENTACAO",
        inicioVigencia: new Date("2026-09-01"),
        configuracaoRecorrenteId: config.id,
        valorDiario: "25.50",
      },
    });
    const competence = await db.beneficioCompetencia.create({
      data: {
        beneficioVinculoId: benefit.id,
        configuracaoId: config.id,
        competencia: new Date("2026-09-01"),
        componente: "Principal",
        quantidadeDias: 22,
        valorUnitario: "25.50",
      },
    });
    await page.goto("/");
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByText("Fechamento E2E", { exact: true }).first(),
    ).toBeVisible();
    await page.goto("/app/beneficios");
    await expect(
      page.getByRole("button", { name: "Nova competência" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Registrar ajuste" }),
    ).toHaveCount(0);
    await page.goto("/app/beneficios/fechamento");
    await page.getByRole("textbox", { name: "Buscar unidade" }).fill(unit.nome);
    const unitSelect = page.getByRole("combobox", {
      name: "Unidade",
      exact: true,
    });
    await expect(unitSelect.locator(`option[value="${unit.id}"]`)).toHaveCount(
      1,
    );
    await unitSelect.selectOption(unit.id);
    await page.getByRole("button", { name: "Preparar competência" }).click();
    const row = page.getByRole("row").filter({ hasText: person.nomeCompleto });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Registrar ajuste" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Registrar ajuste da competência",
    });
    await dialog.getByLabel("Valor *").fill("10,00");
    await dialog
      .getByLabel("Motivo *")
      .fill("Correção de dias informados pelo RH");
    await dialog.getByRole("button", { name: "Salvar ajuste" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(row.getByText(/R\$\s*571,00/)).toBeVisible();
    expect(
      await db.beneficioAjuste.count({
        where: { competenciaId: competence.id },
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
    const supplierCards = page.locator(".transport-supplier-card");
    await expect(supplierCards).toHaveCount(2);
    await expect(
      supplierCards.filter({ hasText: suppliers[0]!.nome }).locator("li"),
    ).toHaveCount(2);
    await expect(
      supplierCards.filter({ hasText: suppliers[1]!.nome }).locator("li"),
    ).toHaveCount(1);
    await expect(
      supplierCards.filter({ hasText: suppliers[0]!.nome }),
    ).toContainText("Ônibus");
    await page.getByRole("button", { name: "Editar benefício" }).click();
    await expect(page.getByText("Transportes recorrentes")).toBeVisible();
    const benefitDialog = page.locator(".benefit-dialog");
    await expect(benefitDialog.locator('input[type="date"]')).toHaveCount(2);
    await expect(
      benefitDialog.locator('.transport-editor-row input[type="checkbox"]'),
    ).toHaveCount(0);
    await benefitDialog.getByLabel("Fim da vigência").fill("2026-10-31");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 850 });
      expect(
        await benefitDialog.evaluate((dialog) => {
          const body = dialog.querySelector(".dialog-body");
          const rows = [...dialog.querySelectorAll(".transport-editor-row")];
          if (!body) return false;
          const bounds = body.getBoundingClientRect();
          return (
            body.scrollWidth <= body.clientWidth + 1 &&
            rows.every((row) => {
              const rowBounds = row.getBoundingClientRect();
              return (
                rowBounds.left >= bounds.left && rowBounds.right <= bounds.right
              );
            }) &&
            getComputedStyle(dialog).borderTopLeftRadius !== "0px" &&
            getComputedStyle(dialog).borderBottomRightRadius !== "0px"
          );
        }),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 850 });
    await expect(
      page
        .getByLabel("Condução *")
        .first()
        .locator('option[value="ONIBUS_INTER"]'),
    ).toHaveText("Ônibus Intermunicipal");
    await expect(
      page.getByLabel("Condução *").first().locator('option[value="TREM"]'),
    ).toHaveText("Trem");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Transportes recorrentes")).not.toBeVisible();
    expect(
      await db.beneficioTransporteItem.count({
        where: { beneficioVinculoId: benefit.id, ativo: true },
      }),
    ).toBe(3);
    const persistedItems = await db.beneficioTransporteItem.findMany({
      where: { beneficioVinculoId: benefit.id, ativo: true },
    });
    expect(
      persistedItems.every(
        (item) =>
          item.inicioVigencia.toISOString().slice(0, 10) === "2026-09-01" &&
          item.fimVigencia?.toISOString().slice(0, 10) === "2026-10-31",
      ),
    ).toBe(true);

    await page.goto(
      `/app/beneficios/aquisicao?unidadeId=${unit.id}&competencia=2026-09-01&tipo=TRANSPORTE`,
    );
    await page.getByRole("button", { name: "Preparar competência" }).click();
    await expect(page.getByText(/R\$\s*453,20/).first()).toBeVisible();
    await expect(page.getByText(/R\$\s*347,60/).first()).toBeVisible();
    await page.goto("/app/beneficios/fechamento");
    await page.getByRole("textbox", { name: "Buscar unidade" }).fill(unit.nome);
    const closingUnit = page.getByRole("combobox", {
      name: "Unidade",
      exact: true,
    });
    await expect(closingUnit.locator(`option[value="${unit.id}"]`)).toHaveCount(
      1,
    );
    await closingUnit.selectOption(unit.id);
    await page.getByRole("button", { name: "Preparar competência" }).click();
    const transportRow = page.getByRole("row").filter({ hasText: personName });
    await transportRow
      .getByRole("button", { name: "Registrar ajuste" })
      .click();
    const adjustment = page.getByRole("dialog", {
      name: "Registrar ajuste da competência",
    });
    await adjustment.getByLabel("Valor *").fill("10,00");
    await adjustment
      .getByLabel("Motivo *")
      .fill("Correção de transporte mensal");
    await adjustment
      .getByLabel(new RegExp("Valor para Ônibus de"))
      .fill("5,00");
    await adjustment.getByLabel(new RegExp("Valor para Metrô de")).fill("5,00");
    await adjustment.getByRole("button", { name: "Salvar ajuste" }).click();
    await expect(adjustment).not.toBeVisible();
    await expect(transportRow.getByText(/R\$\s*810,80/)).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
