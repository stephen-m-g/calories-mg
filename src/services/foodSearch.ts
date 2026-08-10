import { searchUsdaFoods } from './usdaFdc';
import { searchOpenFoodFacts } from './openFoodFacts';
import { rankFoods } from './foodRanking';
import { getRecentFoodNames } from '../db';
import type { SearchResultFood } from '../types/search';

function dedupeKey(food: SearchResultFood): string {
  return `${food.name.trim().toLowerCase()}::${(food.brand ?? '').trim().toLowerCase()}`;
}

/**
 * Queries USDA FDC (generic/whole foods) and Open Food Facts (branded/packaged) in parallel,
 * then merges everything through a single relevance ranking.
 *
 * The previous version interleaved Open Food Facts first, which meant a search for a plain
 * food like "rice" led with branded packages before any generic entry — the opposite of what
 * someone logging a home-cooked meal wants. Ordering is now decided by relevance score rather
 * than by source, so generic foods win plain-name searches while a branded query like
 * "cheerios" can still surface its exact product at the top.
 *
 * A failure in one source doesn't block results from the other.
 */
export async function searchFoods(query: string): Promise<SearchResultFood[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [usdaResult, offResult, recentResult] = await Promise.allSettled([
    searchUsdaFoods(trimmed),
    searchOpenFoodFacts(trimmed),
    getRecentFoodNames(),
  ]);

  const usdaFoods = usdaResult.status === 'fulfilled' ? usdaResult.value : [];
  const offFoods = offResult.status === 'fulfilled' ? offResult.value : [];

  if (usdaResult.status === 'rejected') {
    console.warn('USDA FDC search failed:', usdaResult.reason);
  }
  if (offResult.status === 'rejected') {
    console.warn('Open Food Facts search failed:', offResult.reason);
  }

  const previouslyLogged =
    recentResult.status === 'fulfilled' ? recentResult.value : new Set<string>();

  const seen = new Set<string>();
  const merged: SearchResultFood[] = [];
  for (const food of [...usdaFoods, ...offFoods]) {
    const key = dedupeKey(food);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(food);
  }

  return rankFoods(trimmed, merged, { previouslyLogged });
}
