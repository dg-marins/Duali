import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";

async function credentials(db: PrismaClient) {
  const suffix = randomUUID();
  const password = `${randomUUID()}Aa!`;
  const user = await db.usuario.create({
    data: {
      nome: "Sessão E2E",
      email: `${suffix}@example.test`,
      senhaHash: await argon2.hash(password),
    },
  });
  return { user, password };
}

async function login(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByText("Sessão E2E", { exact: true }).first(),
  ).toBeVisible();
}

test("sessão expirada remove o shell e retorna à rota anterior após login", async ({
  page,
}) => {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const { user, password } = await credentials(db);
  try {
    await page.goto("/");
    await login(page, user.email, password);
    await page.getByRole("button", { name: "Pessoas", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pessoas" })).toBeVisible();
    await db.sessao.updateMany({
      where: { usuarioId: user.id },
      data: { expiraEm: new Date(Date.now() - 1000) },
    });
    await page
      .getByPlaceholder("Nome, CPF, e-mail ou matrícula")
      .fill("expirada");
    await expect(
      page.getByText("Sua sessão expirou. Entre novamente."),
    ).toBeVisible();
    await expect(page.locator(".shell")).toHaveCount(0);
    await login(page, user.email, password);
    await expect(page).toHaveURL(/\/app\/pessoas\?page=1$/);
    await expect(page.getByRole("heading", { name: "Pessoas" })).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});

test("indisponibilidade no bootstrap tem estado próprio e permite nova tentativa", async ({
  page,
}) => {
  let unavailable = true;
  await page.route("**/api/auth/me", (route) =>
    unavailable ? route.abort() : route.continue(),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Duali indisponível" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("bootstrap 5xx keeps the unavailable state separate from login", async ({
  page,
}) => {
  let unavailable = true;
  await page.route("**/api/auth/me", (route) =>
    unavailable
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "UNAVAILABLE", message: "API unavailable." },
          }),
        })
      : route.continue(),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Duali indispon/i }),
  ).toBeVisible();
  const retry = page.getByRole("button", { name: /Tentar novamente/i });
  await expect(retry).toBeFocused();
  unavailable = false;
  await retry.click();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("falha no logout limpa o estado local e informa a revogação não confirmada", async ({
  page,
}) => {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const { user, password } = await credentials(db);
  try {
    await page.goto("/");
    await login(page, user.email, password);
    await page.route("**/api/auth/logout", (route) => route.abort());
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expect(
      page.getByText(
        "Você saiu desta tela, mas não foi possível encerrar a sessão no servidor.",
      ),
    ).toBeVisible();
    await expect(page.locator(".shell")).toHaveCount(0);
  } finally {
    await db.$disconnect();
  }
});

test("erro de negócio permanece na tela sem encerrar a sessão", async ({
  page,
}) => {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const { user, password } = await credentials(db);
  try {
    await page.goto("/");
    await login(page, user.email, password);
    await page.getByRole("button", { name: "Pessoas", exact: true }).click();
    await page.getByRole("button", { name: "+ Nova pessoa" }).click();
    const form = page.locator(".form-panel");
    await form.getByLabel("Nome completo *").fill("Pessoa inválida");
    await form.getByLabel("CPF").fill("123");
    await form.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(form.getByText("Confira os campos informados.")).toBeVisible();
    await expect(page.locator(".shell")).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});

test("401 no download também encerra o estado autenticado", async ({
  page,
}) => {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const { user, password } = await credentials(db);
  try {
    await page.goto("/");
    await login(page, user.email, password);
    await page.getByRole("button", { name: "Relatórios", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Relatórios" }),
    ).toBeVisible();
    await page.route("**/api/exportacoes/**", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "DOMAIN", message: "Sessão expirada." },
        }),
      }),
    );
    await page.getByRole("button", { name: "Exportar CSV" }).click();
    await expect(
      page.getByText("Sua sessão expirou. Entre novamente."),
    ).toBeVisible();
    await expect(page.locator(".shell")).toHaveCount(0);
  } finally {
    await db.$disconnect();
  }
});
