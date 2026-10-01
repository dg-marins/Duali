import { expect, test, type Page } from "@playwright/test";

const peopleRows = [
  {
    Pessoa: "Marina Costa",
    Unidade: "Unidade Rio de Janeiro",
    Equipe: "Tecnologia",
    Vínculo: "CLT",
    Status: "ATIVO",
    Admissão: "2024-02-01",
    CPF: "123.456.789-00",
    "E-mail": "marina@example.test",
    Telefone: "(21) 99999-0000",
    Cargo: "Analista de pessoas",
    Desligamento: null,
  },
  {
    Pessoa: "Rafael Lima",
    Unidade: "Unidade São Paulo",
    Equipe: "Operações",
    Vínculo: "ESTAGIO",
    Status: "ATIVO",
    Admissão: "2025-03-10",
    CPF: "987.654.321-00",
    "E-mail": "rafael@example.test",
    Telefone: "(11) 98888-0000",
    Cargo: "Estagiário",
    Desligamento: null,
  },
];

const benefitRows = [
  {
    Pessoa: "Marina Costa",
    Unidade: "Unidade Rio de Janeiro",
    Equipe: "Tecnologia",
    Vínculo: "CLT",
    Benefício: "Transporte",
    Fornecedor: "RioCard Mobilidade",
    Condução: "Ônibus",
    Componente: "Ida e volta",
    Competência: "2026-09-01",
    Dias: 22,
    "Valor diário": "21.50",
    "Total mensal do item": "473.00",
    Quantidade: 2,
    "Valor unitário": "10.75",
    "Valor calculado": "473.00",
    "Valor informado": "470.00",
    Ajustes: "0.00",
    Divergência: "-3.00",
    Status: "CONFERIDO",
    Observações: "Conferência mensal",
  },
];

const auditRows = [
  {
    id: "audit-1",
    criadoEm: "2026-09-20T14:30:00.000Z",
    usuario: { nome: "Marina RH" },
    acao: "ATUALIZAR",
    entidade: "pessoa",
    dadosAnteriores: {
      nomeCompleto: "Marina C.",
      email: "antigo@example.test",
    },
    dadosNovos: { nomeCompleto: "Marina Costa", email: "marina@example.test" },
  },
  {
    id: "audit-2",
    criadoEm: "2026-09-19T10:00:00.000Z",
    usuario: { nome: "Administrador" },
    acao: "EXPORTAR",
    entidade: "relatorio",
    dadosAnteriores: null,
    dadosNovos: { tipo: "pessoas", formato: "xlsx" },
  },
];

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
          items: [{ id: "unit-rj", nome: "Unidade Rio de Janeiro" }],
          total: 1,
        },
      });
    if (url.pathname.endsWith("/equipes"))
      return route.fulfill({
        json: { items: [{ id: "team-tech", nome: "Tecnologia" }], total: 1 },
      });
    if (url.pathname.includes("/relatorios/")) {
      const kind = url.pathname.split("/").at(-1);
      const empty = url.searchParams.get("q") === "sem resultado";
      const items = empty
        ? []
        : kind === "beneficios"
          ? benefitRows
          : peopleRows;
      return route.fulfill({
        json: { items, total: items.length, page: 1, pageSize: 25 },
      });
    }
    if (url.pathname.endsWith("/auditoria")) {
      const filtered = url.searchParams.get("q");
      const items = filtered
        ? auditRows.filter((row) =>
            JSON.stringify(row).toLowerCase().includes(filtered.toLowerCase()),
          )
        : auditRows;
      return route.fulfill({
        json: { items, total: items.length, page: 1, pageSize: 25 },
      });
    }
    if (url.pathname.includes("/exportacoes/"))
      return route.fulfill({ body: "Resultado\r\n", contentType: "text/csv" });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
}

async function settle(page: Page, heading: string) {
  await expect(
    page.getByRole("heading", { name: heading, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".loading-skeleton")).toHaveCount(0);
  await page.waitForTimeout(250);
}

test("Golden Reference de Relatórios", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/app/relatorios");
  await settle(page, "Relatórios");
  await expect(page.getByText("Marina Costa", { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot(
    "relatorios-pessoas-desktop-1366x768.png",
    { fullPage: true },
  );

  await page.getByLabel("Relatório").selectOption("beneficios");
  await expect(
    page.getByText("RioCard Mobilidade", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page).toHaveScreenshot(
    "relatorios-beneficios-desktop-1440x900.png",
    { fullPage: true },
  );

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByLabel("Tipo de vínculo").selectOption("CLT");
  await page.getByLabel("Status do vínculo").selectOption("ATIVO");
  await page.getByLabel("Início").fill("2026-09-01");
  await expect(page).toHaveScreenshot("relatorios-filtros-1366x768.png", {
    fullPage: true,
  });

  await page.getByLabel("Buscar pessoa").fill("sem resultado");
  await expect(
    page.getByText("Nenhum resultado", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("relatorios-empty-1366x768.png", {
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/relatorios");
  await settle(page, "Relatórios");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await expect(page).toHaveScreenshot("relatorios-mobile-390x844.png", {
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Exibir detalhes de Marina Costa" })
    .click();
  await expect(
    page.locator(".ds-data-table__details").getByText("marina@example.test"),
  ).toBeVisible();
  await expect(page).toHaveScreenshot(
    "relatorios-mobile-expanded-390x844.png",
    { fullPage: true },
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/app/relatorios");
  await settle(page, "Relatórios");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 1280);
});

test("Golden Reference de Auditoria", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/app/admin/auditoria");
  await settle(page, "Auditoria");
  await expect(page.getByText("ATUALIZAR", { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot("auditoria-desktop-1366x768.png", {
    fullPage: true,
  });

  await page.getByLabel("Entidade").fill("pessoa");
  await page
    .getByRole("textbox", { name: "Ação", exact: true })
    .fill("ATUALIZAR");
  await page
    .getByRole("textbox", { name: "De", exact: true })
    .fill("2026-09-01");
  await expect(page).toHaveScreenshot("auditoria-filtros-1366x768.png", {
    fullPage: true,
  });

  await page.getByRole("button", { name: "Ver alteração" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "ATUALIZAR · pessoa" }),
  ).toBeVisible();
  await expect(page.getByText("Marina C.", { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot("auditoria-detalhe-1366x768.png", {
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Ver alteração" }).first(),
  ).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/admin/auditoria");
  await settle(page, "Auditoria");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await expect(page).toHaveScreenshot("auditoria-mobile-390x844.png", {
    fullPage: true,
  });
  const expand = page
    .getByRole("button", { name: /Exibir detalhes de ATUALIZAR em pessoa/ })
    .first();
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".ds-data-table__details").getByText("Marina RH", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ver alteração" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "ATUALIZAR · pessoa" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("auditoria-mobile-detalhe-390x844.png", {
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/app/admin/auditoria");
  await settle(page, "Auditoria");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 1280);
});
