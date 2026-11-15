/**
 * Renders the public label eval set: fictional products, printed as nutrition
 * panels in the formats the reader has to handle, then photographed badly on
 * purpose (tilt, perspective, glare, blur, low light, JPEG loss). Every value
 * is invented, so the ground truth is exact by construction.
 *
 *   node scripts/make-eval-labels.mjs     writes evals/labels/syn-*.jpg and evals/label-golden.json
 *
 * Needs Playwright's Chromium (npx playwright install chromium).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const fact = (label, amount, dv, indent = 0, bold = true) => ({ label, amount, dv, indent, bold });

/** Standard US panel (2016 format). `extra` adds a second column (per container). */
function usPanel(p) {
  const dual = Boolean(p.second);
  const row = (f, i) => {
    const second = dual ? `<td class="num">${p.second.rows[i] ?? ""}</td>` : "";
    return `<tr class="${f.indent ? "sub" : ""}"><td>${f.bold ? `<b>${f.label}</b>` : f.label} ${f.amount}</td>${second}<td class="dv">${f.dv ?? ""}</td></tr>`;
  };
  return `
  <div class="us ${p.dark ? "dark" : ""}">
    <h1>Nutrition Facts</h1>
    <div class="servings">${p.servings}</div>
    <div class="size"><b>Serving size</b><b>${p.serving}</b></div>
    <div class="bar thick"></div>
    ${dual ? `<div class="cols"><span></span><b>Per serving</b><b>Per container</b></div>` : `<div class="aps">Amount per serving</div>`}
    <div class="cal"><span>Calories</span><span>${p.kcal}</span>${dual ? `<span>${p.second.kcal}</span>` : ""}</div>
    <div class="bar mid"></div>
    <div class="dvh">% Daily Value*</div>
    <table>${p.rows.map(row).join("")}</table>
    <div class="bar thick"></div>
    <p class="foot">${p.foot ?? "Vitamin D 0mcg 0% · Calcium 20mg 2% · Iron 1mg 6% · Potassium 140mg 2%"}</p>
    <p class="fine">* The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.</p>
  </div>`;
}

function linearPanel(p) {
  return `<div class="linear"><b class="big">Nutrition Facts</b> ${p.text}</div>`;
}

function tabularPanel(p) {
  const cells = p.rows.map(([l, a, dv]) => `<tr><td><b>${l}</b> ${a}</td><td>${dv}</td></tr>`).join("");
  return `
  <div class="tab">
    <div class="tleft"><h1>Nutrition<br/>Facts</h1><div>${p.servings}</div><div><b>Serving size</b><br/><b>${p.serving}</b></div>
      <div class="tcal"><b>Calories</b><br/><span>${p.kcal}</span></div></div>
    <table class="tright">${cells}</table>
  </div>`;
}

function euPanel(p) {
  const rows = p.rows.map(([l, a, b]) => `<tr><td>${l}</td><td>${a}</td><td>${b}</td></tr>`).join("");
  return `
  <div class="eu"><h2>Nutrition information</h2>
    <table><tr><th></th><th>per 100 g</th><th>${p.portion}</th></tr>${rows}</table>
    <p>${p.note}</p></div>`;
}

function caPanel(p) {
  const rows = p.rows.map(([en, fr, a, dv]) => `<tr><td><b>${en}</b> / ${fr} ${a}</td><td>${dv}</td></tr>`).join("");
  return `
  <div class="ca"><h1>Nutrition Facts<br/><span>Valeur nutritive</span></h1>
    <div>${p.serving}</div><div class="bar mid"></div>
    <div class="cal"><span><b>Calories</b> ${p.kcal}</span><span class="dvh">% Daily Value*<br/>% valeur quotidienne*</span></div>
    <table>${rows}</table><p class="fine">*5% or less is a little, 15% or more is a lot<br/>*5% ou moins c'est peu, 15% ou plus c'est beaucoup</p></div>`;
}

const CSS = `
  * { box-sizing: border-box; margin: 0; }
  body { width: 900px; height: 1100px; overflow: hidden; font-family: Helvetica, Arial, sans-serif; }
  .scene { position: absolute; inset: 0; display: grid; place-items: center; }
  .pack { padding: 34px; }
  .us, .ca { width: 420px; border: 2px solid #111; padding: 6px 10px; background: #fff; color: #111; }
  .us.dark { background: #1b1b1b; color: #f4f1ea; border-color: #f4f1ea; }
  .us h1, .ca h1 { font-family: "Arial Black", "Helvetica Neue", sans-serif; font-weight: 900; font-size: 44px; letter-spacing: -1px; line-height: 1; }
  .ca h1 span { font-size: 30px; }
  .servings { font-size: 17px; margin-top: 4px; }
  .size { display: flex; justify-content: space-between; font-size: 20px; }
  .bar { background: currentColor; }
  .bar.thick { height: 12px; margin: 4px 0; }
  .bar.mid { height: 6px; margin: 3px 0; }
  .aps { font-weight: 700; font-size: 14px; }
  .cols { display: grid; grid-template-columns: 1.4fr 1fr 1fr; font-size: 13px; text-align: right; }
  .cal { display: flex; justify-content: space-between; align-items: baseline; font-family: "Arial Black", sans-serif; font-weight: 900; font-size: 36px; }
  .dvh { text-align: right; font-weight: 700; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 16px; }
  td { border-top: 1px solid currentColor; padding: 3px 0; }
  td.dv, td.num { text-align: right; font-weight: 700; }
  tr.sub td:first-child { padding-left: 18px; }
  .foot { font-size: 14px; border-bottom: 6px solid currentColor; padding: 4px 0; }
  .fine { font-size: 11px; margin-top: 4px; }
  .linear { width: 760px; font-size: 19px; line-height: 1.35; border: 2px solid #111; padding: 8px 12px; background: #fff; color: #111; }
  .linear .big { font-family: "Arial Black", sans-serif; font-size: 26px; }
  .tab { display: flex; gap: 12px; border: 2px solid #111; padding: 8px; background: #fff; color: #111; width: 760px; }
  .tleft { width: 230px; font-size: 16px; display: grid; gap: 6px; border-right: 8px solid #111; padding-right: 10px; }
  .tleft h1 { font-family: "Arial Black", sans-serif; font-size: 34px; line-height: 1; }
  .tcal span { font-family: "Arial Black", sans-serif; font-size: 44px; }
  .tright td { font-size: 17px; }
  .eu { width: 560px; background: #fff; color: #222; padding: 14px; border-radius: 6px; font-family: Georgia, serif; }
  .eu h2 { font-size: 22px; margin-bottom: 8px; }
  .eu th { text-align: right; font-size: 15px; padding: 4px; border-bottom: 2px solid #222; }
  .eu td { font-size: 17px; padding: 4px; border-top: 1px solid #999; }
  .eu td + td { text-align: right; }
  .eu p { font-size: 13px; margin-top: 8px; }
  .glare::after { content: ""; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,.75) 42%, rgba(255,255,255,.15) 50%, transparent 58%); }
  .note-card { width: 520px; background: #fdf6d8; padding: 28px; font-family: "Bradley Hand", "Comic Sans MS", cursive; font-size: 30px; line-height: 1.5; color: #223; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
  .ingredients { width: 600px; background: #fff; color: #111; padding: 18px; font-size: 20px; line-height: 1.4; border: 1px solid #aaa; }
`;

/** Backgrounds a phone photo would catch: counter, cutting board, packaging. */
const BACKDROPS = {
  counter: "radial-gradient(circle at 30% 20%, #d9d4cb, #a8a197)",
  wood: "repeating-linear-gradient(95deg, #a0703f 0 14px, #8d5f33 14px 22px, #b07b46 22px 40px)",
  carton: "linear-gradient(160deg, #e8dcc2, #cbb994)",
  red: "linear-gradient(140deg, #b93a2b, #7c2117)",
  green: "linear-gradient(140deg, #4f7a3a, #2e4d22)",
  slate: "linear-gradient(140deg, #3b4148, #1f2328)",
};

function page(panel, s = {}) {
  const t = s.transform ?? "none";
  const f = s.filter ?? "none";
  return `<!doctype html><html><head><style>${CSS}</style></head><body>
    <div class="scene" style="background:${BACKDROPS[s.backdrop ?? "counter"]}">
      <div class="pack ${s.glare ? "glare" : ""}" style="position:relative;background:${s.pack ?? "#f3efe6"};transform:${t};filter:${f};${s.clip ?? ""}">${panel}</div>
    </div></body></html>`;
}

const US_FOOT_PROTEIN = "Vitamin D 2mcg 10% · Calcium 260mg 20% · Iron 8mg 45% · Potassium 300mg 6% · Vitamin B12 2.4mcg 100%";

/** Every entry: id, the html, how it is shot, and the truth the reader must return. */
const LABELS = [
  {
    id: "syn-01-oat-clusters",
    html: usPanel({ servings: "8 servings per container", serving: "2/3 cup (55g)", kcal: 230, rows: [
      fact("Total Fat", "8g", "10%"), fact("Saturated Fat", "1g", "5%", 1, false), fact("<i>Trans</i> Fat", "0g", "", 1, false),
      fact("Cholesterol", "0mg", "0%"), fact("Sodium", "160mg", "7%"), fact("Total Carbohydrate", "37g", "13%"),
      fact("Dietary Fiber", "4g", "14%", 1, false), fact("Total Sugars", "12g", "", 1, false), fact("Protein", "3g", "") ] }),
    shot: { backdrop: "carton" },
    truth: { servingLabel: "2/3 cup", servingGrams: 55, kcal: 230, proteinG: 3, carbsG: 37, fatG: 8, fiberG: 4 },
    note: "Clean, straight, standard vertical panel",
  },
  {
    id: "syn-02-trail-mix-dual-column",
    html: usPanel({ servings: "2 servings per container", serving: "1/4 cup (30g)", kcal: 160,
      second: { kcal: 320, rows: ["20g", "4g", "0g", "0mg", "180mg", "28g", "4g", "14g", "10g"] },
      rows: [fact("Total Fat", "10g", "13%"), fact("Saturated Fat", "2g", "10%", 1, false), fact("<i>Trans</i> Fat", "0g", "", 1, false),
        fact("Cholesterol", "0mg", "0%"), fact("Sodium", "90mg", "4%"), fact("Total Carbohydrate", "14g", "5%"),
        fact("Dietary Fiber", "2g", "7%", 1, false), fact("Total Sugars", "7g", "", 1, false), fact("Protein", "5g", "")] }),
    shot: { backdrop: "wood", transform: "rotate(-3deg)" },
    truth: { servingLabel: "1/4 cup", servingGrams: 30, kcal: 160, proteinG: 5, carbsG: 14, fatG: 10, fiberG: 2 },
    note: "Dual column, per serving and per container; must take per serving",
  },
  {
    id: "syn-03-fruit-cup-less-than-1g",
    html: usPanel({ servings: "4 servings per container", serving: "1 cup (113g)", kcal: 70, rows: [
      fact("Total Fat", "0g", "0%"), fact("Sodium", "10mg", "0%"), fact("Total Carbohydrate", "17g", "6%"),
      fact("Dietary Fiber", "1g", "4%", 1, false), fact("Total Sugars", "15g", "", 1, false), fact("Protein", "&lt;1g", "")] }),
    shot: { backdrop: "counter", transform: "rotate(7deg)", filter: "sepia(.35) brightness(.92)" },
    truth: { servingLabel: "1 cup", servingGrams: 113, kcal: 70, proteinG: 0, carbsG: 17, fatG: 0, fiberG: 1 },
    note: "Protein printed as <1g reads as 0; warm light, tilted",
  },
  {
    id: "syn-04-granola-bar-linear",
    html: linearPanel({ text: "Servings: 1, <b>Serv. size:</b> 1 bar (40g), <b>Amount per serving: Calories 180</b>, <b>Total Fat</b> 7g (9% DV), Sat. Fat 2.5g (13% DV), <i>Trans</i> Fat 0g, <b>Cholest.</b> 0mg (0% DV), <b>Sodium</b> 95mg (4% DV), <b>Total Carb.</b> 26g (9% DV), Fiber 3g (11% DV), Total Sugars 11g (Incl. 9g Added Sugars, 18% DV), <b>Protein</b> 4g, Vit. D (0% DV), Calcium (2% DV), Iron (6% DV), Potas. (2% DV)." }),
    shot: { backdrop: "green", transform: "perspective(900px) rotateX(14deg) rotate(-2deg)" },
    truth: { servingLabel: "1 bar", servingGrams: 40, kcal: 180, proteinG: 4, carbsG: 26, fatG: 7, fiberG: 3 },
    note: "Linear run-in format for small packages, seen at an angle",
  },
  {
    id: "syn-05-yogurt-tabular",
    html: tabularPanel({ servings: "1 serving per container", serving: "1 container (150g)", kcal: 120, rows: [
      ["Total Fat", "2.5g", "3%"], ["Saturated Fat", "1.5g", "8%"], ["Cholesterol", "10mg", "3%"], ["Sodium", "55mg", "2%"],
      ["Total Carbohydrate", "9g", "3%"], ["Dietary Fiber", "0g", "0%"], ["Total Sugars", "6g", ""], ["Protein", "15g", "26%"]] }),
    shot: { backdrop: "counter", transform: "rotate(-90deg) scale(1.3)" },
    truth: { servingLabel: "1 container", servingGrams: 150, kcal: 120, proteinG: 15, carbsG: 9, fatG: 2.5, fiberG: 0 },
    note: "Tabular (horizontal) format, photographed sideways",
  },
  {
    id: "syn-06-crackers-per-100g-and-portion",
    html: euPanel({ portion: "per portion (30 g)", note: "This pack contains about 7 portions.", rows: [
      ["Energy", "1854 kJ / 443 kcal", "556 kJ / 133 kcal"], ["Fat", "18,5 g", "5,6 g"], ["of which saturates", "2,1 g", "0,6 g"],
      ["Carbohydrate", "58,0 g", "17,4 g"], ["of which sugars", "3,3 g", "1,0 g"], ["Fibre", "4,2 g", "1,3 g"], ["Protein", "9,8 g", "2,9 g"], ["Salt", "1,40 g", "0,42 g"]] }),
    shot: { backdrop: "red", pack: "#fbf3e4", transform: "rotate(2deg)" },
    truth: { servingLabel: "per portion", servingGrams: 30, kcal: 133, proteinG: 2.9, carbsG: 17.4, fatG: 5.6, fiberG: 1.3 },
    accept: { servingLabel: ["portion", "1 portion", "30g", "30 g"] },
    note: "European panel: per 100 g beside per portion, comma decimals, kJ before kcal; must take the portion",
  },
  {
    id: "syn-07-nut-butter-dark-pack",
    html: usPanel({ dark: true, servings: "about 14 servings per container", serving: "2 tbsp (32g)", kcal: 190, rows: [
      fact("Total Fat", "16g", "21%"), fact("Saturated Fat", "2.5g", "13%", 1, false), fact("Sodium", "125mg", "5%"),
      fact("Total Carbohydrate", "7g", "3%"), fact("Dietary Fiber", "2g", "7%", 1, false), fact("Total Sugars", "3g", "", 1, false), fact("Protein", "8g", "")] }),
    shot: { backdrop: "slate", pack: "#1b1b1b", filter: "brightness(.78) blur(.6px)" },
    truth: { servingLabel: "2 tbsp", servingGrams: 32, kcal: 190, proteinG: 8, carbsG: 7, fatG: 16, fiberG: 2 },
    note: "Light text on dark packaging, dim and slightly soft",
  },
  {
    id: "syn-08-protein-powder-angle",
    html: usPanel({ servings: "30 servings per container", serving: "1 scoop (31g)", kcal: 120, foot: US_FOOT_PROTEIN, rows: [
      fact("Total Fat", "1.5g", "2%"), fact("Cholesterol", "35mg", "12%"), fact("Sodium", "130mg", "6%"),
      fact("Total Carbohydrate", "3g", "1%"), fact("Dietary Fiber", "1g", "4%", 1, false), fact("Total Sugars", "1g", "", 1, false), fact("Protein", "24g", "48%")] }),
    shot: { backdrop: "slate", transform: "perspective(800px) rotateY(24deg)" },
    truth: { servingLabel: "1 scoop", servingGrams: 31, kcal: 120, proteinG: 24, carbsG: 3, fatG: 1.5, fiberG: 1 },
    note: "Strong perspective from the side",
  },
  {
    id: "syn-09-soup-glare",
    html: usPanel({ servings: "about 2 servings per container", serving: "1 cup (245g)", kcal: 90, rows: [
      fact("Total Fat", "2g", "3%"), fact("Sodium", "640mg", "28%"), fact("Total Carbohydrate", "15g", "5%"),
      fact("Dietary Fiber", "3g", "11%", 1, false), fact("Total Sugars", "4g", "", 1, false), fact("Protein", "4g", "")] }),
    shot: { backdrop: "counter", glare: true, transform: "rotate(-5deg)" },
    truth: { servingLabel: "1 cup", servingGrams: 245, kcal: 90, proteinG: 4, carbsG: 15, fatG: 2, fiberG: 3 },
    note: "A band of glare across the panel",
  },
  {
    id: "syn-10-bar-bilingual",
    html: caPanel({ serving: "Per 1 bar (40 g) / pour 1 barre (40 g)", kcal: 170, rows: [
      ["Fat", "Lipides", "6 g", "8 %"], ["Saturated", "saturés", "1 g", "6 %"], ["Carbohydrate", "Glucides", "25 g", ""],
      ["Fibre", "Fibres", "3 g", "11 %"], ["Sugars", "Sucres", "9 g", "9 %"], ["Protein", "Protéines", "5 g", ""], ["Sodium", "", "90 mg", "4 %"]] }),
    shot: { backdrop: "carton", transform: "rotate(4deg)" },
    truth: { servingLabel: "1 bar", servingGrams: 40, kcal: 170, proteinG: 5, carbsG: 25, fatG: 6, fiberG: 3 },
    accept: { servingLabel: ["per 1 bar", "1 barre", "40g", "40 g"] },
    note: "Bilingual English and French panel, the serving given as Per 1 bar",
  },
  {
    id: "syn-11-pasta-sauce-curved-jar",
    html: usPanel({ servings: "about 5 servings per container", serving: "1/2 cup (125g)", kcal: 70, rows: [
      fact("Total Fat", "2.5g", "3%"), fact("Sodium", "430mg", "19%"), fact("Total Carbohydrate", "11g", "4%"),
      fact("Dietary Fiber", "2g", "7%", 1, false), fact("Total Sugars", "7g", "", 1, false), fact("Protein", "2g", "")] }),
    shot: { backdrop: "wood", transform: "perspective(700px) rotateY(-18deg) scaleX(.82) rotate(-4deg)" },
    truth: { servingLabel: "1/2 cup", servingGrams: 125, kcal: 70, proteinG: 2, carbsG: 11, fatG: 2.5, fiberG: 2 },
    note: "Squeezed and turned the way a label on a round jar photographs",
  },
  {
    id: "syn-12-chips-low-quality",
    html: usPanel({ servings: "about 8 servings per container", serving: "1 oz (28g/about 15 chips)", kcal: 150, rows: [
      fact("Total Fat", "9g", "12%"), fact("Saturated Fat", "1g", "5%", 1, false), fact("Sodium", "170mg", "7%"),
      fact("Total Carbohydrate", "15g", "5%"), fact("Dietary Fiber", "1g", "4%", 1, false), fact("Total Sugars", "&lt;1g", "", 1, false), fact("Protein", "2g", "")] }),
    shot: { backdrop: "red", transform: "rotate(-8deg)", quality: 38, scale: 0.55 },
    truth: { servingLabel: "1 oz", servingGrams: 28, kcal: 150, proteinG: 2, carbsG: 15, fatG: 9, fiberG: 1 },
    note: "Small, heavily compressed photo; the gram weight shares the parentheses with a piece count",
  },
];

const NEGATIVES = [
  {
    id: "syn-neg-ingredients-only",
    html: `<div class="ingredients"><b>INGREDIENTS:</b> Whole grain oats, cane sugar, sunflower oil, brown rice flour, honey, sea salt, natural flavor, mixed tocopherols (to preserve freshness). <b>CONTAINS:</b> none of the major allergens. Made in a facility that also processes tree nuts.</div>`,
    shot: { backdrop: "carton", transform: "rotate(-2deg)" },
    note: "Ingredients panel, no nutrition facts",
  },
  {
    id: "syn-neg-too-blurry",
    html: LABELS[0].html,
    shot: { backdrop: "carton", filter: "blur(7px)", transform: "rotate(3deg)" },
    note: "A real panel, too blurred to read any number",
  },
  {
    id: "syn-neg-cut-off",
    html: LABELS[8].html,
    shot: { backdrop: "counter", transform: "translateY(715px) scale(1.15)" },
    note: "Only the title and serving size are in frame; no calories or macros visible",
  },
  {
    id: "syn-neg-shopping-list",
    html: `<div class="note-card">Groceries<br/>oats<br/>greek yogurt x2<br/>bananas<br/>chicken thighs 2 lb<br/>rice<br/>spinach</div>`,
    shot: { backdrop: "wood", transform: "rotate(5deg)" },
    note: "A handwritten shopping list, not a label",
  },
];

async function main() {
  mkdirSync("evals/labels", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const tab = await ctx.newPage();
  const golden = [];
  for (const entry of [...LABELS.map((l) => ({ ...l, kind: "label" })), ...NEGATIVES.map((n) => ({ ...n, kind: "negative" }))]) {
    const shot = entry.shot ?? {};
    await tab.setViewportSize({ width: Math.round(900 * (shot.scale ?? 1)), height: Math.round(1100 * (shot.scale ?? 1)) });
    const zoom = shot.scale ? `<style>body{zoom:${shot.scale}}</style>` : "";
    await tab.setContent(page(entry.html, shot) + zoom);
    const file = `labels/${entry.id}.jpg`;
    await tab.screenshot({ path: `evals/${file}`, type: "jpeg", quality: shot.quality ?? 82 });
    golden.push(
      entry.kind === "label"
        ? { id: entry.id, file, kind: "label", source: "synthetic", truth: entry.truth, ...(entry.accept ? { accept: entry.accept } : {}), note: entry.note }
        : { id: entry.id, file, kind: "negative", source: "synthetic", note: entry.note },
    );
  }
  await browser.close();
  writeFileSync("evals/label-golden.json", JSON.stringify(golden, null, 2) + "\n");
  console.log(`Wrote ${golden.length} images (${LABELS.length} labels, ${NEGATIVES.length} non-labels) and evals/label-golden.json`);
}

void main();
