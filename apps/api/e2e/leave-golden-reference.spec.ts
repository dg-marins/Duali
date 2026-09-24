import { expect, test, type Page } from "@playwright/test";

const unitId = "11111111-1111-4111-8111-111111111111";
const rows = [
  leaveRow(
    "33333333-3333-4333-8333-333333333331",
    "Ana Vitória Matos",
    "CLT",
    "21",
    "9",
    [period("PROGRAMADO", "2026-10-05", "2026-10-13", 9)],
  ),
  leaveRow(
    "33333333-3333-4333-8333-333333333332",
    "Bruno Albuquerque",
    "ESTAGIO",
    "10",
    "5",
    [period("EM_GOZO", "2026-09-20", "2026-09-24", 5)],
  ),
  leaveRow(
    "33333333-3333-4333-8333-333333333333",
    "Carolina Mendes",
    "TRAINEE",
    "0",
    "0",
    [period("CONCLUIDO", "2026-03-01", "2026-03-15", 15)],
  ),
];

function period(
  status: string,
  dataInicio: string,
  dataFim: string,
  quantidadeDias: number,
) {
  return {
    id: `${status}-${dataInicio}`,
    vinculoId: "link",
    tipo: "FERIAS",
    status,
    dataInicio,
    dataFim,
    quantidadeDias,
    motivo: null,
    observacoes: null,
  };
}

function leaveRow(
  id: string,
  nome: string,
  tipo: string,
  disponivel: string,
  comprometido: string,
  periodos: object[],
) {
  return {
    id,
    pessoaId: `person-${id}`,
    pessoa: { id: `person-${id}`, nomeCompleto: nome, ativa: true },
    unidade: { id: unitId, nome: "Unidade Rio de Janeiro" },
    equipe: { id: "team", nome: "Operações" },
    unidadeId: unitId,
    tipo,
    status: "ATIVO",
    saldo: {
      saldo: Number(disponivel) + Number(comprometido),
      saldoContabil: String(Number(disponivel) + Number(comprometido)),
      diasComprometidos: comprometido,
      saldoDisponivelParaProgramar: disponivel,
      adquiridos: 30,
      consumidos: tipo === "TRAINEE" ? 30 : 0,
      ajustes: 0,
      programados: comprometido,
      direitos: [
        {
          id: `right-${id}`,
          dataAquisicao: "2026-01-01",
          inicioAquisitivo: "2025-01-01",
          fimAquisitivo: "2025-12-31",
          prazoConcessivo: "2026-12-31",
          quantidadeDias: 30,
          pendente: Number(disponivel) + Number(comprometido),
        },
      ],
      periodos,
      consumos: [],
      ajustesHistorico: [],
      alertas: tipo === "ESTAGIO" ? ["Prazo de férias próximo."] : [],
    },
  };
}

async function settle(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Férias", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".loading-skeleton")).toHaveCount(0);
  await page.waitForTimeout(220);
}

test("Golden Reference de Férias e Descansos", async ({ page }) => {
  test.setTimeout(60_000);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          usuario: { id: "user", nome: "Marina Recursos Humanos" },
          csrf: "csrf",
        },
      });
    if (url.pathname.endsWith("/unidades"))
      return route.fulfill({
        json: {
          items: [{ id: unitId, nome: "Unidade Rio de Janeiro" }],
          total: 1,
          page: 1,
          pageSize: 100,
        },
      });
    if (url.pathname.endsWith("/equipes"))
      return route.fulfill({
        json: {
          items: [{ id: "team", nome: "Operações" }],
          total: 1,
          page: 1,
          pageSize: 100,
        },
      });
    if (
      url.pathname.endsWith("/instituicoes") ||
      url.pathname.endsWith("/fornecedores")
    )
      return route.fulfill({
        json: { items: [], total: 0, page: 1, pageSize: 100 },
      });
    if (url.pathname.endsWith("/descansos-operacional")) {
      const situation = url.searchParams.get("situacao");
      const items =
        situation === "A_PROGRAMAR"
          ? rows.filter(
              (row) => Number(row.saldo.saldoDisponivelParaProgramar) > 0,
            )
          : situation
            ? rows.filter((row) =>
                row.saldo.periodos.some((item) => item.status === situation),
              )
            : rows;
      return route.fulfill({
        json: {
          items,
          total: items.length,
          page: 1,
          pageSize: 25,
          ano: 2026,
          resumo: { aProgramar: 2, programadas: 1, emFerias: 1, concluidas: 1 },
        },
      });
    }
    if (
      url.pathname.endsWith("/periodos") &&
      route.request().method() === "POST"
    )
      return route.fulfill({ status: 201, json: { id: "new-period" } });
    return route.continue();
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/ferias?ano=2026");
  await settle(page);
  await expect(page).toHaveScreenshot("ferias-desktop-1440x900.png", {
    fullPage: true,
  });

  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(page).toHaveScreenshot("ferias-desktop-1366x768.png", {
    fullPage: true,
  });
  await page.getByRole("button", { name: /A programar/ }).click();
  await settle(page);
  await expect(page).toHaveScreenshot("ferias-a-programar-1366x768.png", {
    fullPage: true,
  });
  await page.getByRole("button", { name: /Programadas/ }).click();
  await settle(page);
  await expect(page).toHaveScreenshot("ferias-programadas-1366x768.png", {
    fullPage: true,
  });
  await page.getByRole("button", { name: /Em férias/ }).click();
  await settle(page);
  await expect(page).toHaveScreenshot("ferias-em-gozo-1366x768.png", {
    fullPage: true,
  });

  await page.goto("/app/ferias?ano=2026");
  await settle(page);
  await page
    .getByRole("button", {
      name: "Ana Vitória Matos Unidade Rio de Janeiro",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot("ferias-detalhe-1366x768.png", {
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Programar/ })
    .last()
    .click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot("ferias-programacao-1366x768.png", {
    fullPage: true,
  });
  await page.getByLabel("Data inicial").fill("2026-11-01");
  await page.getByLabel("Data final").fill("2026-11-10");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot("ferias-revisao-1366x768.png", {
    fullPage: true,
  });
  await page.getByRole("button", { name: "Fechar" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/ferias?ano=2026");
  await settle(page);
  await expect(page).toHaveScreenshot("ferias-mobile-390x844.png", {
    fullPage: true,
  });
  const details = page.getByRole("button", {
    name: /Exibir detalhes de Ana Vitória/,
  });
  await details.click();
  await expect(details).toHaveAttribute("aria-expanded", "true");
  await expect(page).toHaveURL(/\/app\/ferias/);
  await page
    .getByRole("button", {
      name: "Ana Vitória Matos Unidade Rio de Janeiro",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot("ferias-mobile-detalhe-390x844.png", {
    fullPage: true,
  });
});
