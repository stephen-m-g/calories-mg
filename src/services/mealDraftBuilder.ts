import type { ReferenceUnit } from '../types/models';
import type { SearchResultFood } from '../types/search';
import { searchFoods } from './foodSearch';
import { fetchUsdaPortions } from './usdaFdc';
import { getTypicalQuantity } from '../db';
import { nextDraftKey, type DraftItem } from '../state/MealDraftContext';

/** How many ranked database matches to keep as one-tap alternatives on the edit screen. */
const CANDIDATE_COUNT = 4;

export interface AiMealItem {
  food: string;
  quantity: number;
  unit: ReferenceUnit;
  confidence?: number;
  alternatives?: string[];
  /** Whether the amount came from the user rather than the model. Voice sets this from what was
   * actually spoken; photo leaves it undefined, since every photo amount is an estimate — but
   * one made while looking at the plate, which beats a historical average for *this* meal. */
  amountStated?: boolean;
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

  // What this food usually means for this user, when there's enough history to tell.
  const typical = match ? await getTypicalQuantity(match.name, item.unit) : null;

  // Replace the amount only when the model was guessing. A spoken "200 grams" is a fact, and a
  // photo estimate is grounded in the actual plate — neither should lose to an average. A vague
  // "a bowl of rice", though, is a generic guess that the user's own history strictly improves on.
  const useTypical = typical !== null && item.amountStated === false;

  return {
    key: nextDraftKey(keyPrefix),
    originalName: item.food,
    match,
    quantity: useTypical ? typical.amount : item.quantity,
    unit: item.unit,
    confidence: item.confidence ?? null,
    suggestedNames: item.alternatives ?? [],
    // Skip the first result — it's already the selected match, so showing it as an
    // "alternative" would just be a no-op row.
    candidates: results.slice(1, 1 + CANDIDATE_COUNT),
    typicalQuantity: typical?.amount ?? null,
    typicalSampleCount: typical?.sampleCount ?? null,
    typicalApplied: useTypical,
  };
}

export async function buildDraftItems(items: AiMealItem[], keyPrefix: string): Promise<DraftItem[]> {
  return Promise.all(items.map((item) => buildDraftItem(item, keyPrefix)));
}
