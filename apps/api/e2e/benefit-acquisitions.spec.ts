import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";
import { transaction } from "../src/core.js";
import { generateNextMonthForecasts } from "../src/modules/benefit-cycle.js";

test("exibe previsão futura no mesmo ciclo do Dashboard e de Benefícios", async ({
  page,
}) => {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const suffix = randomUUID(),
    password = `${suffix}Aa!`;
  try {
    const user = await db.usuario.create({
      data: {
        nome: "Previsão E2E",
        email: `${suffix}@example.test`,
        senhaHash: await argon2.hash(password),
      },
    });
    const unit = await db.unidade.create({
      data: {
        nome: `Unidade previsão ${suffix.slice(0, 8)}`,
        sigla: suffix.slice(0, 8),
        uf: "RJ",
      },
    });
    const supplier = await db.fornecedor.create({
      data: { nome: `Fornecedor previsão ${suffix.slice(0, 8)}` },
    });
    const configuration = await db.configuracaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        fornecedorId: supplier.id,
        tipo: "ALIMENTACAO",
      },
    });
    const person = await db.pessoa.create({
      data: { nomeCompleto: `Pessoa previsão ${suffix.slice(0, 8)}` },
    });
    const link = await db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        tipo: "CLT",
        dataAdmissao: new Date("2025-01-01"),
      },
    });
    const benefit = await db.beneficioVinculo.create({
      data: {
        vinculoId: link.id,
        tipo: "ALIMENTACAO",
        inicioVigencia: new Date("2025-01-01"),
      },
    });
    const competence = await db.beneficioCompetencia.create({
      data: {
        beneficioVinculoId: benefit.id,
        configuracaoId: configuration.id,
        competencia: new Date("2026-09-01"),
        valorMensalBase: "200.00",
      },
    });
    const order = await db.aquisicaoBeneficio.create({
      data: {
        unidadeId: unit.id,
        competencia: new Date("2026-09-01"),
        tipo: "ALIMENTACAO",
        fornecedorId: supplier.id,
        status: "CONFIRMADA",
        criadoPorId: user.id,
      },
    });
    await db.aquisicaoBeneficioItem.create({
      data: {
        aquisicaoId: order.id,
        competenciaId: competence.id,
        vinculoId: link.id,
        pessoaNome: person.nomeCompleto,
        destino: supplier.nome,
        valorPrevisto: "200.00",
        valorSolicitado: "200.00",
        valorReservado: "0.00",
        composicao: { versao: 1, categoria: "ALIMENTACAO" },
        status: "CONFIRMADO",
      },
    });
    await db.fechamentoCompetenciaBeneficio.create({
      data: {
        unidadeId: unit.id,
        competencia: new Date("2026-09-01"),
        status: "FECHADA",
        fechadoEm: new Date(),
        fechadoPor: user.id,
      },
    });
    await transaction(db, (tx) =>
      generateNextMonthForecasts(
        tx,
        unit.id,
        new Date("2026-09-01"),
        "FECHAMENTO_COMPETENCIA",
        user.id,
      ),
    );

    await page.goto("/");
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByText("Previsão E2E", { exact: true }).first(),
    ).toBeVisible();
    await page.goto(
      `/app/beneficios?competencia=2026-10-01&unidadeId=${unit.id}`,
    );
    await expect(
      page.locator(".ds-metric-card").filter({ hasText: "Valor previsto" }),
    ).toContainText(/R\$\s*200,00/, { timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: /Previsto R\$\s*200,00/ }),
    ).toHaveAttribute("aria-pressed", "true");
    const category = page
      .locator(".monthly-preparation-legend-row")
      .filter({ hasText: "Alimentação" });
    await category.focus();
    await page.keyboard.press("Enter");
    await expect(
      page
        .locator(".monthly-preparation-legend-row")
        .filter({ hasText: supplier.nome }),
    ).toContainText(/Previsto:\s*R\$\s*200,00/);
    await page.getByRole("button", { name: /Solicitado R\$\s*0,00/ }).click();
    await expect(page.getByText("Sem valor solicitado")).toBeVisible();
    await page.screenshot({
      path: "artifacts/beneficios-previsao-futura.png",
      fullPage: true,
    });

    await page.goto(`/app?competencia=2026-10-01&unidadeId=${unit.id}`);
    await expect(
      page.getByRole("heading", { name: "Benefício Mensal" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: /Previsto R\$\s*200,00/ }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});

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
    await page.getByLabel("Incluir Colaboradora aquisição E2E").check();
    await page.getByLabel("Dias de Colaboradora aquisição E2E").fill("22");
    await page
      .getByRole("button", { name: "Gerar pedido", exact: true })
      .click();
    await page.getByRole("button", { name: /Alimenta/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("button", { name: "Confirmar compra", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Registrar confirmação", exact: true })
      .click();
    await expect(page.getByText("CONFIRMADA", { exact: true })).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});

test("faz pedido de alimentação sem adesão prévia e o apresenta no perfil", async ({
  page,
}) => {
  test.setTimeout(120_000);
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
      page.getByRole("heading", { name: "Fazer pedido" }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("combobox", { name: "Unidade" }).selectOption(unit.id);
    await page
      .getByRole("combobox", { name: "Benefício" })
      .selectOption("ALIMENTACAO");
    await expect(page.getByText(personName, { exact: true })).toBeVisible();
    await expect(page.getByText("Equipe", { exact: true })).toHaveCount(0);
    const supplierSelect = page.getByRole("combobox", {
      name: `Fornecedor de ${personName}`,
    });
    await expect(supplierSelect).toContainText(supplier.nome);
    await expect(supplierSelect).not.toContainText(otherSupplier.nome);
    await expect(supplierSelect).not.toContainText(inactiveSupplier.nome);
    await supplierSelect.selectOption({ label: supplier.nome });
    await expect(page.getByLabel(`Incluir ${personName}`)).toBeChecked();
    await page.getByLabel(`Dias de ${personName}`).fill("22");
    await page.getByLabel(`Valor diário de ${personName}`).fill("25,50");
    await page.getByRole("button", { name: "Gerar pedido" }).click();
    await expect(page).toHaveURL(/\/app\/beneficios\/competencias/);
    await page.goto(
      `/app/pessoas/${person.id}?tab=beneficios&competencia=2026-09-01`,
    );
    await page.getByRole("tab", { name: "Benefícios" }).click();
    await expect(page.getByText("Alimentação", { exact: true })).toBeVisible();
    await expect(page.getByText("22", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Editar benefício" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Adicionar benefício" }),
    ).toHaveCount(0);

    await page.goto(
      `/app/beneficios?competencia=2026-09-01&unidadeId=${unit.id}`,
    );
    await expect(
      page.getByRole("heading", { name: "Benefícios", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".ds-metric-card").filter({ hasText: "Valor previsto" }),
    ).toContainText("Sem previsão", { timeout: 30_000 });
    await expect(
      page.locator(".ds-metric-card").filter({ hasText: "Valor solicitado" }),
    ).toContainText(/R\$\s*561,00/);
    await expect(
      page.getByRole("heading", { name: "Ciclo mensal" }),
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
      page.getByRole("button", { name: "Fazer pedido" }),
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
    const generatedCompetence = await db.beneficioCompetencia.findFirst({
      where: {
        competencia: new Date("2026-09-01"),
        beneficioVinculo: { vinculoId: link.id },
      },
    });
    expect(generatedCompetence).not.toBeNull();
    await page.goto(
      `/app/beneficios/competencias?unidadeId=${unit.id}&competencia=2026-09-01&tipo=ALIMENTACAO`,
    );
    await page.getByRole("button", { name: /Alimenta/ }).click();
    await page
      .getByRole("button", { name: "Cancelar pedido", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByText("CANCELADA")).toBeVisible();
    await expect(
      page
        .getByRole("dialog")
        .locator("li")
        .filter({ hasText: /R\$\s*561,00/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /Alimenta/ })).toContainText(
      /R\$\s*0,00/,
    );
    await page.goto(
      `/app/beneficios/aquisicao?unidadeId=${unit.id}&competencia=2026-09-01&tipo=ALIMENTACAO`,
    );
    await expect(page.getByLabel(`Incluir ${personName}`)).toBeEnabled();
    await page.getByRole("button", { name: "Gerar pedido" }).click();
    await expect(page).toHaveURL(/\/app\/beneficios\/competencias/);
    await expect(page.getByRole("button", { name: /Alimenta/ })).toContainText(
      /R\$\s*561,00/,
    );
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

test("pede transporte com várias conduções e fornecedores sem adesão prévia", async ({
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
    await db.vinculo.create({
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
    await page.goto("/");
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByText("Transporte E2E", { exact: true }).first(),
    ).toBeVisible();
    await page.goto(
      `/app/beneficios/aquisicao?unidadeId=${unit.id}&competencia=2026-09-01&tipo=TRANSPORTE`,
    );
    await expect(page.getByText(personName, { exact: true })).toBeVisible();
    await expect(page.getByText("Equipe", { exact: true })).toHaveCount(0);
    await page.getByLabel(`Incluir ${personName}`).check();
    await page.getByLabel(`Dias de ${personName}`).fill("22");
    await page.getByText("Conduções e fornecedores").click();
    for (const [index, conduction, supplier, amount] of [
      [0, "ONIBUS", suppliers[0]!.id, "11,20"],
      [1, "BARCA", suppliers[0]!.id, "9,40"],
      [2, "METRO", suppliers[1]!.id, "15,80"],
      [3, "OUTROS", suppliers[1]!.id, "1,00"],
    ] as const) {
      await page.getByRole("button", { name: "Adicionar condução" }).click();
      const row = page.locator(".transport-composition-row").nth(index);
      await expect(row.getByRole("combobox").first()).toHaveValue("");
      await expect(row.getByRole("combobox").first()).toContainText(
        "Selecione a condução",
      );
      await expect(row.getByRole("combobox").nth(1)).toContainText(
        "Selecione o fornecedor",
      );
      await expect(row.getByRole("textbox")).toHaveAttribute(
        "placeholder",
        "Informe o valor diário",
      );
      if (index === 0) {
        await page.getByRole("button", { name: "Gerar pedido" }).click();
        await expect(
          page.getByText(/Complete condução, fornecedor, valores/),
        ).toBeVisible();
      }
      await row
        .getByRole("combobox", { name: `Condução de ${personName}` })
        .selectOption(conduction);
      await row
        .getByRole("combobox", { name: `Fornecedor de ${personName}` })
        .selectOption(supplier);
      await row.getByRole("textbox").fill(amount);
    }
    await expect(page.locator(".transport-composition-row")).toHaveCount(4);
    await page.getByRole("button", { name: "Gerar pedido" }).click();
    await expect(page).toHaveURL(/\/app\/beneficios\/competencias/);
    const generatedOrders = await db.aquisicaoBeneficio.findMany({
      where: {
        unidadeId: unit.id,
        competencia: new Date("2026-09-01"),
        tipo: "TRANSPORTE",
      },
      include: { itens: true },
    });
    expect(generatedOrders).toHaveLength(2);
    expect(
      generatedOrders
        .flatMap((order) => order.itens)
        .reduce((sum, item) => sum + Number(item.valorSolicitado), 0),
    ).toBe(822.8);
    expect(
      await db.beneficioTransporteCompetenciaItem.count({
        where: {
          tipoConducao: "OUTROS",
          competencia: {
            beneficioVinculo: { vinculo: { pessoaId: person.id } },
          },
        },
      }),
    ).toBe(1);
    await page.goto(
      `/app/beneficios/aquisicao?unidadeId=${unit.id}&competencia=2026-09-01&tipo=TRANSPORTE`,
    );
    await page.getByText("Conduções e fornecedores").click();
    await expect(
      page
        .locator('.transport-composition-row select[aria-label^="Condução"]')
        .last(),
    ).toHaveValue("OUTROS");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("heading", { name: "Fazer pedido" }),
    ).toBeVisible();
    await expect(
      page
        .locator('.transport-composition-row select[aria-label^="Condução"]')
        .last(),
    ).toHaveValue("OUTROS");
  } finally {
    await db.$disconnect();
  }
});
