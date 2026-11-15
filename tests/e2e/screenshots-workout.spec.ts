import { test } from "@playwright/test";
import { login } from "./helpers";

/** Visual review of the gym screen: start Total Body A, complete a set, screenshot. */
test.skip(!process.env.SCREENSHOTS, "screenshots only on demand");

test("08-active-workout", async ({ page }) => {
  await login(page, "avery");
  await page.goto("/train");
  await page.getByTestId("up-next").getByRole("button", { name: /Start/ }).click();
  await page.waitForURL(/\/train\/workout\//);
  const firstCheck = page.locator('[data-testid^="set-"][data-testid$="-check"]').first();
  await firstCheck.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "test-results/screens/08-active-workout.png", fullPage: true });
  await page.goto("/settings");
  await page.getByTestId("theme-dark").click();
  await page.goto("/today");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/screens/09-today-dark.png", fullPage: false });
});
