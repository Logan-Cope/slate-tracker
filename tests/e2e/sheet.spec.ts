import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * The bottom sheet as a native modal dialog (review rows 4 and 17): focus moves
 * in when it opens, Escape closes it through React state, and focus goes back
 * to the control that opened it, including when a menu row hands off to a
 * second sheet and when that second sheet is cancelled.
 */

test("the day menu takes focus on open, closes on Escape and hands focus back to its button", async ({ page }) => {
  await login(page);
  await page.goto("/today");
  const menuButton = page.getByTestId("day-menu");
  await menuButton.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // No text field here, so the first row gets focus rather than the dialog itself.
  await expect(page.getByTestId("copy-day")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(menuButton).toBeFocused();
});

test("a menu row that opens the copy sheet carries the menu button along as the place focus returns to", async ({ page }) => {
  await login(page);
  await page.goto("/today");
  const menuButton = page.getByTestId("day-menu");
  await menuButton.click();
  await page.getByTestId("copy-day").click();

  const copy = page.getByRole("dialog", { name: "Copy day to" });
  await expect(copy).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(menuButton).toBeFocused();
});

test("the Close button closes the sheet and returns focus too", async ({ page }) => {
  await login(page);
  await page.goto("/today");
  const menuButton = page.getByTestId("meal-lunch-menu");
  await menuButton.click();
  await expect(page.getByRole("dialog", { name: "Lunch" })).toBeVisible();

  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(menuButton).toBeFocused();
});

test("copying a day onto itself is refused under the date field, with the field focused", async ({ page }) => {
  await login(page);
  await page.goto("/today?date=2026-03-11");
  await page.getByTestId("day-menu").click();
  await page.getByTestId("copy-day").click();

  const date = page.getByTestId("copy-date");
  await date.fill("2026-03-11");
  const confirm = page.getByTestId("copy-confirm");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(date).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("copy-date-error")).toContainText("Pick a day other than");
  await expect(date).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});
