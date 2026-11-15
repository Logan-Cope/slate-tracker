/** One USDA generic food in the demo's food list (lib/demo/foods.json, built by scripts/make-demo-foods.ts). */
export type DemoFood = {
  fdcId: number;
  source: "fdc_sr" | "fdc_foundation";
  name: string;
  servingLabel: string;
  servingGrams: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  /** Household portions: [label, grams]. */
  servings: [string, number][];
};
