import type { FoodPortion, SearchResultFood } from '../types/search';

// The legacy full-text endpoint (world.openfoodfacts.org/cgi/search.pl) is no longer
// recommended by Open Food Facts for new integrations — it has poor relevance ranking
// and no language weighting, which is exactly what surfaced low-quality/foreign-language
// results. Search-a-licious is their current recommended full-text search service.
const SEARCH_BASE_URL = 'https://search.openfoodfacts.org';
// Single-product-by-barcode lookup is a separate, still-current endpoint.
const PRODUCT_BASE_URL = 'https://world.openfoodfacts.org';

interface OffNutriments {
  'energy-kcal_100g'?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  sodium_100g?: number; // grams
}

/** Search-a-licious hit shape — brands is an array here, unlike the legacy product API. */
interface OffSearchHit {
  code: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string[];
  nutriments?: OffNutriments;
  serving_size?: string;
  serving_quantity?: number | string;
}

interface OffSearchResponse {
  hits: OffSearchHit[];
}

interface OffLegacyProduct {
  code: string;
  product_name?: string;
  brands?: string;
  nutriments?: OffNutriments;
  serving_size?: string;
  serving_quantity?: number | string;
}

type Macros = Pick<SearchResultFood, 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG' | 'sugarG' | 'sodiumMg'>;

function nutrimentsToMacros(n: OffNutriments | undefined): Macros | null {
  if (!n || n['energy-kcal_100g'] == null) return null;
  return {
    calories: n['energy-kcal_100g'],
    proteinG: n.proteins_100g ?? 0,
    carbsG: n.carbohydrates_100g ?? 0,
    fatG: n.fat_100g ?? 0,
    fiberG: n.fiber_100g ?? null,
    sugarG: n.sugars_100g ?? null,
    sodiumMg: n.sodium_100g != null ? n.sodium_100g * 1000 : null,
  };
}

/**
 * The declared serving for a packaged product, as a portion in grams.
 *
 * This is the whole point of scanning a barcode: a cereal's panel says "1 serving = 39 g", and
 * logging 100 g of it because that's the reference basis is simply wrong. OFF exposes the number
 * as `serving_quantity` (already normalized to grams) and the human string as `serving_size`.
 *
 * `serving_quantity` arrives as a string on some records, hence the coercion. When it's missing
 * or unusable, a gram figure is recovered from the display string — "30 g", "2 biscuits (25 g)"
 * and "1 cup (240 ml)" all carry one, and a parenthesised weight beats the leading count.
 */
function parseServingPortion(product: {
  serving_size?: string;
  serving_quantity?: number | string;
}): FoodPortion[] {
  const declared = Number(product.serving_quantity);
  const grams = Number.isFinite(declared) && declared > 0 ? declared : parseGramsFromLabel(product.serving_size);
  if (grams == null) return [];

  // A sanity bound: OFF is crowd-edited and occasionally carries a serving of 0.001 or 5000,
  // which would produce absurd macros if it silently became the default amount.
  if (grams < 1 || grams > 2000) return [];

  return [{ label: describeServing(product.serving_size), gramWeight: grams }];
}

/**
 * The human part of a serving label, with the weight taken out.
 *
 * The weight is rendered separately wherever the portion is shown, so keeping it in the label
 * too produces "39 g (39g)". Stripping a parenthesised weight leaves the descriptive half —
 * "2 biscuits (25 g)" becomes "2 biscuits" — and a label that was *only* a weight has no
 * descriptive half at all, so it falls back to the generic word.
 */
function describeServing(servingSize: string | undefined): string {
  const withoutWeight = (servingSize ?? '').replace(/\(([^)]*)\)/g, '').trim();
  const isBareWeight = /^[\d.]+\s*(?:g|ml|oz)?$/i.test(withoutWeight);
  if (withoutWeight.length === 0 || withoutWeight.length > 40 || isBareWeight) return 'serving';
  return withoutWeight;
}

/** Pulls a gram/millilitre figure out of a serving label. Prefers a parenthesised weight, since
 * "2 biscuits (25 g)" means 25 g rather than 2 of anything. */
function parseGramsFromLabel(label: string | undefined): number | null {
  if (!label) return null;
  const parenthesised = label.match(/\(\s*([\d.]+)\s*(?:g|ml)\b/i);
  const bare = label.match(/([\d.]+)\s*(?:g|ml)\b/i);
  const value = Number((parenthesised ?? bare)?.[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function hitToSearchResult(hit: OffSearchHit): SearchResultFood | null {
  const name = hit.product_name_en || hit.product_name;
  if (!name) return null;
  const macros = nutrimentsToMacros(hit.nutriments);
  if (!macros) return null;

  return {
    source: 'off',
    sourceId: hit.code,
    barcode: hit.code,
    name,
    brand: hit.brands?.[0] ?? null,
    referenceAmount: 100,
    referenceUnit: 'g',
    ...macros,
    // Open Food Facts is a packaged-products database — nothing in it is a generic whole food.
    isGeneric: false,
    portions: parseServingPortion(hit),
  };
}

export async function searchOpenFoodFacts(query: string, pageSize = 15): Promise<SearchResultFood[]> {
  const params = new URLSearchParams({
    q: query,
    // Weights matching toward English-tagged fields — the search API doesn't hard-filter
    // by language, but this meaningfully biases ranking away from foreign-language hits.
    langs: 'en',
    page_size: String(pageSize),
    fields: 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity',
  });
  const url = `${SEARCH_BASE_URL}/search?${params.toString()}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'CalorieTracker - Personal Use' } });
  if (!response.ok) {
    throw new Error(`Open Food Facts search failed: ${response.status}`);
  }
  const data: OffSearchResponse = await response.json();
  return (data.hits ?? []).map(hitToSearchResult).filter((f): f is SearchResultFood => f !== null);
}

export async function lookupOpenFoodFactsBarcode(barcode: string): Promise<SearchResultFood | null> {
  const url = `${PRODUCT_BASE_URL}/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const response = await fetch(url, { headers: { 'User-Agent': 'CalorieTracker - Personal Use' } });
  if (!response.ok) return null;
  const data: { status: number; product?: OffLegacyProduct } = await response.json();
  if (data.status !== 1 || !data.product?.product_name) return null;
  const macros = nutrimentsToMacros(data.product.nutriments);
  if (!macros) return null;

  return {
    source: 'off',
    sourceId: barcode,
    barcode,
    name: data.product.product_name,
    brand: data.product.brands ?? null,
    referenceAmount: 100,
    referenceUnit: 'g',
    ...macros,
    isGeneric: false,
    portions: parseServingPortion(data.product),
  };
}
