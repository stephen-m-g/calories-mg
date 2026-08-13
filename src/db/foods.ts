import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import type { Food, FoodPortion } from '../types/models';
import type { SearchResultFood } from '../types/search';

interface FoodRow {
  id: string;
  source: string;
  source_id: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  reference_amount: number;
  reference_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  serving_portions: string | null;
  created_at: string;
  last_used_at: string | null;
}

/** Portions are stored as a JSON array rather than a child table — they're a small, always
 * read-whole, never-queried attribute of the food, so a join would buy nothing. Parsing is
 * defensive because the column predates nothing and can hold rows written before it existed. */
function parsePortions(json: string | null): FoodPortion[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is FoodPortion =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as FoodPortion).label === 'string' &&
        typeof (p as FoodPortion).gramWeight === 'number'
    );
  } catch {
    return [];
  }
}

function serializePortions(portions: FoodPortion[]): string | null {
  return portions.length > 0 ? JSON.stringify(portions) : null;
}

function rowToFood(row: FoodRow): Food {
  return {
    id: row.id,
    source: row.source as Food['source'],
    sourceId: row.source_id,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    referenceAmount: row.reference_amount,
    referenceUnit: row.reference_unit as Food['referenceUnit'],
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    fiberG: row.fiber_g,
    sugarG: row.sugar_g,
    sodiumMg: row.sodium_mg,
    portions: parsePortions(row.serving_portions),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export async function getFoodById(id: string): Promise<Food | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<FoodRow>('SELECT * FROM foods WHERE id = ?', id);
  return row ? rowToFood(row) : null;
}

export async function getFoodBySourceId(source: Food['source'], sourceId: string): Promise<Food | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<FoodRow>(
    'SELECT * FROM foods WHERE source = ? AND source_id = ?',
    source,
    sourceId
  );
  return row ? rowToFood(row) : null;
}

export async function getFoodByBarcode(barcode: string): Promise<Food | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<FoodRow>('SELECT * FROM foods WHERE barcode = ?', barcode);
  return row ? rowToFood(row) : null;
}

export async function getRecentFoods(limit = 20): Promise<Food[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FoodRow>(
    'SELECT * FROM foods WHERE last_used_at IS NOT NULL ORDER BY last_used_at DESC LIMIT ?',
    limit
  );
  return rows.map(rowToFood);
}

/** Lowercased names of foods logged before, for search ranking. With a single user, "what you
 * picked last time" is the only popularity signal available — and a reliable one, since people
 * re-eat the same foods constantly. Bigger trackers get this from aggregate crowd data. */
export async function getRecentFoodNames(limit = 300): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string }>(
    'SELECT name FROM foods WHERE last_used_at IS NOT NULL ORDER BY last_used_at DESC LIMIT ?',
    limit
  );
  return new Set(rows.map((r) => r.name.trim().toLowerCase()));
}

export type NewFood = Omit<Food, 'id' | 'createdAt' | 'lastUsedAt'>;

export async function createFood(food: NewFood): Promise<Food> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const createdAt = new Date().toISOString();

  // A user-created food has no upstream database to point at, so it is its own source. Leaving
  // source_id null breaks the round-trip: search results surface custom foods using their local
  // id, and findOrCacheFood then looks them up by (source, source_id) and finds nothing — so
  // every log of a custom food silently inserted another copy of it.
  const sourceId = food.sourceId ?? (food.source === 'custom' ? id : null);

  await db.runAsync(
    `INSERT INTO foods (
      id, source, source_id, barcode, name, brand,
      reference_amount, reference_unit, calories, protein_g, carbs_g, fat_g,
      fiber_g, sugar_g, sodium_mg, serving_portions, created_at, last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    food.source,
    sourceId,
    food.barcode,
    food.name,
    food.brand,
    food.referenceAmount,
    food.referenceUnit,
    food.calories,
    food.proteinG,
    food.carbsG,
    food.fatG,
    food.fiberG,
    food.sugarG,
    food.sodiumMg,
    serializePortions(food.portions),
    createdAt,
    null
  );

  return { ...food, sourceId, id, createdAt, lastUsedAt: null };
}

/** Looks up a search result's cached row by source+sourceId, caching it if this is the
 * first time it's been picked. Shared by the food-entry flow and the recipe builder. */
export async function findOrCacheFood(food: SearchResultFood): Promise<Food> {
  const existing = await getFoodBySourceId(food.source, food.sourceId);
  if (existing) {
    // Rows cached before serving sizes were stored — and rows first cached from a source that
    // hadn't loaded portions yet — carry none. Backfilling on the next encounter repairs them
    // in place, which beats deleting and re-fetching since logs may already reference the row.
    if (existing.portions.length === 0 && food.portions.length > 0) {
      await updateCachedFoodPortions(existing.id, food.portions);
      return { ...existing, portions: food.portions };
    }
    return existing;
  }
  return createFood({
    source: food.source,
    sourceId: food.sourceId,
    barcode: food.barcode,
    name: food.name,
    brand: food.brand,
    referenceAmount: food.referenceAmount,
    referenceUnit: food.referenceUnit,
    calories: food.calories,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatG: food.fatG,
    fiberG: food.fiberG,
    sugarG: food.sugarG,
    sodiumMg: food.sodiumMg,
    portions: food.portions,
  });
}

export async function updateCachedFoodPortions(id: string, portions: FoodPortion[]): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE foods SET serving_portions = ? WHERE id = ?', serializePortions(portions), id);
}

export async function touchFoodLastUsed(id: string, when = new Date().toISOString()): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE foods SET last_used_at = ? WHERE id = ?', when, id);
}

export async function searchFoodsByName(query: string, limit = 20): Promise<Food[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FoodRow>(
    'SELECT * FROM foods WHERE name LIKE ? COLLATE NOCASE ORDER BY last_used_at DESC LIMIT ?',
    `%${query}%`,
    limit
  );
  return rows.map(rowToFood);
}

/** "My Foods" — ingredients the user manually created (name/serving/macros), not
 * anything auto-cached from a USDA/OFF search. */
export async function getCustomFoods(limit = 50): Promise<Food[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FoodRow>(
    "SELECT * FROM foods WHERE source = 'custom' ORDER BY created_at DESC LIMIT ?",
    limit
  );
  return rows.map(rowToFood);
}

export async function searchCustomFoodsByName(query: string, limit = 20): Promise<Food[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FoodRow>(
    "SELECT * FROM foods WHERE source = 'custom' AND name LIKE ? COLLATE NOCASE ORDER BY created_at DESC LIMIT ?",
    `%${query}%`,
    limit
  );
  return rows.map(rowToFood);
}

interface CachedFoodMacros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Unlike USDA/OFF-sourced foods, a recipe-derived cached food isn't immutable — its
 * definition can change, so logging it refreshes the cache rather than reusing stale macros. */
export async function updateCachedFoodMacros(id: string, macros: CachedFoodMacros): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE foods SET calories = ?, protein_g = ?, carbs_g = ?, fat_g = ? WHERE id = ?',
    macros.calories,
    macros.proteinG,
    macros.carbsG,
    macros.fatG,
    id
  );
}
