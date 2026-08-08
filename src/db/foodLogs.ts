import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import type { FoodLog } from '../types/models';

interface FoodLogRow {
  id: string;
  food_id: string;
  logged_at: string;
  meal_type: string;
  quantity_amount: number;
  quantity_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  input_method: string;
  photo_uri: string | null;
  raw_transcript: string | null;
  created_at: string;
}

function rowToFoodLog(row: FoodLogRow): FoodLog {
  return {
    id: row.id,
    foodId: row.food_id,
    loggedAt: row.logged_at,
    mealType: row.meal_type as FoodLog['mealType'],
    quantityAmount: row.quantity_amount,
    quantityUnit: row.quantity_unit as FoodLog['quantityUnit'],
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    inputMethod: row.input_method as FoodLog['inputMethod'],
    photoUri: row.photo_uri,
    rawTranscript: row.raw_transcript,
    createdAt: row.created_at,
  };
}

export type NewFoodLog = Omit<FoodLog, 'id' | 'createdAt'>;

export async function createFoodLog(entry: NewFoodLog): Promise<FoodLog> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO food_logs (
      id, food_id, logged_at, meal_type, quantity_amount, quantity_unit,
      calories, protein_g, carbs_g, fat_g, input_method, photo_uri, raw_transcript, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    entry.foodId,
    entry.loggedAt,
    entry.mealType,
    entry.quantityAmount,
    entry.quantityUnit,
    entry.calories,
    entry.proteinG,
    entry.carbsG,
    entry.fatG,
    entry.inputMethod,
    entry.photoUri,
    entry.rawTranscript,
    createdAt
  );

  return { ...entry, id, createdAt };
}

export async function getFoodLogsBetween(startIso: string, endIso: string): Promise<FoodLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FoodLogRow>(
    'SELECT * FROM food_logs WHERE logged_at >= ? AND logged_at < ? ORDER BY logged_at ASC',
    startIso,
    endIso
  );
  return rows.map(rowToFoodLog);
}

export type FoodLogWithFoodName = FoodLog & { foodName: string };

/** Same as getFoodLogsBetween, but joins `foods` for display purposes (current cached name, not a snapshot). */
export async function getFoodLogsWithNamesBetween(
  startIso: string,
  endIso: string
): Promise<FoodLogWithFoodName[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FoodLogRow & { food_name: string }>(
    `SELECT food_logs.*, foods.name AS food_name
     FROM food_logs
     JOIN foods ON foods.id = food_logs.food_id
     WHERE food_logs.logged_at >= ? AND food_logs.logged_at < ?
     ORDER BY food_logs.logged_at ASC`,
    startIso,
    endIso
  );
  return rows.map((row) => ({ ...rowToFoodLog(row), foodName: row.food_name }));
}

export async function deleteFoodLog(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM food_logs WHERE id = ?', id);
}

export async function getEarliestLoggedAt(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ earliest: string | null }>(
    'SELECT MIN(logged_at) AS earliest FROM food_logs'
  );
  return row?.earliest ?? null;
}

export async function hasFoodLogsBetween(startIso: string, endIso: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ found: number }>(
    'SELECT EXISTS(SELECT 1 FROM food_logs WHERE logged_at >= ? AND logged_at < ?) AS found',
    startIso,
    endIso
  );
  return row?.found === 1;
}
