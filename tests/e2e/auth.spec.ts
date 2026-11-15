import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("unauthenticated visit redirects to login", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Slate")).toBeVisible();
});

test("wrong passphrase shows an error and stays on login", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("passphrase").fill("nope");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-error")).toContainText("not right");
  await expect(page).toHaveURL(/\/login/);
});

test("passphrase login lands on today and persists across reload", async ({ page, context }) => {
  await login(page, "avery");
  await expect(page).toHaveURL(/\/today/);
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name.includes("authjs.session-token"));
  expect(session).toBeTruthy();
  // A year-long cookie: expires at least 300 days out.
  expect((session!.expires - Date.now() / 1000) / 86400).toBeGreaterThan(300);
  await page.reload();
  await expect(page).toHaveURL(/\/today/);
});

test("coach sees the coach tab and the profile banner", async ({ page }) => {
  await login(page, "morgan");
  await expect(page.getByRole("link", { name: "Coach" })).toBeVisible();
  await expect(page.getByText(/Viewing Avery/)).toBeVisible();
});

test("client does not see the coach tab", async ({ page }) => {
  await login(page, "avery");
  await expect(page.getByRole("link", { name: "Coach" })).toHaveCount(0);
});
