import { expect, test, type Page, type Route } from "@playwright/test";

const sheets = [
  {
    nome: "Dados",
    colunas: ["Nome", "CPF", "E-mail", "Unidade"],
    linhas: 3,
    previa: [
      {
        Nome: "Marina Costa",
        CPF: "12345678900",
        "E-mail": "marina@example.test",
        Unidade: "Rio de Janeiro",
      },
      {
        Nome: "Rafael Lima",
        CPF: "98765432100",
        "E-mail": "rafael@example.test",
        Unidade: "São Paulo",
      },
      {
        Nome: "Ana Souza",
        CPF: "",
        "E-mail": "ana@example.test",
        Unidade: "Rio de Janeiro",
      },
    ],
  },
];

const reviewItem = {
  id: "item-1",
  numeroLinha: 4,
  grupo: "Pessoas",
  dominio: "pessoas",
  status: "DUPLICIDADE",
  acao: "PENDENTE",
  mensagens: ["Possível duplicidade por nome e e-mail"],
  dadosOriginais: { Nome: "Marina Costa", Email: "marina@example.test" },
  dadosNormalizados: {
    nomeCompleto: "Marina Costa",
    email: "marina@example.test",
  },
  candidatos: [
    { id: "person-1", nome: "Marina Costa", evidencia: "E-mail idêntico" },
  ],
};

const history = [
  {
    id: "upload-1",
    nomeArquivo: "pessoas.csv",
    status: "UPLOAD",
    criadoEm: "2026-09-24T10:00:00.000Z",
    confirmadaEm: null,
  },
  {
    id: "review-1",
    nomeArquivo: "ferias-funcionarios.xlsx",
    status: "REVISAO",
    criadoEm: "2026-09-23T10:00:00.000Z",
    confirmadaEm: null,
  },
  {
    id: "confirmed-1",
    nomeArquivo: "beneficios-2026.xlsx",
    status: "CONFIRMADA",
    criadoEm: "2026-09-22T10:00:00.000Z",
    confirmadaEm: "2026-09-22T10:02:00.000Z",
  },
];

function batch(id: string) {
  if (id === "upload-1")
    return { id, nomeArquivo: "pessoas.csv", status: "UPLOAD", abas: sheets };
  if (id === "confirmed-1")
    return {
      id,
      nomeArquivo: "beneficios-2026.xlsx",
      status: "CONFIRMADA",
      abas: sheets,
      items: [
        {
          ...reviewItem,
          id: "imported",
          status: "IMPORTADO",
          acao: "IMPORTADO",
        },
      ],
      total: 1,
      totalRegistros: 1,
      summary: [{ status: "IMPORTADO", acao: "IMPORTADO", _count: 1 }],
    };
  return {
    id: "review-1",
    nomeArquivo: "ferias-funcionarios.xlsx",
    status: "REVISAO",
    abas: sheets,
    items: [reviewItem],
    total: 1,
    totalRegistros: 3,
    summary: [
      { status: "DUPLICIDADE", acao: "PENDENTE", _count: 1 },
      { status: "IMPORTADO", acao: "IMPORTADO", _count: 2 },
    ],
  };
}

async function mockApi(page: Page) {
  let analyzed = false;
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/auth/me"))
      return route.fulfill({
        json: { usuario: { id: "user", nome: "Marina RH" }, csrf: "csrf" },
      });
    if (url.pathname.endsWith("/importacoes") && request.method() === "GET")
      return route.fulfill({
        json: { items: history, total: history.length, page: 1, pageSize: 25 },
      });
    if (url.pathname.endsWith("/importacoes") && request.method() === "POST")
      return route.fulfill({ status: 201, json: batch("upload-1") });
    if (url.pathname.endsWith("/analisar")) {
      analyzed = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname.endsWith("/publicar-validos"))
      return route.fulfill({ json: { ok: true } });
    if (url.pathname.includes("/importacao-itens/"))
      return route.fulfill({ json: { ok: true } });
    const importMatch = url.pathname.match(/\/importacoes\/([^/]+)$/);
    if (importMatch)
      return route.fulfill({
        json:
          analyzed && importMatch[1] === "upload-1"
            ? batch("confirmed-1")
            : batch(importMatch[1]),
      });
    if (url.pathname.endsWith("/pessoas/person-1"))
      return route.fulfill({
        json: {
          id: "person-1",
          nomeCompleto: "Marina Costa",
          email: "marina@example.test",
        },
      });
    if (url.pathname.endsWith("/pessoas"))
      return route.fulfill({
        json: {
          items: [
            {
              id: "person-1",
              nomeCompleto: "Marina Costa",
              email: "marina@example.test",
            },
          ],
          total: 1,
          pageSize: 100,
        },
      });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
}

async function settle(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Importações", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".loading-skeleton")).toHaveCount(0);
  await page.waitForTimeout(200);
}

async function settleVisual(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

function historyRow(page: Page, file: string) {
  return page.getByRole("row").filter({ hasText: file });
}

test("Golden Reference de Importações", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/app/importacoes");
  await settle(page);
  await settleVisual(page);
  await expect(page).toHaveScreenshot(
    "importacoes-inicial-desktop-1366x768.png",
    { fullPage: true },
  );

  await page.setViewportSize({ width: 1280, height: 720 });
  await settleVisual(page);
  await expect(page).toHaveScreenshot("importacoes-historico-1280x720.png", {
    fullPage: true,
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('input[type="file"]').setInputFiles({
    name: "pessoas.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Nome,CPF\nMarina,123"),
  });
  await expect(page.getByRole("heading", { name: "Mapeamento" })).toBeVisible();
  await expect(page.getByText("Marina Costa", { exact: true })).toBeVisible();
  await settleVisual(page);
  await expect(page).toHaveScreenshot(
    "importacoes-mapeamento-preview-1440x900.png",
    { fullPage: true },
  );

  await page.setViewportSize({ width: 1366, height: 768 });
  await historyRow(page, "ferias-funcionarios.xlsx")
    .getByRole("button", { name: "Retomar" })
    .click();
  await expect(
    page.getByText("Possível duplicidade por nome e e-mail", { exact: true }),
  ).toBeVisible();
  await settleVisual(page);
  await expect(page).toHaveScreenshot("importacoes-revisao-1366x768.png", {
    fullPage: true,
  });

  await page.getByRole("button", { name: "Revisar", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Revisar linha 4" }),
  ).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page).toHaveScreenshot("importacoes-revisao-item-1366x768.png", {
    fullPage: false,
  });
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Revisar linha 4" }),
  ).toBeHidden();

  await page
    .getByRole("button", { name: "Publicar itens disponíveis", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Publicar itens disponíveis?" }),
  ).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page).toHaveScreenshot("importacoes-publicacao-1366x768.png", {
    fullPage: false,
  });
  await page.getByRole("button", { name: "Continuar editando" }).click();

  await historyRow(page, "beneficios-2026.xlsx")
    .getByRole("button", { name: "Retomar" })
    .click();
  await expect(
    page.getByRole("heading", { name: /^Resultado ·/ }),
  ).toBeVisible();
  await settleVisual(page);
  await expect(page).toHaveScreenshot("importacoes-resultado-1366x768.png", {
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/importacoes");
  await settle(page);
  await settleVisual(page);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await expect(page).toHaveScreenshot(
    "importacoes-mobile-inicial-390x844.png",
    { fullPage: true },
  );

  await historyRow(page, "ferias-funcionarios.xlsx")
    .getByRole("button", { name: "Retomar" })
    .click();
  await expect(
    page.getByRole("button", { name: "Exibir detalhes de linha 4" }),
  ).toBeVisible();
  await settleVisual(page);
  await expect(page).toHaveScreenshot(
    "importacoes-mobile-revisao-390x844.png",
    { fullPage: true },
  );
  await page.getByRole("button", { name: "Revisar", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Revisar linha 4" }),
  ).toBeVisible();
  await page.waitForTimeout(250);
  const reviewDialog = page.getByRole("dialog", { name: "Revisar linha 4" });
  const dialogBounds = await reviewDialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, viewport: window.innerWidth };
  });
  expect(
    dialogBounds.left >= 0 && dialogBounds.right <= dialogBounds.viewport,
  ).toBe(true);
  expect(
    await reviewDialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await expect(page).toHaveScreenshot("importacoes-mobile-item-390x844.png", {
    fullPage: false,
  });
});

test("expansão e revisão são ações independentes", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/importacoes");
  await settle(page);
  await historyRow(page, "ferias-funcionarios.xlsx")
    .getByRole("button", { name: "Retomar" })
    .click();
  const expand = page.getByRole("button", {
    name: /Exibir detalhes de linha 4/,
  });
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("dialog", { name: "Revisar linha 4" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Revisar", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Revisar linha 4" }),
  ).toBeVisible();
});
