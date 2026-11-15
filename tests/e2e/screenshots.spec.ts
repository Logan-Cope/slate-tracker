import { test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Not a test: captures iPhone-sized screenshots of the main screens for a
 * visual review. Run with SCREENSHOTS=1 npx playwright test tests/e2e/screenshots.spec.ts
 */
test.skip(!process.env.SCREENSHOTS, "screenshots only on demand");

const shots = [
  { name: "01-login", path: "/login", auth: false },
  { name: "02-today", path: "/today", auth: true },
  { name: "03-add-food", path: "/today/add?meal=lunch", auth: true },
  { name: "04-train", path: "/train", auth: true },
  { name: "05-weight", path: "/weight", auth: true },
  { name: "06-coach", path: "/coach", auth: true, as: "morgan" as const },
  { name: "07-programs", path: "/coach/programs", auth: true, as: "morgan" as const },
];

for (const shot of shots) {
  test(shot.name, async ({ page }) => {
    if (shot.auth) await login(page, shot.as ?? "avery");
    await page.goto(shot.path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `test-results/screens/${shot.name}.png`, fullPage: true });
  });
}

/**
 * Scenes for diary edit mode and the coach view, in both themes. Each scene builds its own
 * state on its own date so the shots are repeatable.
 */

async function addFood(page: import("@playwright/test").Page, date: string, meal: string, query: string, name: string) {
  await page.goto(`/today/add?date=${date}&meal=${meal}`);
  const input = page.getByTestId("add-food-search");
  await input.focus();
  await page.keyboard.type(query);
  const done = page.waitForResponse((r) => r.request().method() === "POST" && r.ok(), { timeout: 20_000 });
  await page.getByTestId("search-results").getByRole("button", { name: `Add ${name}`, exact: true }).click();
  await done;
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`scenes ${theme}`, () => {
    test.use({ colorScheme: theme });
    const shot = (page: import("@playwright/test").Page, name: string) =>
      page.screenshot({ path: `test-results/screens/${name}-${theme}.png`, fullPage: true, animations: "disabled" });

    test("settings", async ({ page }) => {
      await login(page, "avery");
      await page.goto("/settings");
      await page.waitForLoadState("networkidle");
      await shot(page, "10-settings");
    });

    test("diary edit mode", async ({ page }) => {
      await login(page, "avery");
      const date = theme === "light" ? "2026-04-01" : "2026-04-02";
      await addFood(page, date, "breakfast", "chobani", "Greek Yogurt, Plain, Nonfat");
      await addFood(page, date, "lunch", "100g chicken", "Chicken breast, cooked, roasted");
      await addFood(page, date, "lunch", "quest", "Protein Bar, Cookies and Cream");
      await page.goto(`/today?date=${date}`);
      await page.waitForLoadState("networkidle");
      await shot(page, "20-diary-with-edit");
      await page.getByTestId("diary-edit").click();
      await shot(page, "21-edit-nothing-selected");
      await page.getByTestId("meal-lunch-select").click();
      await shot(page, "22-edit-lunch-selected");
      await page.getByRole("checkbox", { name: /Protein Bar/ }).click();
      await shot(page, "23-edit-partial");
      await page.getByTestId("edit-copy").click();
      await page.getByTestId("copy-sheet").waitFor();
      await shot(page, "24-edit-copy-sheet");
    });

    test("coach", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await login(page, "morgan");
      await page.goto("/coach");
      await page.waitForLoadState("networkidle");
      await shot(page, "30-coach");
      if (errors.length > 0) throw new Error(`console errors on the coach pages:\n${errors.join("\n")}`);
    });
  });
}
