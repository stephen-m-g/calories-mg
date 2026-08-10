import type { ReferenceUnit } from '../types/models';
import type { SearchResultFood } from '../types/search';
import { searchFoods } from './foodSearch';
import { fetchUsdaPortions } from './usdaFdc';
import { nextDraftKey, type DraftItem } from '../state/MealDraftContext';

/** How many ranked database matches to keep as one-tap alternatives on the edit screen. */
const CANDIDATE_COUNT = 4;

export interface AiMealItem {
  food: string;
  quantity: number;
  unit: ReferenceUnit;
  confidence?: number;
  alternatives?: string[];
}

/**
 * A count can't be converted to macros without a serving weight, and USDA only returns those
 * inline for FNDDS foods — so fetch them on demand for anything else before the user sees a total.
 */
export async function withPortions(food: SearchResultFood, unit: ReferenceUnit): Promise<SearchResultFood> {
  if (unit !== 'each' || food.portions.length > 0 || food.source !== 'usda') return food;
  try {
    return { ...food, portions: await fetchUsdaPortions(food.sourceId) };
  } catch {
    // Leave portions empty; the row shows as unresolvable rather than silently logging wrong.
    return food;
  }
}

/** Resolves one AI-named food into a draft row: best match, plus ranked runners-up to swap to. */
export async function buildDraftItem(item: AiMealItem, keyPrefix: string): Promise<DraftItem> {
  const results = await searchFoods(item.food);
  const match = results[0] ? await withPortions(results[0], item.unit) : null;

  return {
    key: nextDraftKey(keyPrefix),
    originalName: item.food,
    match,
    quantity: item.quantity,
    unit: item.unit,
    confidence: item.confidence ?? null,
    suggestedNames: item.alternatives ?? [],
    // Skip the first result — it's already the selected match, so showing it as an
    // "alternative" would just be a no-op row.
    candidates: results.slice(1, 1 + CANDIDATE_COUNT),
  };
}

export async function buildDraftItems(items: AiMealItem[], keyPrefix: string): Promise<DraftItem[]> {
  return Promise.all(items.map((item) => buildDraftItem(item, keyPrefix)));
}
