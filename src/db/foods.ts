import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import type { Food } from '../types/models';

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

export async function touchFoodLastUsed(id: string, when = new Date().toISOString()): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE foods SET last_used_at = ? WHERE id = ?', when, id);
}
