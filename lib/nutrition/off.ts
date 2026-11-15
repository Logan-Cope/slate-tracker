/**
 * Open Food Facts: barcode fallback for products missing from the USDA import.
 * Reads are free; OFF asks for an identifying User-Agent. Results are cached
 * into our `foods` table by the caller.
 */
export type OffFood = {
  upc: string;
  name: string;
  brand: string | null;
  servingLabel: string;
  servingGrams: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
};

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

function num(v: number | string | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Pure: turns an OFF product JSON into our food shape, or null when unusable. */
export function parseOffProduct(json: unknown): OffFood | null {
  const root = json as { status?: number; product?: OffProduct } | null;
  const p = root?.product;
  if (!p || root?.status === 0) return null;
  const name = (p.product_name_en || p.product_name || "").trim();
  if (!name) return null;
  const n = p.nutriments ?? {};
  const kcal100 = num(n["energy-kcal_100g"]) ?? (num(n["energy_100g"]) !== null ? num(n["energy_100g"])! / 4.184 : null);
  if (kcal100 === null) return null;

  const servingQty = num(p.serving_quantity);
  const servingGrams = servingQty && servingQty > 0 ? servingQty : null;
  const factor = servingGrams ? servingGrams / 100 : 1;
  const per = (key: string): number | null => {
    const v = num(n[`${key}_100g`]);
    return v === null ? null : v * factor;
  };
  const sizeText = (p.serving_size ?? "").trim();
  const servingLabel = servingGrams ? (sizeText || `${servingGrams} g`) : "100 g";
  const code = (p.code ?? "").replace(/\D/g, "").replace(/^0+/, "");

  return {
    upc: code,
    name,
    brand: p.brands ? p.brands.split(",")[0]!.trim() || null : null,
    servingLabel,
    servingGrams: servingGrams ?? 100,
    kcal: kcal100 * factor,
    proteinG: per("proteins") ?? 0,
    carbsG: per("carbohydrates"),
    fatG: per("fat"),
    fiberG: per("fiber"),
  };
}

export async function fetchOffProduct(code: string, fetchImpl: typeof fetch = fetch): Promise<OffFood | null> {
  const digits = code.replace(/\D/g, "");
  if (digits.length < 6) return null;
  const url = `https://world.openfoodfacts.org/api/v2/product/${digits}.json?fields=code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments`;
  const res = await fetchImpl(url, {
    headers: { "User-Agent": process.env.OFF_USER_AGENT ?? "SlateTracker/0.1 (+https://github.com/Logan-Cope/slate-tracker)" },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
  return parseOffProduct(await res.json());
}
