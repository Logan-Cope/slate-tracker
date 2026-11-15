import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Coach adds a restaurant chain from the coach page, reviews the draft, applies
 * it, and the items become searchable for the client. E2E=1 swaps the Claude
 * extractor for a fixed five-item Chipotle menu (lib/restaurants/extractor-for-env.ts).
 */
test.describe.configure({ mode: "serial" });

test("coach finds, reviews and adds the Chipotle menu", async ({ page }) => {
  await login(page, "morgan");
  await page.goto("/coach");
  await expect(page.getByRole("heading", { name: "Restaurants" })).toBeVisible();

  await page.getByTestId("restaurant-name").fill("Chipotle");
  await page.getByTestId("restaurant-find").click();

  await page.waitForURL(/\/coach\/restaurants\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Chipotle" })).toBeVisible();
  await expect(page.getByTestId("draft-items").getByTestId("draft-item")).toHaveCount(5);
  await expect(page.getByTestId("draft-items")).toContainText("Chicken");
  // The alert region is always mounted so a later message announces; a clean draft leaves it empty.
  await expect(page.getByTestId("draft-error")).toBeEmpty();

  await page.getByTestId("draft-apply").click();
  await page.waitForURL(/\/coach$/);
  await expect(page.getByRole("heading", { name: "Restaurants" })).toBeVisible();
  await expect(page.getByTestId("restaurant-row").filter({ hasText: "Chipotle · 5 items" })).toHaveCount(1);
});

test("client can search the added menu", async ({ page }) => {
  await login(page, "avery");
  await page.getByTestId("meal-lunch-add").click();
  await expect(page).toHaveURL(/\/today\/add/);

  const input = page.getByTestId("add-food-search");
  await expect(input).toBeVisible();
  await input.focus();
  await page.keyboard.type("chipotle chicken");

  const tile = page
    .getByTestId("search-results")
    .getByTestId(/^food-tile-\d+$/)
    .filter({ has: page.getByText("Chicken", { exact: true }) })
    .filter({ hasText: "Chipotle" });
  await expect(tile.first()).toBeVisible();
});
