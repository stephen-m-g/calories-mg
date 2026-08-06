import { searchUsdaFoods } from './usdaFdc';
import { searchOpenFoodFacts } from './openFoodFacts';
import type { SearchResultFood } from '../types/search';

function dedupeKey(food: SearchResultFood): string {
  return `${food.name.trim().toLowerCase()}::${(food.brand ?? '').trim().toLowerCase()}`;
}

/**
 * Queries USDA FDC (strong for generic/whole foods) and Open Food Facts (strong for
 * branded/packaged foods) in parallel, then interleaves and dedupes by name+brand.
 * A failure in one source doesn't block results from the other.
 */
export async function searchFoods(query: string): Promise<SearchResultFood[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [usdaResult, offResult] = await Promise.allSettled([
    searchUsdaFoods(trimmed),
    searchOpenFoodFacts(trimmed),
  ]);

  const usdaFoods = usdaResult.status === 'fulfilled' ? usdaResult.value : [];
  const offFoods = offResult.status === 'fulfilled' ? offResult.value : [];

  if (usdaResult.status === 'rejected') {
    console.warn('USDA FDC search failed:', usdaResult.reason);
  }
  if (offResult.status === 'rejected') {
    console.warn('Open Food Facts search failed:', offResult.reason);
  }

  // Open Food Facts results tend to be branded/packaged; USDA tends to be generic.
  // Interleave OFF-first so packaged-food searches surface exact branded matches quickly,
  // while still keeping generic USDA results close behind.
  const merged: SearchResultFood[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(usdaFoods.length, offFoods.length);

  for (let i = 0; i < maxLen; i++) {
    if (offFoods[i]) {
      const key = dedupeKey(offFoods[i]);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(offFoods[i]);
      }
    }
    if (usdaFoods[i]) {
      const key = dedupeKey(usdaFoods[i]);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(usdaFoods[i]);
      }
    }
  }

  return merged;
}
