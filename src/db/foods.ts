import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import type { Food } from '../types/models';
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
  created_at: string;
  last_used_at: string | null;
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

export type NewFood = Omit<Food, 'id' | 'createdAt' | 'lastUsedAt'>;

export async function createFood(food: NewFood): Promise<Food> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO foods (
      id, source, source_id, barcode, name, brand,
      reference_amount, reference_unit, calories, protein_g, carbs_g, fat_g,
      fiber_g, sugar_g, sodium_mg, created_at, last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    food.source,
    food.sourceId,
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
    createdAt,
    null
  );

  return { ...food, id, createdAt, lastUsedAt: null };
}

/** Looks up a search result's cached row by source+sourceId, caching it if this is the
 * first time it's been picked. Shared by the food-entry flow and the recipe builder. */
export async function findOrCacheFood(food: SearchResultFood): Promise<Food> {
  const existing = await getFoodBySourceId(food.source, food.sourceId);
  if (existing) return existing;
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
  });
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
