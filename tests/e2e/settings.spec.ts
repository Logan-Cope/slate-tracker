import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("theme choice applies immediately, persists across reload, and System clears it", async ({ page }) => {
  await login(page, "avery");
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings/);

  await page.getByTestId("theme-dark").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bgDark = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  expect(bgDark).toBe("#0f0e0d");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByTestId("theme-dark")).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("theme-light").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const bgLight = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  expect(bgLight).toBe("#faf7f2");

  await page.getByTestId("theme-system").click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
});

test("Light overrides a dark system preference; System follows it", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark", ...{} });
  const page = await context.newPage();
  await login(page, "avery");
  await page.goto("/settings");
  const read = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  expect(await read()).toBe("#0f0e0d");
  await page.getByTestId("theme-light").click();
  expect(await read()).toBe("#faf7f2");
  await page.getByTestId("theme-system").click();
  expect(await read()).toBe("#0f0e0d");
  await context.close();
});

test("sign out from settings returns to login and ends the session", async ({ page }) => {
  await login(page, "avery");
  await page.goto("/settings");
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
});
