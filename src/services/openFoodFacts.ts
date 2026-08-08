import type { SearchResultFood } from '../types/search';

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
}

interface OffSearchResponse {
  hits: OffSearchHit[];
}

interface OffLegacyProduct {
  code: string;
  product_name?: string;
  brands?: string;
  nutriments?: OffNutriments;
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
  };
}

export async function searchOpenFoodFacts(query: string, pageSize = 15): Promise<SearchResultFood[]> {
  const params = new URLSearchParams({
    q: query,
    // Weights matching toward English-tagged fields — the search API doesn't hard-filter
    // by language, but this meaningfully biases ranking away from foreign-language hits.
    langs: 'en',
    page_size: String(pageSize),
    fields: 'code,product_name,product_name_en,brands,nutriments',
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
  };
}
