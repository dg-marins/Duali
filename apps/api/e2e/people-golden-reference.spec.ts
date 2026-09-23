import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";

test("Golden Reference de Pessoas preserva contexto e comportamento responsivo", async ({
  page,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(12000);
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const suffix = randomUUID();
  const password = `${randomUUID()}Aa!`;
  const email = `${suffix}@people-golden.test`;
  const searchTerm = "Golden Visual";
  try {
    const fixtureNames = [
      "Ana Vitória Golden Visual",
      "Bruno Estágio Golden Visual",
      "Carla Aprendiz Golden Visual",
      "Daniel Trainee Golden Visual",
      "Elisa Sem Vínculo Golden Visual",
      "Fernanda Inativa Golden Visual",
    ];
    const previousPeople = await db.pessoa.findMany({
      where: { nomeCompleto: { in: fixtureNames } },
      select: { id: true },
    });
    const previousPersonIds = previousPeople.map(({ id }) => id);
    if (previousPersonIds.length > 0) {
      const previousLinks = await db.vinculo.findMany({
        where: { pessoaId: { in: previousPersonIds } },
        select: { id: true },
      });
      const previousLinkIds = previousLinks.map(({ id }) => id);
      if (previousLinkIds.length > 0) {
        await db.estagio.deleteMany({
          where: { vinculoId: { in: previousLinkIds } },
        });
        await db.vinculo.deleteMany({
          where: { id: { in: previousLinkIds } },
        });
      }
      await db.pessoa.deleteMany({
        where: { id: { in: previousPersonIds } },
      });
    }
    await db.usuario.create({
      data: {
        nome: "Marina Pessoas",
        email,
        senhaHash: await argon2.hash(password),
      },
    });
    const unit = await db.unidade.create({
      data: {
        nome: "Unidade Pessoas Golden",
        sigla: `UPG${suffix.slice(0, 6)}`,
        uf: "RJ",
      },
    });
    const team = await db.equipe.upsert({
      where: { nome: "Equipe Pessoas Golden" },
      update: { ativa: true },
      create: { nome: "Equipe Pessoas Golden" },
    });
    const existingInstitution = await db.instituicaoEnsino.findFirst({
      where: {
        nome: "Universidade de Referência Golden",
        sigla: "UR",
      },
    });
    const institution = existingInstitution
      ? await db.instituicaoEnsino.update({
          where: { id: existingInstitution.id },
          data: { ativa: true },
        })
      : await db.instituicaoEnsino.create({
          data: { nome: "Universidade de Referência Golden", sigla: "UR" },
        });
    const people: Array<{
      id: string;
      name: string;
      type: "CLT" | "ESTAGIO" | "APRENDIZ" | "TRAINEE" | null;
    }> = [];
    for (const [index, type] of (
      ["CLT", "ESTAGIO", "APRENDIZ", "TRAINEE", null] as const
    ).entries()) {
      const person = await db.pessoa.create({
        data: {
          nomeCompleto: [
            "Ana Vitória Golden Visual",
            "Bruno Estágio Golden Visual",
            "Carla Aprendiz Golden Visual",
            "Daniel Trainee Golden Visual",
            "Elisa Sem Vínculo Golden Visual",
          ][index]!,
          email: `pessoa-${index}-${suffix}@people-golden.test`,
        },
      });
      people.push({ id: person.id, name: person.nomeCompleto, type });
      if (type) {
        const link = await db.vinculo.create({
          data: {
            pessoaId: person.id,
            unidadeId: unit.id,
            equipeId: team.id,
            tipo: type,
            dataAdmissao: new Date("2026-01-10"),
          },
        });
        if (type === "ESTAGIO")
          await db.estagio.create({
            data: {
              vinculoId: link.id,
              instituicaoEnsinoId: institution.id,
              dataTerminoPrevista: new Date("2028-01-10"),
              valorBolsa: "1800.00",
            },
          });
      }
    }
    const inactive = await db.pessoa.create({
      data: {
        nomeCompleto: "Fernanda Inativa Golden Visual",
        email: `inativa-${suffix}@people-golden.test`,
        ativa: false,
      },
    });
    await db.vinculo.create({
      data: {
        pessoaId: inactive.id,
        unidadeId: unit.id,
        tipo: "CLT",
        status: "DESLIGADO",
        dataAdmissao: new Date("2024-01-01"),
        dataDesligamento: new Date("2025-01-01"),
      },
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Visão geral" }),
    ).toBeVisible();
    await page.goto(`/app/pessoas?q=${encodeURIComponent(searchTerm)}`);
    await expect(
      page.getByRole("heading", { name: "Pessoas", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("6 pessoas encontradas")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByLabel("Unidade").locator(`option[value="${unit.id}"]`),
    ).toHaveCount(1);
    await expect(
      page.getByLabel("Equipe").locator(`option[value="${team.id}"]`),
    ).toHaveCount(1);
    await expect(
      page.locator('.people-segment[aria-pressed="true"]'),
    ).toHaveText(/Todos/);
    await expect(page).toHaveScreenshot("pessoas-desktop-1440x900.png", {
      animations: "disabled",
    });

    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(page).toHaveScreenshot("pessoas-desktop-1366x768.png", {
      animations: "disabled",
    });

    const counts = await page
      .locator(".people-segment strong")
      .allTextContents();
    await page.locator('.people-segment[data-segment="ESTAGIO"]').click();
    await expect(
      page.getByRole("columnheader", { name: "Instituição" }),
    ).toBeVisible();
    await expect(page.locator(".people-segment strong")).toHaveText(counts);
    await expect(page).toHaveScreenshot("pessoas-estagio-1366x768.png", {
      animations: "disabled",
    });

    await page.getByLabel("Unidade").selectOption(unit.id);
    await page.getByLabel("Status").selectOption("ATIVO");
    await expect(page.getByLabel("Buscar pessoa")).toHaveValue(searchTerm);
    expect(new URL(page.url()).searchParams.get("q")).toBe(searchTerm);
    await expect(
      page.getByRole("button", { name: /Remover filtro Unidade/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Remover filtro Status/ }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("pessoas-filtros-1366x768.png", {
      animations: "disabled",
    });

    await page.getByLabel("Buscar pessoa").fill("não existe nesta população");
    await expect(
      page.getByText("Nenhuma pessoa encontrada com estes filtros"),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("pessoas-empty-1366x768.png", {
      animations: "disabled",
    });

    await page
      .getByRole("button", { name: "Limpar filtros", exact: true })
      .click();
    await page.getByLabel("Buscar pessoa").fill(searchTerm);
    await page.locator('.people-segment[data-segment="ESTAGIO"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("1 pessoas encontradas")).toBeVisible();
    await expect(page).toHaveScreenshot("pessoas-mobile-390x844.png", {
      animations: "disabled",
    });

    const currentUrl = page.url();
    const expand = page.getByRole("button", {
      name: /Exibir detalhes de Bruno Estágio/,
    });
    await expand.click();
    await expect(expand).toHaveAttribute("aria-expanded", "true");
    const controls = await expand.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    await expect(page.locator(`#${controls}`)).toBeVisible();
    expect(page.url()).toBe(currentUrl);
    await expect(page).toHaveScreenshot("pessoas-mobile-expanded-390x844.png", {
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/app/pessoas?q=${encodeURIComponent(searchTerm)}&page=1`);
    await page
      .getByRole("button", { name: "+ Nova pessoa", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/pessoas\/nova\?/);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Fechar" })
      .click();
    await expect(page).toHaveURL(/\/app\/pessoas\?/);
    expect(new URL(page.url()).searchParams.get("q")).toBe(searchTerm);
    expect(new URL(page.url()).searchParams.get("page")).toBe("1");
    await expect(
      page.getByRole("button", { name: "+ Nova pessoa", exact: true }),
    ).toBeFocused();

    await page.getByLabel("Buscar pessoa").fill("ana vitoria");
    await expect(
      page.getByText("Ana Vitória Golden Visual", { exact: true }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
