import { env } from '../utils/env';
import type { FoodPortion, SearchResultFood } from '../types/search';

const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

interface UsdaNutrient {
  nutrientId: number;
  nutrientName: string;
  value: number;
}

/** Inline portion data, present on FNDDS/Survey search hits only. */
interface UsdaFoodMeasure {
  disseminationText?: string;
  gramWeight?: number;
}

/** Portion data from the single-food detail endpoint, used by SR Legacy and Foundation foods. */
interface UsdaFoodPortion {
  amount?: number;
  modifier?: string;
  gramWeight?: number;
}

interface UsdaFoodResult {
  fdcId: number;
  description: string;
  brandOwner?: string;
  dataType: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients: UsdaNutrient[];
  foodMeasures?: UsdaFoodMeasure[];
}

interface UsdaSearchResponse {
  foods: UsdaFoodResult[];
}

/**
 * Matched by nutrient ID, not name. SR Legacy foods return *two* nutrients both named "Energy" —
 * one in kJ (id 1062) and one in kcal (id 1008) — and the kJ entry frequently comes first, so
 * name matching silently recorded kilojoules as calories, inflating them by ~4.2x. IDs are also
 * stable across datasets, where display names occasionally are not.
 */
const NUTRIENT_IDS = {
  calories: 1008, // Energy, KCAL — never 1062 (kJ)
  protein: 1003,
  carbs: 1005,
  fat: 1004,
  fiber: 1079,
  sugar: 2000,
  sodium: 1093,
} as const;

function findNutrient(nutrients: UsdaNutrient[], nutrientId: number): number | null {
  const match = nutrients.find((n) => n.nutrientId === nutrientId);
  return match ? match.value : null;
}

function normalizeUnit(unit: string | undefined): SearchResultFood['referenceUnit'] {
  switch (unit?.toLowerCase()) {
    case 'g':
      return 'g';
    case 'ml':
      return 'ml';
    case 'oz':
      return 'oz';
    default:
      return 'g';
  }
}

/**
 * Generic/whole-food datasets only — Branded is deliberately excluded. It's the largest and
 * noisiest of the four (searching "rice" fills the entire first page with distributor-labelled
 * "RICE" products), and Open Food Facts already covers packaged goods with better naming.
 */
const GENERIC_DATA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];

// Verified empirically against the live API: 30 works reliably, while 25 and 50 both returned
// gateway errors. Two pages are fetched because canonical entries are often not on page 1 —
// "Rice, cooked, NFS" sits on page 2 for the query "rice".
const PAGE_SIZE = 30;
const PAGES = 2;

function measuresToPortions(measures: UsdaFoodMeasure[] | undefined): FoodPortion[] {
  return (measures ?? [])
    .filter((m): m is UsdaFoodMeasure & { gramWeight: number } => typeof m.gramWeight === 'number')
    .map((m) => ({ label: (m.disseminationText ?? '').trim(), gramWeight: m.gramWeight }))
    .filter((p) => p.label.length > 0);
}

/**
 * Fetches serving sizes for a single food. Needed because USDA only includes portion data inline
 * on FNDDS search hits — SR Legacy and Foundation foods carry it on the detail endpoint instead,
 * so "1 large egg = 50 g" is unavailable until this is called.
 */
export async function fetchUsdaPortions(fdcId: string): Promise<FoodPortion[]> {
  if (!env.usdaFdcApiKey) return [];
  const response = await fetch(`${BASE_URL}/food/${encodeURIComponent(fdcId)}?api_key=${env.usdaFdcApiKey}`);
  if (!response.ok) return [];

  const data: { foodPortions?: UsdaFoodPortion[]; foodMeasures?: UsdaFoodMeasure[] } =
    await response.json();

  const portions = (data.foodPortions ?? [])
    .filter((p): p is UsdaFoodPortion & { gramWeight: number } => typeof p.gramWeight === 'number')
    .map((p) => ({
      // The detail endpoint splits what FNDDS gives as one string ("1 egg") into an amount and a
      // modifier ("large"), so recombine them into the same human-readable shape.
      label: [p.amount && p.amount !== 1 ? String(p.amount) : '', p.modifier ?? '']
        .filter(Boolean)
        .join(' ')
        .trim(),
      gramWeight: p.gramWeight,
    }))
    .filter((p) => p.label.length > 0);

  return portions.length > 0 ? portions : measuresToPortions(data.foodMeasures);
}

function toSearchResult(food: UsdaFoodResult): SearchResultFood {
  const useServingSize = food.dataType === 'Branded' && food.servingSize;
  const referenceAmount = useServingSize ? (food.servingSize as number) : 100;
  const referenceUnit = useServingSize ? normalizeUnit(food.servingSizeUnit) : 'g';

  return {
    source: 'usda',
    sourceId: String(food.fdcId),
    barcode: null,
    name: food.description,
    brand: food.brandOwner ?? null,
    referenceAmount,
    referenceUnit,
    calories: findNutrient(food.foodNutrients, NUTRIENT_IDS.calories) ?? 0,
    proteinG: findNutrient(food.foodNutrients, NUTRIENT_IDS.protein) ?? 0,
    carbsG: findNutrient(food.foodNutrients, NUTRIENT_IDS.carbs) ?? 0,
    fatG: findNutrient(food.foodNutrients, NUTRIENT_IDS.fat) ?? 0,
    fiberG: findNutrient(food.foodNutrients, NUTRIENT_IDS.fiber),
    sugarG: findNutrient(food.foodNutrients, NUTRIENT_IDS.sugar),
    sodiumMg: findNutrient(food.foodNutrients, NUTRIENT_IDS.sodium),
    isGeneric: food.dataType !== 'Branded',
    portions: measuresToPortions(food.foodMeasures),
  };
}

/** POST rather than GET: the dataType filter has to carry values containing spaces and
 * parentheses ("Survey (FNDDS)"), which the GET endpoint rejects outright with a 400. */
async function searchPage(query: string, pageNumber: number): Promise<UsdaFoodResult[]> {
  const response = await fetch(`${BASE_URL}/foods/search?api_key=${env.usdaFdcApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      dataType: GENERIC_DATA_TYPES,
      pageSize: PAGE_SIZE,
      pageNumber,
    }),
  });
  if (!response.ok) {
    throw new Error(`USDA FDC search failed: ${response.status}`);
  }
  const data: UsdaSearchResponse = await response.json();
  return data.foods ?? [];
}

export async function searchUsdaFoods(query: string): Promise<SearchResultFood[]> {
  if (!env.usdaFdcApiKey) return [];

  const pages = await Promise.all(
    Array.from({ length: PAGES }, (_, i) =>
      // A failed later page shouldn't discard the results already retrieved from page 1.
      searchPage(query, i + 1).catch(() => [] as UsdaFoodResult[])
    )
  );
  return pages.flat().map(toSearchResult);
}
