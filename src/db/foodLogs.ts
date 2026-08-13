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
  portion_label: string | null;
  portion_gram_weight: number | null;
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
    portionLabel: row.portion_label,
    portionGramWeight: row.portion_gram_weight,
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
      portion_label, portion_gram_weight,
      calories, protein_g, carbs_g, fat_g, input_method, photo_uri, raw_transcript, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    entry.foodId,
    entry.loggedAt,
    entry.mealType,
    entry.quantityAmount,
    entry.quantityUnit,
    entry.portionLabel,
    entry.portionGramWeight,
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

/**
 * How many times a food must have been logged before its history is treated as a habit rather
 * than a coincidence. Two entries could be the same one-off meal logged twice.
 */
const MIN_PORTION_SAMPLES = 3;

/** Portions drift — a year-old habit shouldn't outvote how you've been eating recently. */
const PORTION_WINDOW_DAYS = 180;

/**
 * The user's typical amount for a food, as a median of recent logs. Null until there's enough
 * history to be meaningful.
 *
 * Matched on food *name* rather than `food_id` deliberately: search ranking can resolve the same
 * spoken word to slightly different USDA rows on different days, which would splinter one real
 * habit across several ids and never reach the sample threshold. Unit is part of the key because
 * "2 each" and "150 g" of the same food aren't comparable quantities.
 *
 * Median rather than mean so a single outlier — a holiday portion, a mistyped 1500 — doesn't
 * drag the everyday default with it.
 */
export async function getTypicalQuantity(
  foodName: string,
  unit: string
): Promise<{ amount: number; sampleCount: number } | null> {
  const db = await getDb();
  const since = new Date(Date.now() - PORTION_WINDOW_DAYS * 86400000).toISOString();

  const rows = await db.getAllAsync<{ amount: number }>(
    `SELECT food_logs.quantity_amount AS amount
     FROM food_logs
     JOIN foods ON foods.id = food_logs.food_id
     WHERE LOWER(TRIM(foods.name)) = ?
       AND food_logs.quantity_unit = ?
       AND food_logs.logged_at >= ?
     ORDER BY food_logs.quantity_amount ASC`,
    foodName.trim().toLowerCase(),
    unit,
    since
  );

  if (rows.length < MIN_PORTION_SAMPLES) return null;

  const middle = Math.floor(rows.length / 2);
  const median =
    rows.length % 2 === 0
      ? (rows[middle - 1].amount + rows[middle].amount) / 2
      : rows[middle].amount;

  return { amount: Math.round(median * 10) / 10, sampleCount: rows.length };
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
