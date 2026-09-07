import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";

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

    await page.getByRole("button", { name: "Pessoas", exact: true }).click();
    await page.getByRole("button", { name: "+ Nova pessoa" }).click();
    const personForm = page.locator(".form-panel");
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
    await page.getByRole("button", { name: "Novo vínculo" }).click();
    const linkForm = page.locator(".form-panel");
    await linkForm
      .getByLabel("Pessoa", { exact: true })
      .selectOption(person.id);
    await linkForm.getByLabel("Tipo", { exact: true }).selectOption("ESTAGIO");
    await linkForm.getByLabel("Unidade", { exact: true }).selectOption(unit.id);
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
    await internshipForm
      .getByLabel("Vínculo", { exact: true })
      .selectOption(link.id);
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
    await leaveForm
      .getByLabel("Vínculo", { exact: true })
      .selectOption(link.id);
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
    await enrollmentForm
      .getByLabel("Vínculo", { exact: true })
      .selectOption(link.id);
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
    await competenceForm
      .getByLabel("Benefício do vínculo", { exact: true })
      .selectOption(enrollment.id);
    await competenceForm
      .getByLabel("Configuração por unidade", { exact: true })
      .selectOption(config.id);
    await competenceForm
      .getByLabel("Competência (primeiro dia do mês)")
      .fill("2026-01-01");
    await competenceForm.getByLabel("Dias", { exact: true }).fill("20");
    await competenceForm.getByLabel("Valor unitário (R$)").fill("25");
    await competenceForm
      .getByRole("button", { name: "Salvar", exact: true })
      .click();
    await expect(competenceForm).toBeHidden();
    await page.locator('input[type="month"]').fill("2026-01");
    await expect(
      page.getByRole("cell", { name: `Pessoa E2E ${suffix}` }),
    ).toBeVisible();

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
