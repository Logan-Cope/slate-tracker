# Evals

Every feature in Slate that calls a model, or that ranks results, has an eval that was written before the feature: a golden set, a scorer with unit tests, and a pass bar decided up front. A change to a prompt, a model or a parameter ships only when its eval still passes.

| Eval | Command | Golden set | Bar | Needs a key |
|---|---|---|---|---|
| Nutrition label reader | `npm run eval:labels` | 16 synthetic photos in `evals/` | see below | yes |
| Food search | `npm run eval:search` | `tests/fixtures/golden-queries.json` | top-3 hit rate at least 0.9 on a full USDA import | no |
| Restaurant menu finder | `npm run eval:restaurants -- --real` | `tests/fixtures/restaurant-golden.json` | 80% of items found, calories within 5% or 10 kcal | yes |

## The label reader

### The set

Sixteen photos, rendered by `scripts/make-eval-labels.mjs` from invented products, so the ground truth is exact by construction and no real photo or product is involved. Twelve are labels, each built to test one way a reading goes wrong:

| Photo | What it tests |
|---|---|
| syn-01-oat-clusters | Clean baseline |
| syn-02-trail-mix-dual-column | Per serving beside per container; must take per serving |
| syn-03-fruit-cup-less-than-1g | `<1g` protein reads as 0; warm light, tilted |
| syn-04-granola-bar-linear | Linear run-in format, seen at an angle |
| syn-05-yogurt-tabular | Tabular format, photographed sideways |
| syn-06-crackers-per-100g-and-portion | European panel: per 100 g beside per portion, comma decimals, kJ before kcal |
| syn-07-nut-butter-dark-pack | Light text on dark packaging, dim and soft |
| syn-08-protein-powder-angle | Strong perspective |
| syn-09-soup-glare | A band of glare across the numbers |
| syn-10-bar-bilingual | English and French panel |
| syn-11-pasta-sauce-curved-jar | Squeezed and turned like a label on a jar |
| syn-12-chips-low-quality | Small, heavily compressed; grams share parentheses with a piece count |

Four are not readable labels, and the right answer is a refusal: an ingredients panel, a label too blurred to read, a label cut off above the calories, and a handwritten shopping list.

`npm run eval:labels:render` rebuilds the photos and `evals/label-golden.json` from the script.

### The bar

All four must hold (`lib/nutrition/label-eval.ts`, unit-tested in `tests/unit/label-eval.test.ts`):

- **0 wrong calories filled in.** A refusal costs the person a retake; a wrong number they did not notice costs them a wrong diary. One silent calorie error fails the run.
- **At least 98% of number fields exact** (serving grams, calories, protein, carbs, fat, fiber).
- **At least 90% of labels right on every field**, serving text included (normalised for spacing, with listed alternatives such as `per portion` for `1 portion`).
- **Every non-label refused.**

Plus a latency bar of 6 s at the median, since the person is standing at the counter with the package in hand.

### Running it

```bash
ANTHROPIC_API_KEY=... npm run eval:labels -- --write
```

About a cent on Haiku. It prints each photo's outcome, the four measures against the bar, latency and cost, and with `--write` saves the table to `evals/RESULTS.md`. `--models` and `--effort` compare alternatives on the same set.

### What the design choices bought

- **Transcribe, then parse in code.** The model returns each line as printed and `lib/nutrition/label-fields.ts` turns text into numbers. The rules for `<1g`, `0,8`, `mg` and serving weights are unit tests, which is why the comma-decimal and less-than photos are in the set.
- **A backup model, not retries.** Haiku reads every photo; Sonnet reads only when Haiku errors or returns nothing usable. A clear "not a readable label" from Haiku is final, so refusals cost one call.
- **Cheap by default.** Effort and model are arguments of the eval so a change can be priced and scored before it ships.
