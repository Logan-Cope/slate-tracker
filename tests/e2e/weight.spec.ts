import { expect, test } from "@playwright/test";
import { ActionCounter, login } from "./helpers";

test("logging a weight takes at most 3 actions from the app and shows the trend", async ({ page }) => {
  const counter = new ActionCounter(page);
  await counter.install();
  await login(page, "avery");
  counter.reset();

  await page.getByRole("link", { name: "Weight" }).click();
  await expect(page).toHaveURL(/\/weight/);
  await page.getByTestId("weigh-in-input").fill("131.2");
  await page.getByTestId("weigh-in-save").click();
  await expect(page.getByTestId("weigh-in-saved")).toContainText("131.2");
  expect(counter.total, `actions used: ${counter.taps} taps + ${counter.entries} entries`).toBeLessThanOrEqual(3);

  await expect(page.getByTestId("trend-weight")).toContainText("131.2");
  await expect(page.getByTestId("weight-chart")).toBeVisible();
});

test("a second weigh-in on the same day replaces the first, and delete offers undo", async ({ page }) => {
  await login(page, "avery");
  await page.goto("/weight");
  await page.getByTestId("weigh-in-input").fill("130.8");
  await page.getByTestId("weigh-in-save").click();
  await expect(page.getByTestId("weigh-in-saved")).toContainText("130.8");
  await page.reload();
  const rows = page.locator('[data-testid^="weigh-in-row-"]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("130.8");

  // Delete acts at once; the toast carries Undo and waits for her.
  await rows.first().getByRole("button", { name: /Delete weigh-in/ }).click();
  await expect(rows).toHaveCount(0);
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText("130.8 lb");
  await expect(toast).toContainText("deleted");

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("130.8");

  // Leave the list the way the test found it.
  await rows.first().getByRole("button", { name: /Delete weigh-in/ }).click();
  await expect(rows).toHaveCount(0);
  await toast.getByRole("button", { name: "Dismiss notice" }).click();
  await expect(toast).toBeEmpty();
});

test("tapping the chart shows that day's numbers; the keys and keyboard focus show them and Escape hides them", async ({ page }) => {
  await login(page, "avery");
  await page.goto("/weight");
  await page.getByTestId("weigh-in-input").fill("132.4");
  await page.getByTestId("weigh-in-save").click();
  await expect(page.getByTestId("weigh-in-saved")).toContainText("132.4");

  const chart = page.getByTestId("weight-chart");
  await expect(chart).toBeVisible();
  const box = (await chart.boundingBox())!;
  // The newest day sits at the right edge of the plot.
  await page.touchscreen.tap(box.x + box.width - 12, box.y + box.height / 2);
  const readout = page.getByTestId("weight-chart-readout");
  await expect(readout).toContainText(/trend \d/);
  await expect(readout).toContainText("scale 132.4");

  const slider = page.getByRole("slider", { name: "Weight trend" });
  await slider.focus();
  await page.keyboard.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", /trend .* lb, scale 132\.4 lb$/);
  await page.keyboard.press("Escape");
  await expect(readout).toHaveCount(0);

  // The keys show the day they land on, also when that is the day already selected.
  await page.keyboard.press("End");
  await expect(readout).toContainText("scale 132.4");
  await page.keyboard.press("Escape");
  await expect(readout).toHaveCount(0);

  // Arriving by keyboard shows the slider's day, the one a screen reader reads out.
  await page.keyboard.press("Shift+Tab");
  await expect(slider).not.toBeFocused();
  await page.keyboard.press("Tab");
  await expect(slider).toBeFocused();
  await expect(readout).toContainText("scale 132.4");
  await page.keyboard.press("Escape");
  await expect(readout).toHaveCount(0);

  // Leave the list the way the test found it.
  const rows = page.locator('[data-testid^="weigh-in-row-"]');
  await rows.first().getByRole("button", { name: /Delete weigh-in/ }).click();
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText("132.4 lb");
  await toast.getByRole("button", { name: "Dismiss notice" }).click();
});
