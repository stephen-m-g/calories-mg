import type { FoodPortion, ReferenceUnit } from '../types/models';
import type { SearchResultFood } from '../types/search';
import { pickCountPortion } from './quantity';
import { fetchUsdaPortions } from './usdaFdc';

/**
 * Turns a food's known serving sizes into the set of amounts a person can actually pick.
 *
 * The problem this solves: every food was logged in its raw reference unit, which for USDA
 * generics and Open Food Facts products alike is 100 g. So a scanned cereal opened at "100 g"
 * rather than its declared 39 g serving, and a banana had to be logged as 126 grams rather than
 * as one banana. Both are the same underlying gap — the reference basis was being treated as
 * the serving, when it's only the denominator the macros happen to be quoted against.
 */

/** How many named portions to surface. Enough to cover "1 banana / 1 cup sliced", short enough
 * that the row stays scannable and doesn't wrap into a wall of near-identical USDA measures. */
const MAX_PORTION_OPTIONS = 3;

/**
 * Fills in serving sizes a food doesn't carry yet. USDA only returns portions inline for FNDDS
 * search hits, so a Foundation or SR Legacy food ("Bananas, raw") arrives with none and has to
 * be asked for separately before "1 banana" can be offered at all.
 *
 * Failure is silent by design: no portions simply means the food is logged by weight, which is
 * still correct — just less convenient than the alternative.
 */
export async function ensurePortions(food: SearchResultFood): Promise<SearchResultFood> {
  if (food.portions.length > 0 || food.source !== 'usda') return food;
  try {
    return { ...food, portions: await fetchUsdaPortions(food.sourceId) };
  } catch {
    return food;
  }
}

export type ServingOption =
  /** Counting named servings — quantity is "how many bananas". */
  | { kind: 'portion'; label: string; gramWeight: number }
  /** Raw weight or volume in the food's own reference unit. */
  | { kind: 'unit'; unit: ReferenceUnit };

/**
 * Trims the redundant leading count off an upstream serving label.
 *
 * USDA states portions inconsistently — "1 banana" and "1 cup, sliced" carry the count inline,
 * while "large" and "medium" don't. Left alone, counting two of the first kind renders as
 * "2 × 1 banana". Dropping a leading "1 " makes every label a bare unit that a count reads
 * naturally against; anything other than 1 is part of the measure itself ("2 tbsp") and stays.
 */
export function normalizePortionLabel(label: string): string {
  return label.trim().replace(/^1\s+/, '');
}

export function optionKey(option: ServingOption): string {
  return option.kind === 'portion' ? `portion:${option.label}` : `unit:${option.unit}`;
}

/** How the option reads on a chip: "1 banana (126g)", or just "g". */
export function optionLabel(option: ServingOption): string {
  if (option.kind === 'unit') return option.unit;
  return `${option.label} (${Math.round(option.gramWeight)}g)`;
}

/**
 * The pickable amounts for a food, best-default first.
 *
 * Ordering matters: whatever lands at index 0 becomes the opening selection, so the most
 * human answer has to win. A named portion beats raw weight, and among portions the one
 * describing a single item of the food itself beats an arbitrary measure — `pickCountPortion`
 * already encodes that judgement, so it picks the leader rather than a second rule diverging
 * from it.
 */
export function buildServingOptions(food: {
  name: string;
  referenceUnit: ReferenceUnit;
  portions: FoodPortion[];
}): ServingOption[] {
  const usable = food.portions.filter((p) => p.gramWeight > 0 && p.label.trim().length > 0);

  // A food whose reference unit is already a count ("1 recipe") has nothing to convert.
  if (food.referenceUnit === 'each') return [{ kind: 'unit', unit: 'each' }];

  const best = usable.length > 0 ? pickCountPortion(usable, food.name) : null;
  const ordered = best ? [best, ...usable.filter((p) => p !== best)] : usable;

  const seen = new Set<string>();
  const portionOptions: ServingOption[] = [];
  for (const portion of ordered) {
    const label = normalizePortionLabel(portion.label);
    if (label.length === 0) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    portionOptions.push({ kind: 'portion', label, gramWeight: portion.gramWeight });
    if (portionOptions.length === MAX_PORTION_OPTIONS) break;
  }

  return [...portionOptions, { kind: 'unit', unit: food.referenceUnit }];
}

/** The amount a food opens on. One serving when there is one, else one reference amount —
 * never a bare 100 g just because that's the basis the macros are quoted against. */
export function defaultQuantityFor(option: ServingOption, referenceAmount: number): number {
  return option.kind === 'portion' ? 1 : referenceAmount;
}

/** Multiplier against the food's per-reference macros for `quantity` of `option`. */
export function scaleFor(
  quantity: number,
  option: ServingOption,
  food: { referenceAmount: number }
): number {
  if (!Number.isFinite(quantity) || quantity <= 0 || food.referenceAmount <= 0) return 0;
  const amount = option.kind === 'portion' ? quantity * option.gramWeight : quantity;
  return amount / food.referenceAmount;
}

/** The quantity columns a log should carry for this selection. Counting a named portion stores
 * the count with its label and the gram weight used, so the entry can be read back as
 * "2 banana" and still be recomputed exactly. */
export function quantityFieldsFor(
  quantity: number,
  option: ServingOption,
  food: { referenceUnit: ReferenceUnit }
): {
  quantityAmount: number;
  quantityUnit: ReferenceUnit;
  portionLabel: string | null;
  portionGramWeight: number | null;
} {
  if (option.kind === 'portion') {
    return {
      quantityAmount: quantity,
      quantityUnit: 'each',
      portionLabel: option.label,
      portionGramWeight: option.gramWeight,
    };
  }
  return {
    quantityAmount: quantity,
    quantityUnit: food.referenceUnit,
    portionLabel: null,
    portionGramWeight: null,
  };
}
