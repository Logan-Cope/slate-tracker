/**
 * Screenshots of a running demo for the README: phone-sized, light theme.
 *
 *   node scripts/demo-shots.mjs [base-url]     default http://localhost:3000, writes docs/images/*.png
 */
import { chromium, devices } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "docs/images";

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 14"], colorScheme: "light" });
const page = await ctx.newPage();
const shot = async (name) => {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png`, animations: "disabled" });
  console.log(`${out}/${name}.png`);
};

await page.goto(`${base}/login`);
await shot("login");
await page.getByTestId("demo-avery").click();
await page.waitForURL(/\/today/);
await shot("today");
await page.goto(`${base}/weight`);
await shot("weight");
await page.goto(`${base}/train`);
await shot("train");
await ctx.clearCookies();
await page.goto(`${base}/login`);
await page.getByTestId("demo-morgan").click();
await page.waitForURL(/\/coach/);
await shot("coach");

// The README's hero: three screens side by side on the app's own paper color.
const { readFileSync } = await import("node:fs");
const img = (name) => `data:image/png;base64,${readFileSync(`${out}/${name}.png`).toString("base64")}`;
const hero = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 });
await hero.setContent(`<!doctype html><html><body style="margin:0;background:#faf7f2;display:flex;gap:40px;justify-content:center;align-items:center;height:640px">
  ${["today", "weight", "coach"].map((n) => `<img src="${img(n)}" style="width:330px;border-radius:36px;border:1px solid #e7e1d8">`).join("")}
</body></html>`);
await hero.screenshot({ path: `${out}/hero.png` });
console.log(`${out}/hero.png`);
await browser.close();
