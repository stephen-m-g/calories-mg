import type { SearchResultFood } from '../types/search';

const BASE_URL = 'https://world.openfoodfacts.org';

interface OffNutriments {
  'energy-kcal_100g'?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  sodium_100g?: number; // grams
}

interface OffProduct {
  code: string;
  product_name?: string;
  brands?: string;
  nutriments?: OffNutriments;
}

interface OffSearchResponse {
  products: OffProduct[];
}

function toSearchResult(product: OffProduct): SearchResultFood | null {
  if (!product.product_name || !product.nutriments) return null;
  const n = product.nutriments;
  if (n['energy-kcal_100g'] == null) return null;

  return {
    source: 'off',
    sourceId: product.code,
    barcode: product.code,
    name: product.product_name,
    brand: product.brands ?? null,
    referenceAmount: 100,
    referenceUnit: 'g',
    calories: n['energy-kcal_100g'],
    proteinG: n.proteins_100g ?? 0,
    carbsG: n.carbohydrates_100g ?? 0,
    fatG: n.fat_100g ?? 0,
    fiberG: n.fiber_100g ?? null,
    sugarG: n.sugars_100g ?? null,
    sodiumMg: n.sodium_100g != null ? n.sodium_100g * 1000 : null,
  };
}

export async function searchOpenFoodFacts(query: string, pageSize = 15): Promise<SearchResultFood[]> {
  const url = `${BASE_URL}/cgi/search.pl?search_terms=${encodeURIComponent(
    query
  )}&search_simple=1&action=process&json=1&page_size=${pageSize}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'CalorieTracker - Personal Use' } });
  if (!response.ok) {
    throw new Error(`Open Food Facts search failed: ${response.status}`);
  }
  const data: OffSearchResponse = await response.json();
  return (data.products ?? [])
    .map(toSearchResult)
    .filter((f): f is SearchResultFood => f !== null);
}

export async function lookupOpenFoodFactsBarcode(barcode: string): Promise<SearchResultFood | null> {
  const url = `${BASE_URL}/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const response = await fetch(url, { headers: { 'User-Agent': 'CalorieTracker - Personal Use' } });
  if (!response.ok) return null;
  const data: { status: number; product?: OffProduct } = await response.json();
  if (data.status !== 1 || !data.product) return null;
  return toSearchResult({ ...data.product, code: barcode });
}
