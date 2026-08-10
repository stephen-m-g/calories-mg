import type { ReferenceUnit } from '../types/models';
import type { FoodPortion, SearchResultFood } from '../types/search';

/**
 * Converts a spoken quantity into a multiplier against a food's reference macros.
 *
 * The problem this solves: USDA generic foods are stored per 100 g, but people say counts —
 * "2 hard boiled eggs". Taking the number at face value logged 2 g of egg (2% of a serving).
 * Counts are resolved through USDA's own portion data instead, so "2 each" becomes 2 x 50 g.
 */

const GRAMS_PER_OZ = 28.3495;

// Labels describing a volume or weight rather than a discrete item — "1 cup" is never the right
// answer for "2 eggs", even though USDA lists it alongside the portions that are.
const MEASURE_WORDS = new Set([
  'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
  'fl', 'oz', 'ounce', 'ounces', 'quart', 'quarts', 'pint', 'pints', 'liter', 'liters',
  'litre', 'litres', 'ml', 'g', 'gram', 'grams', 'lb', 'lbs', 'pound', 'pounds', 'kg',
]);

// USDA's stand-in for "a typical serving", used when nothing more specific fits.
const UNSPECIFIED_LABEL = 'quantity not specified';

// Preference order when a portion doesn't name the food itself — a medium item is the fairest
// default for a bare count, since "an apple" implies neither the small nor the extra large one.
const SIZE_WORDS = ['medium', 'large', 'small'];

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+/g) ?? [];
}

/**
 * Picks the portion representing one discrete item. Verified against live USDA data:
 * egg -> "large" (50 g), banana -> "1 banana" (126 g), apple -> "1 medium" (200 g).
 */
export function pickCountPortion(portions: FoodPortion[], foodName: string): FoodPortion | null {
  if (portions.length === 0) return null;

  const named = portions.filter((p) => p.label.trim().toLowerCase() !== UNSPECIFIED_LABEL);
  const discrete = named.filter((p) => !words(p.label).some((w) => MEASURE_WORDS.has(w)));

  // Best case: the portion label names the food itself ("1 banana" for banana).
  const foodWords = new Set(words(foodName));
  const byName = discrete.find((p) => words(p.label).some((w) => foodWords.has(w)));
  if (byName) return byName;

  for (const size of SIZE_WORDS) {
    const bySize = discrete.find((p) => words(p.label).includes(size));
    if (bySize) return bySize;
  }

  if (discrete.length > 0) return discrete[0];
  return portions.find((p) => p.label.trim().toLowerCase() === UNSPECIFIED_LABEL) ?? portions[0];
}

export interface ResolvedQuantity {
  /** Multiplier to apply to the food's per-reference macros. */
  scale: number;
  /** The portion used to resolve a count, when one was needed. */
  portion: FoodPortion | null;
  /** Weight in the food's reference unit, for display. Null when unresolvable. */
  resolvedAmount: number | null;
  /** True when the conversion relied on an assumption the user may want to correct. */
  approximate: boolean;
}

const UNRESOLVED: ResolvedQuantity = {
  scale: 0,
  portion: null,
  resolvedAmount: null,
  approximate: true,
};

/** Converts `quantity` in `unit` into a scale factor against `food`'s reference amount. */
export function resolveQuantity(
  quantity: number,
  unit: ReferenceUnit,
  food: Pick<SearchResultFood, 'name' | 'referenceAmount' | 'referenceUnit' | 'portions'>
): ResolvedQuantity {
  if (!Number.isFinite(quantity) || quantity <= 0 || food.referenceAmount <= 0) {
    return UNRESOLVED;
  }

  const exact = (amount: number, approximate = false): ResolvedQuantity => ({
    scale: amount / food.referenceAmount,
    portion: null,
    resolvedAmount: amount,
    approximate,
  });

  if (unit === food.referenceUnit) return exact(quantity);

  // Everything below converts into the reference unit, which for USDA generics is always grams.
  if (unit === 'oz' && food.referenceUnit === 'g') return exact(quantity * GRAMS_PER_OZ);

  // Water density. Fine for the drinks people actually log this way (milk, juice, coffee),
  // but flagged so the UI can show it as an estimate rather than a measurement.
  if (unit === 'ml' && food.referenceUnit === 'g') return exact(quantity, true);
  if (unit === 'g' && food.referenceUnit === 'ml') return exact(quantity, true);

  if (unit === 'each') {
    const portion = pickCountPortion(food.portions, food.name);
    if (!portion) return UNRESOLVED;
    const grams = quantity * portion.gramWeight;
    return {
      scale: grams / food.referenceAmount,
      portion,
      resolvedAmount: grams,
      // Portion weights are USDA's own averages, not this particular egg.
      approximate: true,
    };
  }

  return UNRESOLVED;
}

/** "2 each" reads badly next to "150g" — show counts as a multiplier instead. */
export function formatQuantity(amount: number, unit: ReferenceUnit): string {
  const rounded = Math.round(amount * 10) / 10;
  return unit === 'each' ? `×${rounded}` : `${rounded}${unit}`;
}
