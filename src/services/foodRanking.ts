import type { SearchResultFood } from '../types/search';

/**
 * Relevance scoring for food search results.
 *
 * Exists because USDA FDC's own ranking is close to unusable for a calorie tracker: searching
 * "rice" returns "Dirty rice", "Crackers, rice", "Rice paper" across its entire first page,
 * while the entry a user actually wants — "Rice, cooked, NFS" — sits on page 2. Its ordering
 * correlates with description length rather than relevance, so results are re-ranked here.
 *
 * The core signal is USDA's own naming convention: descriptions read `HeadNoun, qualifier,
 * qualifier` ("Rice, white, cooked"). The head noun is what the food *is*; everything after it
 * narrows it down. So an entry whose head introduces no words the user didn't say is that food,
 * while an entry whose head adds new words is a different dish that merely contains it —
 * which is exactly what separates "Rice, white, cooked" from "Beans and white rice".
 */

// Dropped before matching: they carry no food meaning but would otherwise dilute token overlap.
const STOP_WORDS = new Set(['and', 'or', 'with', 'as', 'the', 'of', 'in', 'to', 'not']);

// FNDDS marks the plain, unspecified version of a food "NFS" (Not Further Specified) — which is
// precisely the sensible default when someone just says "rice" or "oatmeal".
const UNSPECIFIED_MARKERS = new Set(['nfs', 'ns']);

// For a bare food name, the plainest preparation is the right default ("rice" → cooked, not fried).
const PLAIN_PREPARATIONS = new Set(['raw', 'cooked']);

/** Crude singularizer — enough to match "eggs"→"egg" and "bananas"→"banana" without a stemmer. */
function singularize(word: string): string {
  if (word.length > 3 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('es') && !word.endsWith('ses')) return word.slice(0, -2);
  if (word.length > 2 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((w) => !STOP_WORDS.has(w)).map(singularize));
}

function isSubsetOf(inner: Set<string>, outer: Set<string>): boolean {
  for (const value of inner) if (!outer.has(value)) return false;
  return true;
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const value of a) if (b.has(value)) count++;
  return count;
}

export interface RankOptions {
  /**
   * Weight favouring whole/generic foods over packaged products. Sized deliberately: branded
   * names are short marketing strings with no comma structure ("Scrambled Eggs"), so they pick
   * up exact-head bonuses far more easily than USDA's qualified names ("Egg, whole, cooked,
   * scrambled") and would otherwise win plain-food searches. Validated against the live APIs to
   * still let a genuinely branded query win — "cheerios" and "coca cola" both keep their
   * packaged product on top by a wide margin.
   */
  genericBonus?: number;
  /**
   * Names the user has logged before, lowercased. A personal stand-in for the popularity
   * ranking bigger trackers get from crowd data — with one user, "what you picked last time"
   * is the only popularity signal available, and it's a strong one.
   */
  previouslyLogged?: Set<string>;
}

export function scoreFood(query: string, food: SearchResultFood, options: RankOptions = {}): number {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return 0;

  const segments = food.name.split(',');
  const headTokens = tokenize(segments[0]);
  const allTokens = tokenize(food.name);

  const coverage = intersectionSize(queryTokens, allTokens) / queryTokens.size;
  const headCoverage = intersectionSize(queryTokens, headTokens) / queryTokens.size;

  let score = coverage * 100 + headCoverage * 150;

  if (headTokens.size > 0 && isSubsetOf(headTokens, queryTokens)) {
    score += 300;
    // Head matches the query exactly — the most canonical form of what was asked for.
    if (headTokens.size === queryTokens.size) score += 50;
  }

  // Each extra qualifier makes an entry more niche than a bare-name search implies.
  score -= (segments.length - 1) * 8;
  // Words in the head the user never said signal a different food ("Crackers, rice").
  for (const token of headTokens) if (!queryTokens.has(token)) score -= 25;

  const normalizedSegments = segments.map((s) => s.trim().toLowerCase());
  if (normalizedSegments.some((s) => UNSPECIFIED_MARKERS.has(s))) score += 40;
  if (normalizedSegments.some((s) => PLAIN_PREPARATIONS.has(s))) score += 15;

  if (food.isGeneric) score += options.genericBonus ?? 200;
  if (options.previouslyLogged?.has(food.name.trim().toLowerCase())) score += 120;

  return score;
}

export function rankFoods(
  query: string,
  foods: SearchResultFood[],
  options: RankOptions = {}
): SearchResultFood[] {
  return foods
    .map((food, index) => ({ food, index, score: scoreFood(query, food, options) }))
    // index keeps the sort stable so equal-scoring results don't reshuffle between renders.
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.food);
}
