import { expect, test, type Page } from "@playwright/test";

async function mockCompatibilityApis(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          usuario: { id: "compat-user", nome: "Compatibilidade" },
          csrf: "csrf",
        },
      });
    if (url.pathname.endsWith("/pessoas"))
      return route.fulfill({
        json: {
          items: [],
          total: 0,
          page: 1,
          pageSize: 25,
          segmentos: {},
        },
      });
    if (url.pathname.endsWith("/estagiarios-operacional"))
      return route.fulfill({
        json: { items: [], total: 0, page: 1, pageSize: 25 },
      });
    if (url.pathname.endsWith("/beneficios-operacional"))
      return route.fulfill({
        json: { items: [], total: 0, page: 1, pageSize: 25 },
      });
    if (url.pathname.endsWith("/aquisicoes-beneficios/pedido/previa"))
      return route.fulfill({ json: [] });
    if (/\/(unidades|equipes|instituicoes|fornecedores)$/.test(url.pathname))
      return route.fulfill({
        json: { items: [], total: 0, page: 1, pageSize: 100 },
      });
    return route.fulfill({ json: {} });
  });
}

test("preserva aliases e matching legado do Lote 8", async ({ page }) => {
  await mockCompatibilityApis(page);

  await page.goto("/app/beneficios/lote?competencia=2026-10-01&tipo=OUTRO");
  await expect(
    page.getByRole("heading", { name: "Fazer pedido" }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    /\/app\/beneficios\/lote\?competencia=2026-10-01&tipo=OUTRO$/,
  );

  await page.goto("/app/estagiarios");
  await expect(page).toHaveURL(/\/app\/pessoas\?/);
  expect(new URL(page.url()).searchParams.get("tipo")).toBe("ESTAGIO");
  expect(new URL(page.url()).searchParams.get("page")).toBe("1");

  await page.goto("/app/estagiarios?q=compatibilidade");
  await expect(
    page.getByRole("heading", { name: "Estagiários" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/app\/estagiarios\?q=compatibilidade$/);

  await page.goto("/app/beneficios/lancamentos?novo=1");
  await expect(
    page.getByRole("heading", { name: "Lançamentos de benefícios" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fazer pedido" })).toHaveCount(
    0,
  );

  await page.goto("/app/rota-inexistente");
  await expect(
    page.getByRole("heading", { name: "Página não encontrada" }),
  ).toBeVisible();
});
