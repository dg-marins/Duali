import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";

async function credentials(db: PrismaClient) {
  const password = `${randomUUID()}Aa!`;
  const user = await db.usuario.create({
    data: {
      nome: "Carregamento E2E",
      email: `${randomUUID()}@example.test`,
      senhaHash: await argon2.hash(password),
    },
  });
  return { user, password };
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByText("Carregamento E2E", { exact: true }).first(),
  ).toBeVisible();
}

function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("dashboard reserva o layout enquanto os indicadores carregam", async ({
  page,
}) => {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const { user, password } = await credentials(db);
  const response = deferred();
  await page.route("**/api/dashboard", async (route) => {
    await response.promise;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pessoasAtivas: 3,
        cltsAtivos: 2,
        estagiariosAtivos: 1,
        aprendizesAtivos: 0,
        feriasProximas: 0,
        feriasPendentes: 0,
        descansosProximos: 0,
        documentosProximos: 0,
        beneficiosPendentes: 0,
        inconsistencias: 0,
        importacoesPendentes: 0,
        alertas: [],
        atividades: [],
      }),
    });
  });
  try {
    await login(page, user.email, password);
    await expect(
      page.getByRole("heading", { name: "Visão geral" }),
    ).toBeVisible();
    await expect(page.getByTestId("loading-skeleton-metrics")).toBeVisible();
    await expect(page.locator(".shell")).toBeVisible();
    response.release();
    await expect(
      page.getByText("Pessoas ativas", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("loading-skeleton-metrics")).toHaveCount(0);
  } finally {
    response.release();
    await db.$disconnect();
  }
});

test("pessoas mantém os dados anteriores durante busca e troca após a resposta", async ({
  page,
}) => {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const { user, password } = await credentials(db);
  const first = deferred();
  const refresh = deferred();
  let request = 0;
  await page.route("**/api/pessoas-operacional?*", async (route) => {
    request += 1;
    if (request === 3) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "INTERNAL", message: "Falha ao atualizar pessoas." },
        }),
      });
      return;
    }
    if (request === 4) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 25 }),
      });
      return;
    }
    await (request === 1 ? first.promise : refresh.promise);
    const name = request === 1 ? "Pessoa inicial" : "Pessoa atualizada";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: randomUUID(),
            nomeCompleto: name,
            vinculo: "CLT",
            unidade: "Matriz",
            equipe: "Pessoas",
            admissao: "2026-01-10",
            cpf: null,
            status: "ATIVO",
            vinculosAtivos: 1,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      }),
    });
  });
  try {
    await login(page, user.email, password);
    await page.getByRole("button", { name: "Pessoas", exact: true }).click();
    await expect(page.getByTestId("loading-skeleton-table")).toBeVisible();
    first.release();
    await expect(
      page.getByText("Pessoa inicial", { exact: true }),
    ).toBeVisible();

    await page.getByLabel("Buscar pessoa").fill("atualizada");
    await expect(
      page.getByText("Pessoa inicial", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".refreshing-content[aria-busy='true']"),
    ).toBeVisible();
    const staleRow = page
      .getByText("Pessoa inicial", { exact: true })
      .locator("xpath=ancestor::tr");
    await staleRow.focus();
    await expect(staleRow).not.toBeFocused();
    refresh.release();
    await expect(
      page.getByText("Pessoa atualizada", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Pessoa inicial", { exact: true })).toHaveCount(
      0,
    );

    await page.getByLabel("Buscar pessoa").fill("erro");
    await expect(page.getByText("Falha ao atualizar pessoas.")).toBeVisible();
    await expect(
      page.getByText("Pessoa atualizada", { exact: true }),
    ).toBeVisible();

    await page.getByLabel("Buscar pessoa").fill("vazio");
    await expect(page.getByText("Nenhuma pessoa encontrada")).toBeVisible();
    await expect(page.getByTestId("loading-skeleton-table")).toHaveCount(0);
  } finally {
    first.release();
    refresh.release();
    await db.$disconnect();
  }
});

test("detalhe mantém o shell no mobile e respeita movimento reduzido", async ({
  page,
}) => {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const { user, password } = await credentials(db);
  const personId = randomUUID();
  const response = deferred();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(`**/api/pessoas/${personId}/perfil`, async (route) => {
    await response.promise;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pessoa: { id: personId, nomeCompleto: "Pessoa detalhe", vinculos: [] },
        vinculoAtual: null,
        saldos: {},
        alertas: [],
        historico: [],
        multiplosVinculosAtivos: false,
      }),
    });
  });
  try {
    await login(page, user.email, password);
    await page.goto(`/app/pessoas/${personId}`);
    const skeleton = page.getByTestId("loading-skeleton-detail");
    await expect(skeleton).toBeVisible();
    await expect(page.locator(".shell")).toBeVisible();
    await expect(skeleton.locator(".skeleton-item span").first()).toHaveCSS(
      "animation-name",
      "none",
    );
    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
    response.release();
    await expect(
      page.getByRole("heading", { name: "Pessoa detalhe" }),
    ).toBeVisible();
  } finally {
    response.release();
    await db.$disconnect();
  }
});
