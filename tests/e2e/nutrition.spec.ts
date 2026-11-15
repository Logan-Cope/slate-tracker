import { expect, test, type Page } from "@playwright/test";
import { ActionCounter, login } from "./helpers";
import { code128Modules } from "../unit/helpers/barcode-image";

/**
 * Nutrition flows and the tap budgets from the spec. Each test logs into its
 * own calendar date so the tests do not depend on each other's rows.
 */

const CHICKEN = "Chicken breast, cooked, roasted";
const CHOBANI = "Greek Yogurt, Plain, Nonfat";
const QUEST = "Protein Bar, Cookies and Cream";

function kcalOf(text: string | null): number {
  return Number((text ?? "").replace(/[^\d-]/g, ""));
}

/** Server actions POST back to the page. Await one so the write is persisted before navigating. */
function actionDone(page: Page) {
  return page.waitForResponse((r) => r.request().method() === "POST" && r.ok(), { timeout: 20_000 });
}

/** Focus is free (neither a tap nor a keystroke); the keyboard is already up on a phone. */
async function typeSearch(page: Page, text: string) {
  const input = page.getByTestId("add-food-search");
  await expect(input).toBeVisible();
  await input.focus();
  await page.keyboard.type(text);
}

async function addViaSearch(page: Page, query: string, foodName: string) {
  await typeSearch(page, query);
  const done = actionDone(page);
  await page.getByTestId("search-results").getByRole("button", { name: `Add ${foodName}`, exact: true }).click();
  await done;
}

test("a. log 150g chicken via search and + within 10 actions; diary shows 248 kcal and the ring moves", async ({ page }) => {
  const counter = new ActionCounter(page);
  await counter.install();
  await login(page);
  const before = kcalOf(await page.getByTestId("kcal-left").textContent());
  counter.reset();

  await page.getByTestId("meal-lunch-add").click();
  await expect(page).toHaveURL(/\/today\/add\?/);
  await typeSearch(page, "150g chicken");
  const done = actionDone(page);
  await page.getByTestId("search-results").getByRole("button", { name: `Add ${CHICKEN}`, exact: true }).click();
  await expect(page.getByTestId("toast")).toContainText("248 cal");
  await done;

  expect(counter.total).toBeLessThanOrEqual(10);

  await page.goto("/today");
  const lunch = page.getByTestId("meal-lunch-entries");
  await expect(lunch).toContainText(CHICKEN);
  await expect(lunch).toContainText("150 g");
  await expect(lunch.getByRole("button", { name: /Chicken breast/ }).first()).toContainText("248");
  const after = kcalOf(await page.getByTestId("kcal-left").textContent());
  // 247.5 kcal: the entry rounds up to 248, "left" rounds the remaining total, so the two can differ by 1.
  expect(before - after).toBeGreaterThanOrEqual(247);
  expect(before - after).toBeLessThanOrEqual(248);
});

test("b. three go-tos log with three + taps (within 6 actions)", async ({ page }) => {
  const counter = new ActionCounter(page);
  await counter.install();
  await login(page);
  const date = "2026-03-30";

  await page.goto(`/today/add?date=${date}&meal=lunch`);
  await addViaSearch(page, "chicken", CHICKEN);
  await addViaSearch(page, "chobani", CHOBANI);
  await addViaSearch(page, "quest", QUEST);

  await page.goto(`/today/add?date=${date}&meal=dinner`);
  const goTos = page.getByTestId("go-tos");
  await expect(goTos).toBeVisible();
  counter.reset();

  for (const name of [CHICKEN, CHOBANI, QUEST]) {
    const done = actionDone(page);
    await goTos.getByRole("button", { name: `Add ${name}`, exact: true }).click();
    await done;
  }
  expect(counter.total).toBeLessThanOrEqual(6);

  await page.goto(`/today?date=${date}`);
  await expect(page.getByTestId("meal-dinner-entries").getByRole("button")).toHaveCount(3);
});

test("c. quick add 200 kcal / 10 g protein within 4 actions", async ({ page }) => {
  const counter = new ActionCounter(page);
  await counter.install();
  await login(page);
  const date = "2026-03-25";

  await page.goto(`/today/add?date=${date}&meal=snacks`);
  await expect(page.getByTestId("add-food-search")).toBeVisible();
  counter.reset();

  await page.getByTestId("quick-add").click();
  await page.getByTestId("quick-add-kcal").focus();
  await page.keyboard.type("200");
  await page.getByTestId("quick-add-protein").focus();
  await page.keyboard.type("10");
  const done = actionDone(page);
  await page.getByTestId("quick-add-submit").click();
  await expect(page.getByTestId("toast")).toContainText("200 cal");
  await done;
  expect(counter.total).toBeLessThanOrEqual(4);

  await page.goto(`/today?date=${date}`);
  const snacks = page.getByTestId("meal-snacks-entries");
  await expect(snacks).toContainText("Quick add");
  await expect(snacks).toContainText("200");
  await expect(snacks).toContainText("10 g");
});

test("c2. quick add with nothing typed says so under Calories, stays open, and submits once an amount is in", async ({ page }) => {
  await login(page);
  const date = "2026-03-26";

  await page.goto(`/today/add?date=${date}&meal=snacks`);
  await page.getByTestId("quick-add").click();
  const kcal = page.getByTestId("quick-add-kcal");
  await expect(kcal).toBeVisible();
  const submit = page.getByTestId("quick-add-submit");
  await expect(submit).toBeEnabled();

  await submit.click();
  await expect(kcal).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("quick-add-kcal-error")).toHaveText("Enter an amount above 0");
  await expect(kcal).toBeFocused();
  await expect(page.getByTestId("quick-add-protein-error")).toBeEmpty();

  // The error clears as soon as the field is right, without another submit.
  await kcal.fill("150");
  await expect(kcal).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("quick-add-kcal-error")).toBeEmpty();

  const done = actionDone(page);
  await submit.click();
  await expect(page.getByTestId("toast")).toContainText("150 cal");
  await done;

  await page.goto(`/today?date=${date}`);
  await expect(page.getByTestId("meal-snacks-entries")).toContainText("150");
});

test("d. editing an entry's amount in the sheet changes its kcal", async ({ page }) => {
  await login(page);
  const date = "2026-03-03";

  await page.goto(`/today/add?date=${date}&meal=dinner`);
  await addViaSearch(page, "100g chicken", CHICKEN);

  await page.goto(`/today?date=${date}`);
  const row = page.getByTestId("meal-dinner-entries").getByRole("button", { name: /Chicken breast/ }).first();
  await expect(row).toContainText("165");
  await row.click();
  await expect(page.getByTestId("entry-sheet")).toBeVisible();
  await page.getByTestId("sheet-amount").fill("200");
  await expect(page.getByTestId("sheet-preview")).toContainText("330");

  const done = actionDone(page);
  await page.getByTestId("sheet-save").click();
  await done;
  await expect(row).toContainText("330");

  await page.reload();
  await expect(page.getByTestId("meal-dinner-entries").getByRole("button", { name: /Chicken breast/ }).first()).toContainText("330");
});

test("e. deleting an entry removes it", async ({ page }) => {
  await login(page);
  const date = "2026-03-05";

  await page.goto(`/today/add?date=${date}&meal=breakfast`);
  await addViaSearch(page, "chobani", CHOBANI);

  await page.goto(`/today?date=${date}`);
  const breakfast = page.getByTestId("meal-breakfast-entries");
  await expect(breakfast).toContainText(CHOBANI);
  await breakfast.getByRole("button", { name: /Greek Yogurt/ }).first().click();

  const done = actionDone(page);
  await page.getByTestId("sheet-delete").click();
  await done;
  await expect(page.getByTestId("meal-breakfast").getByText(CHOBANI)).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("meal-breakfast").getByText(CHOBANI)).toHaveCount(0);
});

test("f. copy yesterday's breakfast", async ({ page }) => {
  await login(page);
  const yesterday = "2026-03-10";
  const date = "2026-03-11";

  await page.goto(`/today/add?date=${yesterday}&meal=breakfast`);
  await addViaSearch(page, "chobani", CHOBANI);

  await page.goto(`/today?date=${date}`);
  const copy = page.getByTestId("meal-breakfast-copy-yesterday");
  await expect(copy).toBeVisible();
  const done = actionDone(page);
  await copy.click();
  await done;

  const breakfast = page.getByTestId("meal-breakfast-entries");
  await expect(breakfast).toContainText(CHOBANI);
  await expect(breakfast).toContainText("80");
  await expect(copy).toHaveCount(0);
});

test("g. create a custom food and log it", async ({ page }) => {
  await login(page);
  const date = "2026-03-20";
  const name = "Avery Protein Pancakes";

  await page.goto(`/today/add?date=${date}&meal=dinner`);
  await page.getByTestId("new-food").click();
  await expect(page).toHaveURL(/\/today\/foods\/new/);

  await page.getByTestId("food-name").fill(name);
  await page.getByTestId("food-serving-label").fill("2 pancakes");
  await page.getByTestId("food-serving-grams").fill("120");
  await page.getByTestId("food-kcal").fill("320");
  await page.getByTestId("food-protein").fill("28");
  await page.getByTestId("food-carbs").fill("40");
  await page.getByTestId("food-fat").fill("6");
  await page.getByTestId("food-form-submit").click();

  await expect(page).toHaveURL(/\/today\/add\?.*food=\d+/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const detail = page.getByTestId("food-detail");
  await expect(detail).toBeVisible();
  await expect(page.getByTestId("food-detail-macros")).toContainText("320");

  const done = actionDone(page);
  await page.getByTestId("food-detail-add").click();
  await expect(page.getByTestId("toast")).toContainText("320 cal");
  await done;

  await page.goto(`/today?date=${date}`);
  const dinner = page.getByTestId("meal-dinner-entries");
  await expect(dinner).toContainText(name);
  await expect(dinner).toContainText("2 pancakes");
  await expect(dinner).toContainText("320");

  // The new food also shows under My foods with an Edit link from its detail sheet.
  await page.goto(`/today/add?date=${date}&meal=dinner`);
  await expect(page.getByTestId("my-foods")).toContainText(name);
});

test("h. barcode manual entry opens the Quest bar detail", async ({ page }) => {
  // Deny the camera explicitly so the fake camera (which would decode the Quest bar on its own) cannot race the typed code.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await login(page);
  await page.goto("/today/add?meal=snacks");
  await page.getByTestId("scan").click();
  await expect(page.getByTestId("scan-sheet")).toBeVisible();
  await expect(page.getByTestId("scan-no-camera")).toContainText("Camera access is off");

  await page.getByTestId("scan-manual").fill("888849000012");
  await page.getByTestId("scan-manual-submit").click();

  await expect(page.getByRole("heading", { name: QUEST })).toBeVisible();
  await expect(page.getByTestId("food-detail")).toBeVisible();
  await expect(page.getByTestId("food-detail-macros")).toContainText("190");
  await expect(page.getByTestId("food-detail-add")).toHaveText("Add to Snacks");
});

test.describe("camera", () => {
  test.use({ permissions: ["camera"] });

  test("h2. the camera decodes a barcode from the video stream and opens the detail", async ({ page }) => {
    // Chromium's fake camera (playwright.config.ts) plays a 1280x720 frame of the Quest bar's EAN-13 at 3 px per bar,
    // turned 45 degrees, which only the scanner's rotated pass can read.
    await login(page);
    await page.goto("/today/add?meal=snacks");
    await page.getByTestId("scan").click();
    await expect(page.getByTestId("scan-sheet")).toBeVisible();

    await expect(page.getByRole("heading", { name: QUEST })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("food-detail-macros")).toContainText("190");
  });

  test("h3. an Amazon Code 128 sticker says Invalid barcode with no lookup, and Create custom food opens an empty form", async ({ page }) => {
    // A canvas camera replaces the fake one: the FNSKU sticker from issue 9, 4 px per bar.
    const modules = code128Modules("X0043HVMNB");
    await page.addInitScript((bars: boolean[]) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d")!;
      const px = 4;
      const left = Math.round((canvas.width - bars.length * px) / 2);
      const draw = () => {
        ctx.fillStyle = "#e6e6e6";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#191919";
        bars.forEach((bar, i) => {
          if (bar) ctx.fillRect(left + i * px, 260, px, 200);
        });
      };
      draw();
      setInterval(draw, 100);
      const stream = canvas.captureStream(30);
      navigator.mediaDevices.getUserMedia = () => Promise.resolve(stream);
    }, modules);
    const lookups: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/barcode/")) lookups.push(r.url());
    });

    await login(page);
    await page.goto("/today/add?meal=snacks");
    await page.getByTestId("scan").click();
    await expect(page.getByTestId("scan-sheet")).toBeVisible();

    await expect(page.getByTestId("scan-invalid")).toContainText("Invalid barcode.", { timeout: 5_000 });
    expect(lookups).toEqual([]);

    await page.getByTestId("scan-invalid-create").click();
    await expect(page).toHaveURL(/\/today\/foods\/new\?/);
    expect(page.url()).not.toContain("upc=");
    await expect(page.getByTestId("food-upc")).toHaveValue("");
  });
});

/** What the E2E label reader returns for any photo (FAKE_LABEL in lib/nutrition/label-reader-for-env.ts). */
async function expectFakeLabel(page: Page) {
  await expect(page.getByTestId("food-kcal")).toHaveValue("70");
  await expect(page.getByTestId("food-name")).toHaveValue("Peach Cups");
  await expect(page.getByTestId("food-serving-label")).toHaveValue("1 cup");
  await expect(page.getByTestId("food-serving-grams")).toHaveValue("113");
  await expect(page.getByTestId("food-protein")).toHaveValue("0");
  await expect(page.getByTestId("food-carbs")).toHaveValue("17");
  await expect(page.getByTestId("food-fat")).toHaveValue("0");
  await expect(page.getByTestId("food-fiber")).toHaveValue("1");
}

test.describe("label camera", () => {
  test.use({ permissions: ["camera"] });

  test("k1. New food, Scan label, shutter: the label fills the form and Save adds the food", async ({ page }) => {
    await login(page);
    await page.goto("/today/foods/new?date=2026-03-09&meal=snacks");
    await page.getByTestId("food-scan-label").click();
    await expect(page.getByTestId("label-sheet")).toBeVisible();
    await expect(page.getByTestId("label-shutter")).toBeEnabled({ timeout: 10_000 });

    const answered = page.waitForResponse((r) => r.url().endsWith("/api/foods/label") && r.request().method() === "POST");
    await page.getByTestId("label-shutter").click();
    const res = await answered;
    // The route sniffs the bytes and answers 415 to anything but a photo, so 200 means a real JPEG went up.
    expect(res.request().headers()["content-type"]).toBe("image/jpeg");
    expect(res.status()).toBe(200);

    await expect(page.getByTestId("label-sheet")).toBeHidden();
    await expectFakeLabel(page);
    await page.getByTestId("food-form-submit").click();
    await expect(page).toHaveURL(/\/today\/add\?.*food=\d+/);
    await expect(page.getByTestId("food-detail-macros")).toContainText("70");
  });

  test("k4. a double tap on the shutter reads one photo", async ({ page }) => {
    let posts = 0;
    await page.route("**/api/foods/label", async (route) => {
      posts++;
      await route.continue();
    });
    await login(page);
    await page.goto("/today/foods/new?date=2026-03-09&meal=snacks&label=1");
    await expect(page.getByTestId("label-shutter")).toBeEnabled({ timeout: 10_000 });
    await page.getByTestId("label-shutter").dblclick();
    await expect(page.getByTestId("label-sheet")).toBeHidden();
    await expectFakeLabel(page);
    expect(posts).toBe(1);
  });

  test("k5. closing the sheet while a read is out leaves the form as she left it", async ({ page }) => {
    await page.route("**/api/foods/label", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue().catch(() => {});
    });
    await login(page);
    await page.goto("/today/foods/new?date=2026-03-09&meal=snacks&label=1");
    await expect(page.getByTestId("label-shutter")).toBeEnabled({ timeout: 10_000 });
    await page.getByTestId("label-shutter").click();
    await expect(page.getByTestId("label-reading")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("label-sheet")).toBeHidden();
    await page.getByTestId("food-name").fill("Kodiak cups");
    await page.waitForTimeout(2500);
    await expect(page.getByTestId("food-name")).toHaveValue("Kodiak cups");
    await expect(page.getByTestId("food-kcal")).toHaveValue("");
  });
});

test("k2. a barcode with no match: Scan label, Choose photo with the camera off, and the next scan finds the food", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  const code = "0850001234567";
  // Open Food Facts has no record of this code; stub only the first lookup, the second must hit the saved food.
  let stubbed = false;
  await page.route(`**/api/barcode/${code}`, async (route) => {
    if (stubbed) return route.continue();
    stubbed = true;
    await route.fulfill({ status: 404, json: { error: "No match. Add it as a custom food." } });
  });

  await login(page);
  await page.goto("/today/add?date=2026-03-09&meal=snacks");
  await page.getByTestId("scan").click();
  await page.getByTestId("scan-manual").fill(code);
  await page.getByTestId("scan-manual-submit").click();
  await expect(page.getByTestId("scan-not-found")).toBeVisible();

  await page.getByTestId("scan-label").click();
  await expect(page).toHaveURL(new RegExp(`/today/foods/new\\?upc=${code}&.*label=1`));
  await expect(page.getByTestId("label-sheet")).toBeVisible();
  await page.getByTestId("label-file").setInputFiles("evals/labels/syn-01-oat-clusters.jpg");

  await expect(page.getByTestId("label-sheet")).toBeHidden();
  await expectFakeLabel(page);
  await expect(page.getByTestId("food-upc")).toHaveValue(code);
  await page.getByTestId("food-form-submit").click();
  await expect(page).toHaveURL(/\/today\/add\?.*food=\d+/);

  await page.goto("/today/add?date=2026-03-09&meal=snacks");
  await page.getByTestId("scan").click();
  await page.getByTestId("scan-manual").fill(code);
  await page.getByTestId("scan-manual-submit").click();
  await expect(page.getByRole("heading", { name: "Peach Cups" })).toBeVisible();
});

test("k3. a label the reader cannot read says so and offers another photo", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.route("**/api/foods/label", (route) => route.fulfill({ status: 422, json: { error: "Could not read the label." } }));
  await login(page);
  await page.goto("/today/foods/new?date=2026-03-09&meal=snacks&label=1");
  await page.getByTestId("label-file").setInputFiles("evals/labels/syn-12-chips-low-quality.jpg");
  await expect(page.getByTestId("label-failed")).toContainText("Could not read the label.");
  await expect(page.getByTestId("label-retry")).toHaveCount(0);
  await expect(page.getByTestId("label-choose")).toBeVisible();
  await expect(page.getByTestId("food-kcal")).toHaveValue("");
});

test("i. undo after delete brings the entry back with the same amount, and it survives a reload", async ({ page }) => {
  await login(page);
  const date = "2026-03-06";

  await page.goto(`/today/add?date=${date}&meal=lunch`);
  await addViaSearch(page, "100g chicken", CHICKEN);

  await page.goto(`/today?date=${date}`);
  const lunch = page.getByTestId("meal-lunch-entries");
  await expect(lunch).toContainText(CHICKEN);
  await lunch.getByRole("button", { name: /Chicken breast/ }).first().click();

  const deleted = actionDone(page);
  await page.getByTestId("sheet-delete").click();
  await deleted;
  await expect(page.getByTestId("meal-lunch").getByText(CHICKEN)).toHaveCount(0);

  // The toast carries an action, so it waits until she taps it or dismisses it.
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText("Deleted");
  const restored = actionDone(page);
  await toast.getByRole("button", { name: "Undo" }).click();
  await restored;
  await expect(lunch).toContainText(CHICKEN);
  await expect(lunch).toContainText("100 g");
  await expect(lunch.getByRole("button", { name: /Chicken breast/ }).first()).toContainText("165");

  await page.reload();
  const after = page.getByTestId("meal-lunch-entries");
  await expect(after).toContainText(CHICKEN);
  await expect(after).toContainText("100 g");
  await expect(after.getByRole("button", { name: /Chicken breast/ }).first()).toContainText("165");
});

test("j. Edit, tap Lunch, Delete clears a 3-item lunch within 3 taps; Undo puts all three back and they survive a reload", async ({ page }) => {
  const counter = new ActionCounter(page);
  await counter.install();
  await login(page);
  const date = "2026-03-07";

  await page.goto(`/today/add?date=${date}&meal=lunch`);
  await addViaSearch(page, "100g chicken", CHICKEN);
  await addViaSearch(page, "chobani", CHOBANI);
  await addViaSearch(page, "quest", QUEST);

  await page.goto(`/today?date=${date}`);
  const lunch = page.getByTestId("meal-lunch-entries");
  await expect(lunch.getByRole("button")).toHaveCount(3);
  counter.reset();

  await page.getByTestId("diary-edit").click();
  await page.getByTestId("meal-lunch-select").click();
  await expect(page.getByTestId("selected-count")).toHaveText("3 selected");
  const deleted = actionDone(page);
  await page.getByTestId("edit-delete").click();
  await deleted;
  expect(counter.total).toBeLessThanOrEqual(3);

  await expect(page.getByTestId("meal-lunch-entries")).toHaveCount(0);
  await expect(page.getByTestId("edit-bar")).toHaveCount(0);

  // The toast carries Undo, so it waits. Undo fires one action per entry: count the POSTs instead of awaiting one.
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText("Deleted 3 items");
  let posts = 0;
  page.on("response", (r) => {
    if (r.request().method() === "POST" && r.ok()) posts++;
  });
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => posts, { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
  for (const name of [CHICKEN, CHOBANI, QUEST]) await expect(lunch).toContainText(name);

  await page.reload();
  const after = page.getByTestId("meal-lunch-entries");
  for (const name of [CHICKEN, CHOBANI, QUEST]) await expect(after).toContainText(name);
  await expect(after.getByRole("button")).toHaveCount(3);
});

test("k. Edit, pick two items across meals, Copy to, confirm copies them to tomorrow within 5 taps", async ({ page }) => {
  const counter = new ActionCounter(page);
  await counter.install();
  await login(page);
  const date = "2026-03-08";
  const tomorrow = "2026-03-09";

  await page.goto(`/today/add?date=${date}&meal=breakfast`);
  await addViaSearch(page, "chobani", CHOBANI);
  await page.goto(`/today/add?date=${date}&meal=dinner`);
  await addViaSearch(page, "100g chicken", CHICKEN);

  await page.goto(`/today?date=${date}`);
  await expect(page.getByTestId("meal-dinner-entries")).toContainText(CHICKEN);
  counter.reset();

  await page.getByTestId("diary-edit").click();
  await page.getByRole("checkbox", { name: /Greek Yogurt/ }).click();
  await page.getByRole("checkbox", { name: /Chicken breast/ }).click();
  await expect(page.getByTestId("selected-count")).toHaveText("2 selected");
  await page.getByTestId("edit-copy").click();
  const confirm = page.getByTestId("copy-confirm");
  await expect(confirm).toBeVisible();
  const copied = actionDone(page);
  await confirm.click();
  await copied;
  expect(counter.total).toBeLessThanOrEqual(5);
  await expect(page.getByTestId("toast")).toContainText("Copied to");
  await expect(page.getByTestId("edit-bar")).toHaveCount(0);

  await page.goto(`/today?date=${tomorrow}`);
  await expect(page.getByTestId("meal-breakfast-entries")).toContainText(CHOBANI);
  await expect(page.getByTestId("meal-dinner-entries")).toContainText(CHICKEN);

  await page.goto(`/today?date=${date}`);
  await expect(page.getByTestId("meal-breakfast-entries")).toContainText(CHOBANI);
  await expect(page.getByTestId("meal-dinner-entries")).toContainText(CHICKEN);
});

test("l. Select all, Deselect all and Done leave the diary unchanged", async ({ page }) => {
  await login(page);
  const date = "2026-03-13";

  await page.goto(`/today/add?date=${date}&meal=breakfast`);
  await addViaSearch(page, "chobani", CHOBANI);
  await page.goto(`/today/add?date=${date}&meal=snacks`);
  await addViaSearch(page, "quest", QUEST);

  await page.goto(`/today?date=${date}`);
  await expect(page.getByTestId("meal-snacks-entries")).toContainText(QUEST);
  await page.getByTestId("diary-edit").click();
  const yogurt = page.getByRole("checkbox", { name: /Greek Yogurt/ });
  const bar = page.getByRole("checkbox", { name: /Protein Bar/ });
  await expect(yogurt).toHaveAttribute("aria-checked", "false");
  await expect(bar).toHaveAttribute("aria-checked", "false");
  const selectAll = page.getByTestId("select-all");
  await expect(selectAll).toHaveText("Select all");

  await selectAll.click();
  await expect(yogurt).toHaveAttribute("aria-checked", "true");
  await expect(bar).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("selected-count")).toHaveText("2 selected");
  await expect(selectAll).toHaveText("Deselect all");

  await selectAll.click();
  await expect(yogurt).toHaveAttribute("aria-checked", "false");
  await expect(bar).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("selected-count")).toBeEmpty();
  await expect(selectAll).toHaveText("Select all");

  await page.getByTestId("diary-done").click();
  await expect(page.getByTestId("edit-bar")).toHaveCount(0);
  await expect(page.getByTestId("diary-edit")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByTestId("meal-breakfast-entries")).toContainText(CHOBANI);
  await expect(page.getByTestId("meal-snacks-entries")).toContainText(QUEST);
});
