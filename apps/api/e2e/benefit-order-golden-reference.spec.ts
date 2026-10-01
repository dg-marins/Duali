import { expect, test, type Page } from "@playwright/test";

const unit = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Unidade Rio de Janeiro",
  sigla: "URJ",
};
const supplierA = {
  id: "22222222-2222-4222-8222-222222222222",
  nome: "Fornecedor Mobilidade",
};
const supplierB = {
  id: "33333333-3333-4333-8333-333333333333",
  nome: "Fornecedor Integração",
};
const suppliers = [supplierA, supplierB].map((fornecedor, index) => ({
  configuracaoId: `${index + 4}4444444-4444-4444-8444-444444444444`,
  fornecedorId: fornecedor.id,
  fornecedor,
}));

function row(
  name: string,
  values: Record<string, unknown> = {},
): Record<string, unknown> {
  const suffix = name === "Ana Vitória Matos" ? "a" : "b";
  return {
    vinculoId: `${suffix.repeat(8)}-${suffix.repeat(4)}-4${suffix.repeat(3)}-8${suffix.repeat(3)}-${suffix.repeat(12)}`,
    pessoa: name,
    equipe: "Operações",
    vinculoStatus: "ATIVO",
    fornecedores: suppliers,
    configuracaoId: suppliers[0]!.configuracaoId,
    incluirAutomaticamente: true,
    quantidadeDias: "22.00",
    quantidade: "1.00",
    valorUnitario: "25.50",
    valorMensalBase: null,
    valorSugerido: "561.00",
    valorPrevisto: null,
    referenciaAnterior: "535.50",
    referenciaStatus: "REFERENCIA_ANTERIOR",
    competenciaId: null,
    transporteItens: [],
    impedimento: null,
    ...values,
  };
}

async function stable(page: Page) {
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function shot(page: Page, name: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await stable(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    fullPage: true,
  });
}

async function discardDraft(page: Page) {
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Descartar alterações do pedido?",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Descartar alterações" }).click();
  await expect(page).toHaveURL(/\/app\/beneficios(?:\?|$)/);
}

test("Golden Reference do pedido mensal", async ({ page }) => {
  test.setTimeout(180_000);
  let mode: "normal" | "forecast" | "blocked" = "normal";
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          usuario: { id: "user", nome: "Marina Benefícios" },
          csrf: "csrf",
        },
      });
    if (url.pathname.endsWith("/unidades"))
      return route.fulfill({
        json: { items: [unit], total: 1, page: 1, pageSize: 100 },
      });
    if (url.pathname.endsWith("/aquisicoes-beneficios/pedido/previa")) {
      const type = url.searchParams.get("tipo");
      if (mode === "blocked")
        return route.fulfill({
          json: [
            row("Ana Vitória Matos", {
              incluirAutomaticamente: false,
              impedimento:
                "A previsão usa um fornecedor inativo; selecione uma configuração válida.",
            }),
          ],
        });
      if (type === "TRANSPORTE")
        return route.fulfill({
          json: [
            row("Ana Vitória Matos", {
              valorUnitario: null,
              valorSugerido: "594.00",
              transporteItens: [
                {
                  tipoConducao: "ONIBUS",
                  fornecedorId: supplierA.id,
                  fornecedor: supplierA,
                  valorDiario: "11.20",
                },
                {
                  tipoConducao: "METRO",
                  fornecedorId: supplierB.id,
                  fornecedor: supplierB,
                  valorDiario: "15.80",
                },
              ],
            }),
          ],
        });
      return route.fulfill({
        json: [
          row("Ana Vitória Matos", {
            ...(mode === "forecast" ? { valorPrevisto: "561.00" } : {}),
          }),
          row("Bruno Carvalho", {
            vinculoStatus: "AFASTADO",
            incluirAutomaticamente: false,
            quantidadeDias: "20.00",
            valorSugerido: "510.00",
          }),
        ],
      });
    }
    return route.fulfill({ json: {} });
  });

  const base = `/app/beneficios/aquisicao?unidadeId=${unit.id}&competencia=2026-10-01&tipo=ALIMENTACAO`;
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "Fazer pedido" }),
  ).toBeVisible();
  await shot(page, "fazer-pedido-inicial-desktop-1366x768", 1366, 768);

  await page.setViewportSize({ width: 1280, height: 720 });
  await stable(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Gerar pedido", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1366, height: 768 });

  await page.getByLabel("Dias de Ana Vitória Matos").fill("20");
  const dailyValue = page.getByLabel("Valor diário de Ana Vitória Matos");
  await dailyValue.focus();
  await expect(dailyValue).toHaveValue("25,50");
  await dailyValue.fill("26,00");
  await dailyValue.blur();
  await expect(page.getByText("R$ 520,00").first()).toBeVisible();
  await shot(page, "fazer-pedido-alimentacao-diaria-1366x768", 1366, 768);

  await discardDraft(page);
  await page.goto(base);
  await page
    .getByLabel("Cálculo de alimentação de Ana Vitória Matos")
    .selectOption("VALOR_MENSAL");
  await page.getByLabel("Valor mensal de Ana Vitória Matos").fill("700,00");
  await page.getByLabel("Valor mensal de Ana Vitória Matos").blur();
  await shot(page, "fazer-pedido-alimentacao-mensal-1366x768", 1366, 768);

  await discardDraft(page);
  await page.goto(`${base.replace("ALIMENTACAO", "TRANSPORTE")}`);
  await expect(page.getByText("Conduções e fornecedores")).toBeVisible();
  await shot(page, "fazer-pedido-transporte-1440x900", 1440, 900);

  mode = "forecast";
  await page.goto(`${base}&evidencia=previsao`);
  await expect(page.getByText(/Previsto:/)).toBeVisible();
  await shot(page, "fazer-pedido-previsao-1366x768", 1366, 768);

  mode = "blocked";
  await page.goto(`${base}&evidencia=impedimento`);
  await expect(page.getByText(/fornecedor inativo/)).toBeVisible();
  await shot(page, "fazer-pedido-impedimento-1366x768", 1366, 768);

  mode = "normal";
  await page.goto(base);
  await page.getByRole("button", { name: "Gerar pedido", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Gerar pedidos e reservas?" }),
  ).toBeVisible();
  await shot(page, "fazer-pedido-confirmacao-1366x768", 1366, 768);

  await page.keyboard.press("Escape");
  await shot(page, "fazer-pedido-mobile-390x844", 390, 844);
  const selectedPerson = page.getByLabel("Incluir Ana Vitória Matos");
  await expect(selectedPerson).toBeChecked();
  await page
    .getByRole("button", { name: /Exibir detalhes de Ana Vitória/ })
    .click();
  await expect(selectedPerson).toBeChecked();
  await shot(page, "fazer-pedido-mobile-expandido-390x844", 390, 844);

  await page.goto(`${base.replace("ALIMENTACAO", "TRANSPORTE")}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: /Exibir detalhes de Ana Vitória/ })
    .click();
  await expect(
    page
      .locator(".ds-data-table__details")
      .getByText("Conduções e fornecedores"),
  ).toBeVisible();
  await shot(page, "fazer-pedido-mobile-transporte-390x844", 390, 844);

  await page.goto(`${base.replace("ALIMENTACAO", "CESTA_BASICA")}`);
  const readonlyTotal = page.getByLabel(
    "Total solicitado de Ana Vitória Matos",
  );
  await expect(readonlyTotal).toBeVisible();
  expect(await readonlyTotal.evaluate((element) => element.tagName)).toBe(
    "OUTPUT",
  );
  await expect(
    page.getByRole("textbox", { name: /Total solicitado de Ana Vitória/ }),
  ).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Buscar pessoa" }).fill("Ana");
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Descartar alterações do pedido?" }),
  ).toHaveCount(0);
});
