import { expect, test, type Page } from "@playwright/test";

const unitId = "11111111-1111-4111-8111-111111111111";
const pendingHref =
  "/app/pessoas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?tab=documentos&vinculoId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb&documentoId=cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const pendingItems = [
  {
    id: "pending-critical",
    codigo: "TCE_ADITIVO_AGUARDANDO_ASSINATURA",
    modulo: "ESTAGIO",
    pessoa: "Marina Costa",
    origem: "Ciclo documental",
    descricao: "O termo aguarda assinatura para concluir a regularização.",
    severidade: "CRITICA",
    href: pendingHref,
    prazo: "2026-09-30T00:00:00.000Z",
  },
  {
    id: "pending-benefit",
    codigo: "AJUSTE_BENEFICIO_PENDENTE",
    modulo: "BENEFICIO",
    pessoa: "Rafael Lima",
    origem: "Benefício mensal",
    descricao: "Existe uma divergência que precisa de conferência.",
    severidade: "ATENCAO",
    href: "/app/beneficios/competencias?competencia=2026-09-01",
  },
  {
    id: "pending-import",
    codigo: "DEPENDENCIA_NAO_PUBLICADA",
    modulo: "IMPORTACAO",
    pessoa: "Camila Alves",
    origem: "importacao.xlsx · Pessoas:12",
    descricao: "A unidade informada ainda não foi publicada.",
    severidade: "REVISAO",
    href: "/app/importacoes?id=import&item=item",
  },
];

const cycleRows = [
  {
    unidadeId: unitId,
    unidade: "Unidade Rio de Janeiro",
    tipo: "TRANSPORTE",
    fornecedorId: "22222222-2222-4222-8222-222222222222",
    fornecedor: "RioCard Mobilidade",
    valorPrevisto: "12300.00",
    valorSolicitado: "11950.00",
    valorConcluido: "9000.00",
    saldoPendente: "2950.00",
    valorCancelado: "0.00",
    pessoasPrevistas: 25,
    pessoasSolicitadas: 24,
    vinculosPrevistos: [],
    vinculosSolicitados: [],
    estado: "SOLICITADO",
    ocorrencias: ["CONFIRMACAO_PARCIAL"],
    impedimentos: [],
  },
  {
    unidadeId: unitId,
    unidade: "Unidade Rio de Janeiro",
    tipo: "ALIMENTACAO",
    fornecedorId: "33333333-3333-4333-8333-333333333333",
    fornecedor: "Flash Benefícios",
    valorPrevisto: "17500.00",
    valorSolicitado: "17500.00",
    valorConcluido: "17500.00",
    saldoPendente: "0.00",
    valorCancelado: "0.00",
    pessoasPrevistas: 25,
    pessoasSolicitadas: 25,
    vinculosPrevistos: [],
    vinculosSolicitados: [],
    estado: "CONCLUIDO",
    ocorrencias: [],
    impedimentos: [],
  },
];

const dashboard = {
  competencia: "2026-09-01",
  custoBeneficios: "29800.00",
  pendenciasCriticas: 1,
  contratosVencendo: 2,
  tcesAguardandoAssinatura: 1,
  feriasAtencao: 3,
  divergenciasBeneficios: 1,
  preparacaoMensalPorFornecedor: cycleRows,
  pendenciasPrioritarias: pendingItems,
  kpiDetalhes: {
    custoBeneficios: [
      {
        id: "cost",
        descricao: "Transporte · Mensal",
        valor: "12300.00",
        href: "/app/beneficios",
      },
    ],
    pendenciasCriticas: [pendingItems[0]],
    contratosVencendo: [
      {
        id: "contract",
        pessoa: "João Souza",
        unidade: "Unidade Rio de Janeiro",
        prazo: "2026-09-28",
        href: "/app/estagiarios",
      },
    ],
    tcesAguardandoAssinatura: [pendingItems[0]],
    feriasAtencao: [
      {
        id: "leave",
        pessoa: "Ana Reis",
        descricao: "Prazo próximo",
        prazo: "2026-10-10",
        href: "/app/ferias",
      },
    ],
    divergenciasBeneficios: [
      {
        id: "difference",
        descricao: "Transporte · Mensal",
        valor: "350.00",
        href: "/app/pendencias?modulo=BENEFICIO",
      },
    ],
  },
};

async function mockApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me"))
      return route.fulfill({
        json: { usuario: { id: "user", nome: "Marina RH" }, csrf: "csrf" },
      });
    if (url.pathname.endsWith("/unidades"))
      return route.fulfill({
        json: {
          items: [{ id: unitId, nome: "Unidade Rio de Janeiro" }],
          total: 1,
        },
      });
    if (url.pathname.endsWith("/dashboard"))
      return route.fulfill({ json: dashboard });
    if (url.pathname.endsWith("/pendencias/resumo"))
      return route.fulfill({
        json: {
          total: 3,
          criticas: 1,
          atencao: 1,
          revisao: 1,
          dependencias: 1,
        },
      });
    if (url.pathname.endsWith("/pendencias")) {
      const module = url.searchParams.get("modulo");
      const severity = url.searchParams.get("severidade");
      const items = pendingItems.filter(
        (item) =>
          (!module || item.modulo === module) &&
          (!severity || item.severidade === severity),
      );
      return route.fulfill({
        json: { items, total: items.length, page: 1, pageSize: 100 },
      });
    }
    return route.fulfill({ json: { items: [], total: 0 } });
  });
}

async function settle(page: Page, heading: string) {
  await expect(
    page.getByRole("heading", { name: heading, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".loading-skeleton")).toHaveCount(0);
  await page.waitForTimeout(150);
}

test("Golden Reference do Dashboard e Pendências", async ({ page }) => {
  test.setTimeout(180_000);
  await mockApi(page);

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/app?competencia=2026-09-01");
  await settle(page, "Visão geral");
  await expect(
    page.getByRole("button", { name: /Custo de benefícios no mês/ }),
  ).toContainText("R$ 29.800,00");
  for (const [label, value] of [
    ["Pendências críticas", "1"],
    ["Contratos vencendo em 30 dias", "2"],
    ["TCEs aguardando assinatura", "1"],
    ["Férias exigindo atenção", "3"],
    ["Divergências de benefícios", "1"],
  ])
    await expect(
      page.getByRole("button", { name: new RegExp(label) }),
    ).toContainText(value);
  await expect(
    page.getByText("Pendências críticas", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("dashboard-desktop-1366x768.png", {
    fullPage: true,
  });

  await page.getByRole("button", { name: /Pendências críticas/ }).click();
  await expect(
    page.getByRole("heading", { name: "Pendências críticas" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("dashboard-atencao-1366x768.png", {
    fullPage: true,
  });

  const chart = page.getByLabel(
    "Valores previstos por unidade, categoria e fornecedor",
  );
  await chart
    .locator('.monthly-preparation-slice[role="button"]')
    .first()
    .focus();
  await page.keyboard.press("Enter");
  await chart.locator('[role="button"][aria-label^="Transporte"]').focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("rowheader", { name: "RioCard Mobilidade" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot(
    "dashboard-chart-drilldown-1366x768.png",
    { fullPage: true },
  );
  await page
    .getByLabel("Navegação do gráfico")
    .getByRole("button", { name: "Todas as unidades" })
    .click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app?competencia=2026-09-01");
  await settle(page, "Visão geral");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await expect(page).toHaveScreenshot("dashboard-mobile-390x844.png", {
    fullPage: true,
  });

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/app/pendencias");
  await settle(page, "Pendências");
  await expect(page.getByText("Total global")).toHaveCount(4);
  await expect(page).toHaveScreenshot("pendencias-desktop-1366x768.png", {
    fullPage: true,
  });

  await page.getByLabel("Módulo").selectOption("BENEFICIO");
  await expect(page.getByText("Rafael Lima", { exact: true })).toBeVisible();
  await expect(page.getByText("Marina Costa", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Total global")).toHaveCount(4);
  await expect(page).toHaveScreenshot("pendencias-filtradas-1366x768.png", {
    fullPage: true,
  });

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.getByText("Marina Costa", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await expect(page).toHaveScreenshot("pendencias-mobile-390x844.png", {
    fullPage: true,
  });

  const expand = page.getByRole("button", {
    name: "Exibir detalhes de Marina Costa",
  });
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expect(page).toHaveURL(/\/app\/pendencias$/);
  await expect(page).toHaveScreenshot(
    "pendencias-mobile-expandida-390x844.png",
    { fullPage: true },
  );

  const review = page.getByRole("button", { name: "Revisar" }).first();
  await review.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(pendingHref.replace(/[?&]/g, "\\$&")),
  );
});

test("Pendências distingue vazio global de vazio filtrado", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/app/pendencias");
  await settle(page, "Pendências");
  await page.getByLabel("Módulo").selectOption("VINCULO");
  await expect(
    page.getByText("Nenhuma pendência para estes filtros"),
  ).toBeVisible();
  await expect(page.getByText("Total global")).toHaveCount(4);

  await page.unroute("**/api/**");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me"))
      return route.fulfill({
        json: { usuario: { id: "user", nome: "Marina RH" }, csrf: "csrf" },
      });
    if (url.pathname.endsWith("/pendencias/resumo"))
      return route.fulfill({
        json: {
          total: 0,
          criticas: 0,
          atencao: 0,
          revisao: 0,
          dependencias: 0,
        },
      });
    if (url.pathname.endsWith("/pendencias"))
      return route.fulfill({
        json: { items: [], total: 0, page: 1, pageSize: 100 },
      });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  await page.goto("/app/pendencias");
  await settle(page, "Pendências");
  await expect(page.getByText("Nenhuma pendência existente")).toBeVisible();
});

test("Dashboard e Pendências não apresentam falha inicial como zero", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me"))
      return route.fulfill({
        json: { usuario: { id: "user", nome: "Marina RH" }, csrf: "csrf" },
      });
    if (url.pathname.endsWith("/unidades"))
      return route.fulfill({ json: { items: [], total: 0 } });
    return route.fulfill({ status: 500, json: { message: "Falha simulada" } });
  });
  await page.goto("/app");
  await expect(
    page.getByText("Não foi possível carregar o Dashboard", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("R$ 0,00")).toHaveCount(0);

  await page.goto("/app/pendencias");
  await expect(
    page.getByText("Não foi possível carregar as pendências", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Total global")).toHaveCount(0);
});
