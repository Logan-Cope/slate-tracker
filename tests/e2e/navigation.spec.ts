import { expect, test, type Page, type Request } from "@playwright/test";
import { login } from "./helpers";

/**
 * Moving between tabs: what is on screen after a write and a switch, who is
 * signed in, and how fast the tab bar answers a tap. The tests share the dev
 * server's database and run in order; each one leaves the data as it found it.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

const QUEST = "Protein Bar, Cookies and Cream";
const WORKOUT_URL = /\/train\/workout\/[0-9a-f-]{36}$/;
const TODAY_URL = /\/today(\?date=[\d-]+)?$/;

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true });

// The dev server's tools button sits over the Today tab and would take its taps.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    });
  });
});

function kcalOf(text: string | null): number {
  return Number((text ?? "").replace(/[^\d-]/g, ""));
}

function actionDone(page: Page) {
  return page.waitForResponse((r) => r.request().method() === "POST" && r.ok(), { timeout: 20_000 });
}

const isNavigation = (headers: Record<string, string>) => !!headers["rsc"] && !headers["next-router-prefetch"] && !headers["next-router-segment-prefetch"];

/**
 * Holds the navigation request for a page (not its prefetches, which have landed by now) until
 * release(). settled resolves once that request is over: answered, or dropped by the page.
 */
async function holdNavigation(page: Page, pathname: string) {
  await page.waitForLoadState("networkidle");
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      if (isNavigation(route.request().headers())) await held;
      await route.continue().catch(() => undefined);
    },
  );
  const settled = new Promise<void>((resolve) => {
    const over = (req: Request) => {
      if (new URL(req.url()).pathname !== pathname || !isNavigation(req.headers())) return;
      page.off("requestfinished", over).off("requestfailed", over);
      resolve();
    };
    page.on("requestfinished", over).on("requestfailed", over);
  })
    .then(() => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))))
    .catch(() => undefined);
  return { release, settled };
}

/** Viewport tops of the blocks directly under root. */
function topsOf(page: Page, root: string) {
  return page.evaluate((root) => [...document.querySelector(root)!.children].map((c) => Math.round(c.getBoundingClientRect().top)), root);
}

test("(a) a food added on Add food is on Today, and still there after Train and back", async ({ page }) => {
  await login(page);
  const before = kcalOf(await page.getByTestId("kcal-left").textContent());

  await page.getByTestId("meal-snacks-add").click();
  await expect(page).toHaveURL(/\/today\/add\?/);
  // A cold dev server can hand over the page before it hydrates; type again until results come back.
  const addQuest = page.getByTestId("search-results").getByRole("button", { name: `Add ${QUEST}`, exact: true });
  await expect(async () => {
    await page.getByTestId("add-food-search").fill("quest");
    await expect(addQuest).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  const added = actionDone(page);
  await addQuest.click();
  await added;

  await tab(page, "Today").click();
  await expect(page).toHaveURL(TODAY_URL);
  const snacks = page.getByTestId("meal-snacks-entries");
  await expect(snacks).toContainText(QUEST);
  await expect.poll(async () => kcalOf(await page.getByTestId("kcal-left").textContent())).toBe(before - 190);

  await tab(page, "Train").click();
  await expect(page.getByRole("heading", { name: "Train", exact: true })).toBeVisible();
  await tab(page, "Today").click();
  await expect(page).toHaveURL(TODAY_URL);
  await expect(snacks).toContainText(QUEST);
  await expect.poll(async () => kcalOf(await page.getByTestId("kcal-left").textContent())).toBe(before - 190);

  // Leave the diary as it was.
  await snacks.getByRole("button", { name: /Protein Bar/ }).first().click();
  const deleted = actionDone(page);
  await page.getByTestId("sheet-delete").click();
  await deleted;
  await expect(page.getByTestId("meal-snacks").getByText(QUEST)).toHaveCount(0);
});

test("(b) Train's Resume card counts a set completed just before the switch, also after a bounce through the workout", async ({ page }) => {
  await login(page);
  await tab(page, "Train").click();
  await page.getByTestId("up-next").getByTestId(/^start-routine-/).click();
  await page.waitForURL(WORKOUT_URL);

  const first = page.getByTestId(/^exercise-/).first();
  const checks = first.getByTestId(/^set-.*-check$/);
  await checks.nth(0).click();
  await expect(checks.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-dirty", "false");

  await tab(page, "Train").click();
  await page.waitForURL(/\/train$/);
  const resume = page.getByTestId("resume-workout");
  await expect(resume).toContainText(/1 of \d+ sets done/);
  const total = Number((await resume.textContent())!.match(/1 of (\d+) sets done/)![1]);

  await resume.click();
  await page.waitForURL(WORKOUT_URL);
  await expect(checks.nth(0)).toHaveAttribute("aria-pressed", "true");
  await checks.nth(1).click();
  await expect(checks.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-dirty", "false");

  await tab(page, "Train").click();
  await page.waitForURL(/\/train$/);
  await expect(resume).toContainText(`2 of ${total} sets done`);

  // Leave Train as it was: no open workout, Total Body A up next.
  await page.getByTestId("resume-discard").click();
  await page.getByTestId("confirm-discard").click();
  await expect(resume).toHaveCount(0);
  await expect(page.getByTestId("up-next")).toBeVisible();
});

test("(c) a coach's profile switch swaps the data and the banner", async ({ page }) => {
  await login(page, "morgan");
  await tab(page, "Settings").click();
  await page.getByLabel("Viewing", { exact: true }).selectOption({ label: "Sam" });
  await page.locator("main").getByRole("button", { name: "Switch", exact: true }).click();
  await page.waitForURL(TODAY_URL);
  await expect(page.getByText("Viewing Sam", { exact: true })).toBeVisible();

  await tab(page, "Weight").click();
  await expect(page.getByText("Sam's weigh-ins", { exact: true })).toBeVisible();

  await page.getByLabel("Switch profile").selectOption({ label: "Avery" });
  await page.getByRole("button", { name: "Switch", exact: true }).click();
  await page.waitForURL(TODAY_URL);
  await expect(page.getByText("Viewing Avery", { exact: true })).toBeVisible();
  await tab(page, "Weight").click();
  await expect(page.getByText("Avery's weigh-ins", { exact: true })).toBeVisible();
});

test("(d) signed out, every tab answers with a redirect to login", async ({ request }) => {
  for (const path of ["/today", "/train", "/weight", "/settings", "/coach"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(new URL(res.headers()["location"] ?? "", "http://localhost").pathname, path).toBe("/login");
  }
});

test("(e) a date change and Add food keep the page on screen: no skeleton", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __skeletonSeen: boolean };
    w.__skeletonSeen = false;
    new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes)
          if (n instanceof Element && (n.matches('[data-perf="skeleton"]') || n.querySelector('[data-perf="skeleton"]'))) w.__skeletonSeen = true;
    }).observe(document, { childList: true, subtree: true });
  });
  const seen = () => page.evaluate(() => (window as unknown as { __skeletonSeen: boolean }).__skeletonSeen);

  await login(page);
  await expect(page.getByTestId("kcal-left")).toBeVisible();
  await page.evaluate(() => ((window as unknown as { __skeletonSeen: boolean }).__skeletonSeen = false));

  const label = page.getByTestId("date-label");
  const todayLabel = await label.textContent();
  await page.getByTestId("date-prev").click();
  await page.waitForURL(/\/today\?date=/);
  await expect(label).not.toHaveText(todayLabel!);
  await page.getByTestId("date-next").click();
  await expect(label).toHaveText(todayLabel!);
  expect(await seen()).toBe(false);

  await page.getByTestId("meal-lunch-add").click();
  await expect(page).toHaveURL(/\/today\/add\?/);
  await expect(page.getByTestId("add-food-search")).toBeVisible();
  expect(await seen()).toBe(false);
});

test("(f) the tapped tab lights up at once while its page is still on the way", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  // Hold every RSC request for /train (prefetches too) until the test lets go.
  await page.route(
    (url) => url.pathname === "/train",
    async (route) => {
      const req = route.request();
      if (req.headers()["rsc"] || new URL(req.url()).searchParams.has("_rsc")) await held;
      await route.continue().catch(() => undefined);
    },
  );

  await login(page);
  await expect(page.getByTestId("kcal-left")).toBeVisible();
  await page.evaluate(() => {
    const link = document.querySelector('nav[aria-label="Main"] a[href="/train"]')!;
    const today = document.querySelector('nav[aria-label="Main"] a[href="/today"]')!;
    const rec = { t0: null as number | null, lit: null as number | null, currentAtLit: null as string | null };
    (window as unknown as { __tap: typeof rec }).__tap = rec;
    addEventListener("pointerdown", (e) => (rec.t0 ??= e.timeStamp), true);
    new MutationObserver(() => {
      if (rec.lit === null && link.className.includes("text-accent-ink")) {
        rec.lit = performance.now();
        rec.currentAtLit = today.getAttribute("aria-current");
      }
    }).observe(link, { attributes: true, attributeFilter: ["class"] });
  });

  await tab(page, "Train").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __tap: { lit: number | null } }).__tap.lit)).not.toBeNull();
  const tap = await page.evaluate(() => (window as unknown as { __tap: { t0: number; lit: number; currentAtLit: string | null } }).__tap);
  expect(tap.lit - tap.t0).toBeLessThan(100);
  expect(tap.currentAtLit).toBe("page");
  await expect(tab(page, "Today")).toHaveAttribute("aria-current", "page");
  // Train's skeleton stands in for the page; Today's diary is out of sight.
  const skeleton = page.getByRole("progressbar", { name: "Loading" });
  await expect(skeleton).toBeVisible();
  await expect(page.getByTestId("kcal-left")).toBeHidden();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "true");

  release();
  await expect(tab(page, "Train")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("recent-workouts")).toBeVisible();
  await expect(skeleton).toHaveCount(0);
  await expect(tab(page, "Today")).not.toHaveClass(/text-accent-ink/);
  await expect(page.locator("main")).not.toHaveAttribute("aria-busy", /.*/);
  // Each tab has its own title, which is what the router announces on arrival.
  await expect(page).toHaveTitle(/^Train\b/);
});

test("(g) tapping the tab on screen while another one is on its way brings the page back, for good", async ({ page }) => {
  await login(page);
  await expect(page.getByTestId("kcal-left")).toBeVisible();
  const train = await holdNavigation(page, "/train");

  await tab(page, "Train").click();
  const skeleton = page.getByRole("progressbar", { name: "Loading" });
  await expect(skeleton).toBeVisible();
  await page.waitForTimeout(80);
  await tab(page, "Today").click();
  await expect(page.getByTestId("kcal-left")).toBeVisible();
  await expect(skeleton).toHaveCount(0);

  train.release();
  await train.settled;
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("kcal-left")).toBeVisible();
  await expect(skeleton).toHaveCount(0);
  await expect(tab(page, "Train")).not.toHaveClass(/text-accent-ink/);
  await expect(tab(page, "Today")).toHaveClass(/text-accent-ink/);
});

test("(h) Back while a tab is on its way shows the page the URL points at", async ({ page }) => {
  await login(page);
  const label = page.getByTestId("date-label");
  const todayLabel = await label.textContent();
  await page.getByTestId("date-prev").click();
  await page.waitForURL(/\/today\?date=/);
  await expect(label).not.toHaveText(todayLabel!);
  const train = await holdNavigation(page, "/train");

  await tab(page, "Train").click();
  const skeleton = page.getByRole("progressbar", { name: "Loading" });
  await expect(skeleton).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
  await expect(label).toHaveText(todayLabel!);
  await expect(skeleton).toHaveCount(0);

  train.release();
  await train.settled;
  await expect(page).toHaveURL(/\/today$/);
  await expect(label).toBeVisible();
  await expect(skeleton).toHaveCount(0);
  await expect(tab(page, "Train")).not.toHaveClass(/text-accent-ink/);
});

test("(i) a tab tapped far down a page shows its skeleton from the top, and its page lands there", async ({ page }) => {
  await login(page);
  await expect(page.getByTestId("kcal-left")).toBeVisible();
  const train = await holdNavigation(page, "/train");
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(100);

  await tab(page, "Train").click();
  await expect(page.getByRole("progressbar", { name: "Loading" })).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(0);

  train.release();
  await train.settled;
  await expect(page.getByTestId("recent-workouts")).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test("(j) a section's own tab, tapped from one of its inner pages, shows that tab's skeleton", async ({ page }) => {
  await login(page);
  await page.getByTestId("meal-lunch-add").click();
  await expect(page.getByTestId("add-food-search")).toBeVisible();
  const today = await holdNavigation(page, "/today");

  await tab(page, "Today").click();
  const skeleton = page.getByRole("progressbar", { name: "Loading" });
  await expect(skeleton).toBeVisible();
  await expect(page.getByTestId("add-food-search")).toBeHidden();

  today.release();
  await today.settled;
  await expect(page.getByTestId("kcal-left")).toBeVisible();
  await expect(skeleton).toHaveCount(0);
});

test("(k) a coach's Coach and Settings skeletons put each block where the page puts it", async ({ page }) => {
  await login(page, "morgan");
  // A week with food in it, as Avery's always has: the coach's food table then ends with its Average row.
  await page.getByTestId("meal-snacks-add").click();
  const addQuest = page.getByTestId("search-results").getByRole("button", { name: `Add ${QUEST}`, exact: true });
  await expect(async () => {
    await page.getByTestId("add-food-search").fill("quest");
    await expect(addQuest).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  const added = actionDone(page);
  await addQuest.click();
  await added;
  await tab(page, "Today").click();
  await expect(page.getByTestId("meal-snacks-entries")).toContainText(QUEST);

  for (const name of ["Coach", "Settings"]) {
    const held = await holdNavigation(page, `/${name.toLowerCase()}`);
    await tab(page, name).click();
    await expect(page.locator('[data-perf="skeleton"]')).toBeVisible();
    // The blocks that start on screen, where a jump would be seen.
    const skeleton = (await topsOf(page, '[data-perf="skeleton"] > div')).filter((top) => top < page.viewportSize()!.height);

    held.release();
    await held.settled;
    await expect(tab(page, name)).toHaveAttribute("aria-current", "page");
    await expect(page.locator('[data-perf="skeleton"]')).toHaveCount(0);
    const real = await topsOf(page, 'main > div:not([data-perf="skeleton"]) > :first-child');
    expect(real.length, name).toBeGreaterThanOrEqual(skeleton.length);
    skeleton.forEach((top, i) => expect(Math.abs(top - real[i]!), `${name} block ${i}: ${skeleton} vs ${real}`).toBeLessThanOrEqual(2));
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }

  // Leave the diary as it was.
  await tab(page, "Today").click();
  const snacks = page.getByTestId("meal-snacks-entries");
  await snacks.getByRole("button", { name: /Protein Bar/ }).first().click();
  const deleted = actionDone(page);
  await page.getByTestId("sheet-delete").click();
  await deleted;
  await expect(page.getByTestId("meal-snacks").getByText(QUEST)).toHaveCount(0);
});
