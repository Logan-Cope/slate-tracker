/**
 * Pure transform from MenuStat rows (NYC Open Data dataset qgc5-ecnb) to the
 * per-chain menu inputs that `upsertMenu` takes. No DB, no React.
 *
 * A row is kept only when both calories and protein parse as finite,
 * non-negative numbers: protein matters as much as calories in this app, so
 * an item without it is not worth logging. Other macros are optional and
 * become null when missing, non-numeric or negative.
 */
import type { MenuItemInput } from "@/lib/db/queries/restaurants";
import { displayName } from "@/lib/restaurants/aliases";

export type MenuStatRow = Record<string, string | undefined>;

export type MenuStatChain = { name: string; items: MenuItemInput[] };

export type MenuStatReport = {
  rows: number;
  keptRows: number;
  droppedNoCalories: number;
  droppedNoProtein: number;
  droppedNoName: number;
  duplicates: number;
};

export type MenuStatTransform = { chains: MenuStatChain[]; report: MenuStatReport };

/** Finite, non-negative number or null. Blank, missing, non-numeric and negative all map to null. */
function nonNegative(s: string | undefined): number | null {
  if (s === undefined) return null;
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function transformMenuStat(rows: MenuStatRow[]): MenuStatTransform {
  const report: MenuStatReport = { rows: rows.length, keptRows: 0, droppedNoCalories: 0, droppedNoProtein: 0, droppedNoName: 0, duplicates: 0 };
  const byChain = new Map<string, { items: MenuItemInput[]; seen: Set<string> }>();

  for (const row of rows) {
    const kcal = nonNegative(row.calories);
    if (kcal === null) {
      report.droppedNoCalories += 1;
      continue;
    }
    const proteinG = nonNegative(row.protein);
    if (proteinG === null) {
      report.droppedNoProtein += 1;
      continue;
    }
    const name = (row.item_name ?? "").trim();
    if (!name) {
      report.droppedNoName += 1;
      continue;
    }

    const chainName = displayName(row.restaurant ?? "");
    let chain = byChain.get(chainName);
    if (!chain) {
      chain = { items: [], seen: new Set() };
      byChain.set(chainName, chain);
    }
    const key = name.toLowerCase();
    if (chain.seen.has(key)) {
      report.duplicates += 1;
      continue;
    }
    chain.seen.add(key);

    chain.items.push({
      name,
      servingLabel: row.serving_size_household?.trim() || null,
      kcal,
      proteinG,
      carbsG: nonNegative(row.carbohydrates),
      fatG: nonNegative(row.total_fat),
      fiberG: nonNegative(row.dietary_fiber),
    });
    report.keptRows += 1;
  }

  const chains = [...byChain.entries()]
    .map(([name, { items }]) => ({ name, items }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { chains, report };
}
