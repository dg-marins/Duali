import { expect, test, type Page } from "@playwright/test";

const unitId = "11111111-1111-4111-8111-111111111111";
const supplierId = "22222222-2222-4222-8222-222222222222";
const personId = "33333333-3333-4333-8333-333333333333";
const linkId = "44444444-4444-4444-8444-444444444444";
const benefitId = "55555555-5555-4555-8555-555555555555";
const configId = "66666666-6666-4666-8666-666666666666";
const competenceId = "77777777-7777-4777-8777-777777777777";
const closingId = "88888888-8888-4888-8888-888888888888";

const unit = { id: unitId, nome: "Unidade Rio de Janeiro", sigla: "URJ" };
const supplier = { id: supplierId, nome: "Fornecedor Mobilidade", ativo: true };
const configuration = {
  id: configId,
  unidadeId: unitId,
  unidade: unit,
  tipo: "ALIMENTACAO",
  fornecedorId: supplierId,
  fornecedor: supplier,
  ativa: true,
  observacoes: "Atendimento corporativo",
};
const launch = {
  id: competenceId,
  beneficioVinculoId: benefitId,
  configuracaoId: configId,
  componente: "Principal",
  competencia: "2026-10-01",
  quantidadeDias: "22.00",
  quantidade: null,
  valorUnitario: "25.50",
  valorInformado: null,
  valorFinal: "561.00",
  status: "PENDENTE",
  observacoes: "Conferir dias úteis",
  beneficioVinculo: {
    id: benefitId,
    tipo: "ALIMENTACAO",
    vinculo: {
      id: linkId,
      pessoaId: personId,
      unidadeId: unitId,
      pessoa: { id: personId, nomeCompleto: "Ana Vitória Matos" },
      unidade: unit,
    },
  },
  configuracao: configuration,
  transporteItens: [],
};

async function stable(page: Page) {
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

test("Lote 6 preserva lançamentos, fechamento e configurações", async ({
  page,
}) => {
  test.setTimeout(180_000);
  let closingStatus = "ABERTA";
  let currentLaunch = { ...launch };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          usuario: { id: "user", nome: "Marina Benefícios" },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/unidades"))
      return route.fulfill({
        json: { items: [unit], total: 1, page: 1, pageSize: 100 },
      });
    if (path.endsWith("/fornecedores"))
      return route.fulfill({
        json: { items: [supplier], total: 1, page: 1, pageSize: 100 },
      });
    if (
      path.endsWith("/configuracoes-beneficios") &&
      request.method() === "GET"
    )
      return route.fulfill({
        json: { items: [configuration], total: 1, page: 1, pageSize: 100 },
      });
    if (
      path.includes("/configuracoes-beneficios/") &&
      request.method() === "PUT"
    )
      return route.fulfill({ json: configuration });
    if (path.endsWith("/configuracoes-beneficios/multiunidade"))
      return route.fulfill({
        status: 201,
        json: { items: [{ id: configId, criada: false, ativa: true }] },
      });
    if (path.endsWith("/beneficios-operacional"))
      return route.fulfill({
        json: { items: [currentLaunch], total: 1, page: 1, pageSize: 25 },
      });
    if (
      path.endsWith(`/competencias/${competenceId}`) &&
      request.method() === "PUT"
    ) {
      currentLaunch = {
        ...currentLaunch,
        status: "PENDENTE",
        ...request.postDataJSON(),
      };
      return route.fulfill({ json: currentLaunch });
    }
    if (path.endsWith(`/competencias/${competenceId}/conferir`)) {
      currentLaunch = { ...currentLaunch, status: "CONFERIDO" };
      return route.fulfill({ json: currentLaunch });
    }
    if (path.endsWith(`/competencias/${competenceId}/cancelar`)) {
      currentLaunch = { ...currentLaunch, status: "CANCELADO" };
      return route.fulfill({ json: currentLaunch });
    }
    if (path.endsWith("/beneficios/fechamentos") && request.method() === "GET")
      return route.fulfill({
        json: [
          {
            id: closingId,
            unidadeId: unitId,
            competencia: "2026-10-01",
            status: closingStatus,
          },
        ],
      });
    if (
      path.endsWith(`/beneficios/fechamentos/${closingId}`) &&
      request.method() === "GET"
    )
      return route.fulfill({
        json: {
          id: closingId,
          unidadeId: unitId,
          unidade: unit,
          competencia: "2026-10-01",
          status: closingStatus,
          pessoasCobertas: 1,
          pendencias: currentLaunch.status === "PENDENTE" ? 1 : 0,
          totais: {
            TRANSPORTE: "0.00",
            ALIMENTACAO: "561.00",
            CESTA_BASICA: "0.00",
            PREMIACAO: "0.00",
            OUTRO: "0.00",
            total: "561.00",
          },
          lancamentos: [currentLaunch],
        },
      });
    if (path.endsWith(`/beneficios/fechamentos/${closingId}/revisar`)) {
      closingStatus = "EM_REVISAO";
      return route.fulfill({ json: { id: closingId, status: closingStatus } });
    }
    if (path.endsWith(`/beneficios/fechamentos/${closingId}/fechar`)) {
      closingStatus = "FECHADA";
      return route.fulfill({ json: { id: closingId, status: closingStatus } });
    }
    if (path.endsWith(`/beneficios/fechamentos/${closingId}/reabrir`)) {
      closingStatus = "ABERTA";
      return route.fulfill({ json: { id: closingId, status: closingStatus } });
    }
    if (path.endsWith("/beneficios/fechamentos") && request.method() === "POST")
      return route.fulfill({
        status: 201,
        json: { id: closingId, status: "ABERTA" },
      });
    if (path.endsWith("/ajustes-beneficios"))
      return route.fulfill({ status: 201, json: { id: "adjustment" } });
    return route.fulfill({
      json: { items: [], total: 0, page: 1, pageSize: 100 },
    });
  });

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/app/beneficios/lancamentos?competencia=2026-10&page=1");
  await expect(
    page.getByRole("heading", { name: "Lançamentos de benefícios" }),
  ).toBeVisible();
  await stable(page);
  await expect(page).toHaveScreenshot(
    "lancamentos-beneficios-desktop-1366x768.png",
    { animations: "disabled" },
  );
  await page.getByLabel("Situação").selectOption("PENDENTE");
  await stable(page);
  await expect(page).toHaveScreenshot(
    "lancamentos-beneficios-filtros-1366x768.png",
    { animations: "disabled" },
  );
  await page.getByRole("button", { name: /Ações do lançamento/ }).click();
  await page.getByRole("menuitem", { name: "Editar lançamento" }).click();
  await expect(
    page.getByRole("dialog", { name: "Editar lançamento mensal" }),
  ).toBeVisible();
  await stable(page);
  await expect(page).toHaveScreenshot(
    "lancamentos-beneficios-edicao-1366x768.png",
    { animations: "disabled" },
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await stable(page);
  await expect(page).toHaveScreenshot(
    "lancamentos-beneficios-mobile-390x844.png",
    { animations: "disabled" },
  );
  await page.locator(".ds-data-table__expand-cell button").click();
  await stable(page);
  await expect(page).toHaveScreenshot(
    "lancamentos-beneficios-mobile-expandido-390x844.png",
    { animations: "disabled" },
  );

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(
    `/app/beneficios/fechamento?unidadeId=${unitId}&competencia=2026-10-01`,
  );
  await expect(
    page.getByRole("heading", { name: "Fechamento de competência" }),
  ).toBeVisible();
  await expect(page.getByText("ABERTA")).toBeVisible();
  await stable(page);
  await expect(page).toHaveScreenshot(
    "fechamento-beneficios-aberto-1366x768.png",
    { animations: "disabled" },
  );
  await page.getByRole("button", { name: "Iniciar revisão" }).click();
  await expect(page.getByText("EM REVISÃO")).toBeVisible();
  await stable(page);
  await expect(page).toHaveScreenshot(
    "fechamento-beneficios-revisao-1366x768.png",
    { animations: "disabled" },
  );
  await page.getByRole("button", { name: "Registrar ajuste" }).click();
  await stable(page);
  await expect(page).toHaveScreenshot(
    "fechamento-beneficios-ajuste-1366x768.png",
    { animations: "disabled" },
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Fechar competência" }).click();
  await expect(page.getByText("FECHADA")).toBeVisible();
  await stable(page);
  await expect(page).toHaveScreenshot(
    "fechamento-beneficios-fechado-1366x768.png",
    { animations: "disabled" },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
    timeout: 7000,
  });
  await stable(page);
  await expect(page).toHaveScreenshot(
    "fechamento-beneficios-mobile-390x844.png",
    { animations: "disabled" },
  );

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/app/cadastros/configuracoes-beneficios");
  await expect(
    page.getByRole("heading", { name: "Benefícios", exact: true }),
  ).toBeVisible();
  await stable(page);
  await expect(page).toHaveScreenshot(
    "cadastro-beneficios-desktop-1366x768.png",
    { animations: "disabled" },
  );
  await page.getByRole("button", { name: "+ Associar benefício" }).click();
  await stable(page);
  await expect(page).toHaveScreenshot(
    "cadastro-beneficios-associacao-1366x768.png",
    { animations: "disabled" },
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Editar associação" }).click();
  await stable(page);
  await expect(page).toHaveScreenshot(
    "cadastro-beneficios-edicao-1366x768.png",
    { animations: "disabled" },
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await stable(page);
  await expect(page).toHaveScreenshot(
    "cadastro-beneficios-mobile-390x844.png",
    { animations: "disabled" },
  );

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
