import { expect, test, type Page } from "@playwright/test";

const unitId = "11111111-1111-4111-8111-111111111111";
const supplierId = "22222222-2222-4222-8222-222222222222";
const linkId = "33333333-3333-4333-8333-333333333333";

const cycleRows = [
  {
    unidadeId: unitId,
    unidade: "Unidade Rio de Janeiro",
    tipo: "TRANSPORTE",
    fornecedorId: supplierId,
    fornecedor: "RioCard Mobilidade",
    valorPrevisto: "12300.00",
    valorSolicitado: "11950.00",
    valorConcluido: "9000.00",
    saldoPendente: "2950.00",
    valorCancelado: "800.00",
    pessoasPrevistas: 25,
    pessoasSolicitadas: 24,
    vinculosPrevistos: [linkId],
    vinculosSolicitados: [linkId],
    estado: "SOLICITADO",
    ocorrencias: ["CONFIRMACAO_PARCIAL", "PEDIDO_CANCELADO"],
    impedimentos: [],
  },
  {
    unidadeId: unitId,
    unidade: "Unidade Rio de Janeiro",
    tipo: "ALIMENTACAO",
    fornecedorId: "44444444-4444-4444-8444-444444444444",
    fornecedor: "Flash Benefícios",
    valorPrevisto: "17500.00",
    valorSolicitado: "17500.00",
    valorConcluido: "17500.00",
    saldoPendente: "0.00",
    valorCancelado: "0.00",
    pessoasPrevistas: 25,
    pessoasSolicitadas: 25,
    vinculosPrevistos: [linkId],
    vinculosSolicitados: [linkId],
    estado: "CONCLUIDO",
    ocorrencias: [],
    impedimentos: [],
  },
];

function summary(rows = cycleRows, forecast = true) {
  const forecastOnly = rows.every((row) => row.valorSolicitado === "0.00");
  return {
    competencia: "2026-10-01",
    previsto: forecast ? "29800.00" : "0.00",
    solicitado: forecastOnly ? "0.00" : "29450.00",
    concluido: forecastOnly ? "0.00" : "26500.00",
    compradoLiquido: forecastOnly ? "0.00" : "26500.00",
    emPedido: forecastOnly ? "0.00" : "2950.00",
    cancelado: "800.00",
    pessoasPrevistas: forecast ? 25 : 0,
    estado: forecastOnly ? "PREVISTO" : "SOLICITADO",
    ocorrencias: forecastOnly
      ? []
      : ["CONFIRMACAO_PARCIAL", "PEDIDO_CANCELADO"],
    impedimentos: [],
    unidades: [
      {
        id: unitId,
        unidadeId: unitId,
        unidade: "Unidade Rio de Janeiro",
        possuiPrevisao: forecast,
        pessoasPrevistas: forecast ? 25 : 0,
        valorPrevisto: forecast ? "29800.00" : "0.00",
        valorSolicitado: forecastOnly ? "0.00" : "29450.00",
        valorConcluido: forecastOnly ? "0.00" : "26500.00",
        saldoPendente: forecastOnly ? "0.00" : "2950.00",
        estado: forecastOnly ? "PREVISTO" : "SOLICITADO",
        ocorrencias: forecastOnly ? [] : ["CONFIRMACAO_PARCIAL"],
        impedimentos: [],
        fechamento: "ABERTA",
      },
    ],
    cicloMensal: rows,
    previsaoPersistida: forecast,
    lancamentosPendentes: 1,
  };
}

async function settle(page: Page, heading: string) {
  await expect(
    page.getByRole("heading", { name: heading, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".loading-skeleton")).toHaveCount(0);
  await page.waitForTimeout(150);
}

test("Golden Reference de Benefícios e Competências", async ({ page }) => {
  test.setTimeout(180_000);
  let future = false;
  let cancelledOnly = false;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          usuario: { id: "user", nome: "Marina Benefícios" },
          csrf: "csrf",
        },
      });
    if (url.pathname.endsWith("/unidades"))
      return route.fulfill({
        json: {
          items: [{ id: unitId, nome: "Unidade Rio de Janeiro" }],
          total: 1,
        },
      });
    if (url.pathname.endsWith("/beneficios/resumo"))
      return route.fulfill({
        json: summary(
          future
            ? cycleRows.map((row) => ({
                ...row,
                valorSolicitado: "0.00",
                valorConcluido: "0.00",
                saldoPendente: "0.00",
                estado: "PREVISTO",
                ocorrencias: [],
              }))
            : cycleRows,
          true,
        ),
      });
    if (url.pathname.endsWith("/beneficios/ciclo-mensal/detalhe"))
      return route.fulfill({
        json: {
          competencia: "2026-10-01",
          unidadeId: unitId,
          tipo: "TRANSPORTE",
          possuiPrevisao: true,
          previsao: {
            id: "forecast",
            numero: 2,
            competenciaBase: "2026-09-01",
            congeladaEm: "2026-10-02T12:00:00.000Z",
            baseReaberta: false,
            composicaoIncompleta: false,
            itens: [
              {
                id: "forecast-item",
                vinculoId: linkId,
                pessoaNome: "Ana Vitória Matos",
                fornecedorId: supplierId,
                fornecedor: "RioCard Mobilidade",
                fornecedorAtivo: true,
                valorPrevisto: "500.00",
                composicao: { transportes: 2 },
                incluido: true,
                motivoExclusao: null,
                impedimentos: [],
                origemValor: "VALOR_SOLICITADO",
              },
            ],
          },
          pedidos: cancelledOnly
            ? [
                {
                  id: "cancelled",
                  status: "CANCELADA",
                  fornecedor: "RioCard Mobilidade",
                  itens: [],
                },
              ]
            : [
                {
                  id: "order",
                  status: "PENDENTE",
                  fornecedor: "RioCard Mobilidade",
                  referenciaExterna: "PED-2026-10",
                  itens: [
                    {
                      id: "item",
                      pessoaNome: "Ana Vitória Matos",
                      status: "PENDENTE",
                      valorSolicitado: "480.00",
                      valorReservado: "180.00",
                      movimentacoes: [{ tipo: "CONFIRMACAO", valor: "300.00" }],
                    },
                  ],
                },
                {
                  id: "cancelled",
                  status: "CANCELADA",
                  fornecedor: "Fornecedor anterior",
                  itens: [],
                },
              ],
          fechamento: "ABERTA",
        },
      });
    if (url.pathname.endsWith("/beneficios/ciclo-mensal"))
      return route.fulfill({
        json: {
          ...summary().totais,
          competencia: "2026-10-01",
          possuiPrevisao: true,
          totais: {
            previsto: "29800.00",
            solicitado: "29450.00",
            concluido: "26500.00",
            pendente: "2950.00",
            cancelado: "800.00",
          },
          pessoasPrevistas: 25,
          estado: "SOLICITADO",
          ocorrencias: [],
          impedimentos: [],
          fechamentos: [],
          unidades: [],
          itens: cycleRows,
        },
      });
    return route.continue();
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/beneficios?competencia=2026-10-01");
  await settle(page, "Benefícios");
  await expect(page).toHaveScreenshot("beneficios-desktop-1440x900.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02,
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(page).toHaveScreenshot("beneficios-desktop-1366x768.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02,
  });
  future = true;
  await page.goto("/app/beneficios?competencia=2026-11-01");
  await settle(page, "Benefícios");
  await expect(page).toHaveScreenshot("beneficios-futuro-1366x768.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02,
  });
  future = false;
  await page.goto("/app/beneficios?competencia=2026-10-01");
  await settle(page, "Benefícios");
  await expect(page).toHaveScreenshot("beneficios-ciclo-misto-1366x768.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page).toHaveScreenshot("beneficios-unidades-1280x720.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02,
  });

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/app/beneficios/competencias?competencia=2026-10-01");
  await settle(page, "Competências");
  await expect(page).toHaveScreenshot("competencias-desktop-1366x768.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02,
  });
  await page.getByRole("button", { name: /Transporte/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveScreenshot("competencias-detalhe-1366x768.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02,
  });
  await page.getByLabel("Fechar").click();
  cancelledOnly = true;
  await page.getByRole("button", { name: /Transporte/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveScreenshot("competencias-cancelado-1366x768.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.02,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/beneficios?competencia=2026-10-01");
  await settle(page, "Benefícios");
  await expect(
    page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).resolves.toBe(true);
  await expect(page).toHaveScreenshot("beneficios-mobile-390x844.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.04,
  });
  cancelledOnly = false;
  await page.goto("/app/beneficios/competencias?competencia=2026-10-01");
  await settle(page, "Competências");
  await page.getByRole("button", { name: /Transporte/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).resolves.toBe(true);
  await expect(page).toHaveScreenshot(
    "competencias-mobile-detalhe-390x844.png",
    { animations: "disabled", maxDiffPixelRatio: 0.04 },
  );
});
