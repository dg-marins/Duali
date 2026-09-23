import { expect, test, type Page } from "@playwright/test";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";

const email = "appshell@example.test";
const password = "DualiAppShell!2026";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}

async function settle(page: Page) {
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test("AppShell desktop, collapsed, flyout e drawer mobile", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });

  try {
    await db.usuario.upsert({
      where: { email },
      update: {
        nome: "Marina AppShell",
        senhaHash: await argon2.hash(password),
        ativo: true,
      },
      create: {
        nome: "Marina AppShell",
        email,
        senhaHash: await argon2.hash(password),
      },
    });
    await db.pessoa.upsert({
      where: { cpf: "00000000001" },
      update: {
        nomeCompleto: "Pessoa Visual AppShell",
        email: "pessoa.appshell@example.test",
        ativa: true,
      },
      create: {
        nomeCompleto: "Pessoa Visual AppShell",
        cpf: "00000000001",
        email: "pessoa.appshell@example.test",
      },
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto("/app/pessoas?q=Pessoa%20Visual%20AppShell");
    await settle(page);
    await expect(page.getByText("1 pessoas encontradas")).toBeVisible();

    const desktopSidebar = page.locator(".app-shell > .app-sidebar");
    await expect(desktopSidebar).toHaveCSS("width", "248px");
    await expect(page.locator(".app-topbar")).toHaveCSS("height", "60px");
    await expect(
      desktopSidebar.getByRole("button", { name: "Pessoas", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveScreenshot(
      "appshell-desktop-expanded-1440x900.png",
      { animations: "disabled" },
    );

    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(page).toHaveScreenshot(
      "appshell-desktop-expanded-1366x768.png",
      { animations: "disabled" },
    );
    const activePeople = desktopSidebar.getByRole("button", {
      name: "Pessoas",
      exact: true,
    });
    await activePeople.focus();
    await expect(activePeople).toHaveCSS("outline-style", "solid");

    await page.getByRole("button", { name: "Recolher menu" }).click();
    await expect(page.locator(".app-shell")).toHaveClass(/is-collapsed/);
    await expect(desktopSidebar).toHaveCSS("width", "72px");
    await activePeople.hover();
    await expect(page.getByRole("tooltip", { name: "Pessoas" })).toBeVisible();
    await page.mouse.move(700, 30);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip", { name: "Pessoas" })).toBeHidden();
    await expect(page).toHaveScreenshot(
      "appshell-desktop-collapsed-1366x768.png",
      { animations: "disabled" },
    );

    const registry = desktopSidebar.getByRole("button", {
      name: "Cadastros",
      exact: true,
    });
    await registry.focus();
    await page.keyboard.press("Enter");
    const flyout = page.locator(".app-sidebar-flyout");
    await expect(flyout).toBeVisible();
    await expect(flyout).toHaveCSS("z-index", "100");
    await expect(page).toHaveScreenshot(
      "appshell-desktop-collapsed-flyout-1366x768.png",
      { animations: "disabled" },
    );
    await page.keyboard.press("Escape");
    await expect(flyout).toHaveCount(0);
    await expect(registry).toBeFocused();

    await page.getByRole("button", { name: "Expandir menu" }).click();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    const operation = desktopSidebar.getByRole("button", {
      name: "Operação",
      exact: true,
    });
    await operation.click();
    await expect(operation).toHaveAttribute("aria-expanded", "true");
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await expect(page).toHaveScreenshot(
      "appshell-desktop-low-height-1280x720.png",
      { animations: "disabled" },
    );
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    const accountBox = await desktopSidebar
      .locator(".app-sidebar-account")
      .boundingBox();
    expect(accountBox && accountBox.y + accountBox.height).toBeLessThanOrEqual(
      720,
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await expect(desktopSidebar).toBeHidden();
    await expect(page).toHaveScreenshot("appshell-mobile-closed-390x844.png", {
      animations: "disabled",
    });

    const menuButton = page.getByRole("button", { name: "Abrir menu" });
    await menuButton.click();
    const drawer = page.getByRole("dialog", { name: "Navegação principal" });
    await expect(drawer).toBeVisible();
    await expect(page).toHaveScreenshot("appshell-mobile-open-390x844.png", {
      animations: "disabled",
    });
    await page.keyboard.press("Shift+Tab");
    expect(
      await drawer.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(menuButton).toBeFocused();
  } finally {
    await db.$disconnect();
  }
});
