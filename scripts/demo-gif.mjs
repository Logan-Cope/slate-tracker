/**
 * Records the README's demo loop against a running demo: sign in, log lunch from a typed search,
 * check the weight trend, start a workout and log a set in one tap. Needs ffmpeg.
 *
 *   node scripts/demo-gif.mjs [base-url]     default http://localhost:3000, writes docs/images/demo.gif
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, devices } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "docs/images/demo.gif";
const videoDir = mkdtempSync(path.join(tmpdir(), "slate-gif-"));
const size = { width: 390, height: 844 };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 14"], deviceScaleFactor: 1, colorScheme: "light", recordVideo: { dir: videoDir, size } });
const page = await ctx.newPage();
const beat = (ms = 900) => page.waitForTimeout(ms);

await page.goto(`${base}/login`);
await page.waitForLoadState("networkidle");
await beat(1200);
await page.getByTestId("demo-avery").click();
await page.waitForURL(/\/today/);
await page.waitForLoadState("networkidle");
await beat(1500);

// Log lunch by typing what was eaten.
await page.goto(`${base}/today/add?meal=lunch`);
await page.waitForLoadState("networkidle");
const search = page.getByTestId("add-food-search");
await search.click();
await search.pressSequentially("150g chicken breast roasted", { delay: 70 });
const add = page.getByTestId("search-results").getByRole("button", { name: /^Add Chicken/ }).first();
await add.waitFor();
await beat(900);
await add.click();
await beat(1200);
await page.getByRole("link", { name: "Today" }).click();
await page.waitForLoadState("networkidle");
await beat(1600);

// The trend under the noise.
await page.getByRole("link", { name: "Weight" }).click();
await page.waitForLoadState("networkidle");
await beat(2000);

// One tap logs a set at the ghost weight.
await page.getByRole("link", { name: "Train" }).click();
await page.waitForLoadState("networkidle");
await beat(1000);
await page.getByTestId("up-next").getByTestId(/^start-routine-/).click();
await page.waitForURL(/\/train\/workout\//);
await page.waitForLoadState("networkidle");
await beat(1000);
const check = page.locator('[data-testid^="set-"][data-testid$="-check"]').first();
await check.click();
await beat(2200);

await ctx.close();
await browser.close();

const video = path.join(videoDir, readdirSync(videoDir).find((f) => f.endsWith(".webm")));
const filters = "fps=12,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4";
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-vf", filters, "-loop", "0", out]);
rmSync(videoDir, { recursive: true, force: true });
console.log(out);
