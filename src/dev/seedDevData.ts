/**
 * DEV ONLY — fabricates ~6 months of food and weight logs so the Progress charts can be
 * eyeballed without waiting for real history to accumulate.
 *
 * Every row this writes gets an id prefixed with DEV_ID_PREFIX, so clearDevData() can remove
 * all of it without touching anything genuinely logged. Delete this file (and the Developer
 * section in SettingsScreen) once the charts are verified.
 */
import { getDb } from '../db';
import { todayYmd, shiftYmd } from '../utils/date';
import type { MealType } from '../types/models';

const DEV_ID_PREFIX = 'dev-seed-';
const DAYS_BACK = 180;

/** Deterministic PRNG so repeated seeds produce the same shape — makes visual diffs meaningful. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoAt(ymd: string, hour: number, minute: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0).toISOString();
}

const SEED_FOODS = [
  { name: 'Oatmeal & Berries', calories: 320, proteinG: 11, carbsG: 54, fatG: 7 },
  { name: 'Chicken Rice Bowl', calories: 610, proteinG: 45, carbsG: 62, fatG: 16 },
  { name: 'Salmon & Veg', calories: 540, proteinG: 40, carbsG: 22, fatG: 30 },
  { name: 'Greek Yogurt', calories: 180, proteinG: 18, carbsG: 14, fatG: 5 },
  { name: 'Turkey Sandwich', calories: 470, proteinG: 32, carbsG: 44, fatG: 17 },
];

const MEAL_SLOTS: { meal: MealType; hour: number; minute: number }[] = [
  { meal: 'breakfast', hour: 8, minute: 15 },
  { meal: 'lunch', hour: 12, minute: 45 },
  { meal: 'dinner', hour: 19, minute: 0 },
];

export async function clearDevData(): Promise<void> {
  const db = await getDb();
  const like = `${DEV_ID_PREFIX}%`;
  // food_logs first — foreign_keys is ON, so the foods rows can't go before their referents.
  await db.runAsync('DELETE FROM food_logs WHERE id LIKE ?', like);
  await db.runAsync('DELETE FROM weight_logs WHERE id LIKE ?', like);
  await db.runAsync('DELETE FROM foods WHERE id LIKE ?', like);
}

export async function seedDevData(): Promise<{ foodLogs: number; weightLogs: number }> {
  const db = await getDb();
  await clearDevData();

  const rand = mulberry32(20260807);
  const createdAt = new Date().toISOString();
  const endYmd = todayYmd();
  const startYmd = shiftYmd(endYmd, -DAYS_BACK);

  let foodLogs = 0;
  let weightLogs = 0;

  await db.withTransactionAsync(async () => {
    const foodIds: string[] = [];
    for (let i = 0; i < SEED_FOODS.length; i++) {
      const food = SEED_FOODS[i];
      const id = `${DEV_ID_PREFIX}food-${i}`;
      foodIds.push(id);
      await db.runAsync(
        `INSERT INTO foods (
          id, source, source_id, barcode, name, brand,
          reference_amount, reference_unit, calories, protein_g, carbs_g, fat_g,
          fiber_g, sugar_g, sodium_mg, created_at, last_used_at
        ) VALUES (?, 'custom', NULL, NULL, ?, NULL, 1, 'each', ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL)`,
        id,
        food.name,
        food.calories,
        food.proteinG,
        food.carbsG,
        food.fatG,
        createdAt
      );
    }

    let weight = 196;
    let daysSinceWeighIn = 0;

    for (let ymd = startYmd, day = 0; ymd <= endYmd; ymd = shiftYmd(ymd, 1), day++) {
      // Weigh in every 2-3 days, drifting down with day-to-day noise.
      daysSinceWeighIn++;
      if (daysSinceWeighIn >= (rand() < 0.5 ? 2 : 3)) {
        daysSinceWeighIn = 0;
        weight -= 0.06 + rand() * 0.1;
        const reading = Math.round((weight + (rand() - 0.5) * 1.4) * 10) / 10;
        await db.runAsync(
          'INSERT INTO weight_logs (id, logged_at, weight_lbs) VALUES (?, ?, ?)',
          `${DEV_ID_PREFIX}weight-${day}`,
          isoAt(ymd, 7, 30),
          reading
        );
        weightLogs++;
      }

      // Skip ~12% of days entirely, so the charts exercise their missing-entry handling.
      if (rand() < 0.12) continue;

      const dayTarget = 1900 + rand() * 700;
      const hasSnack = rand() < 0.4;
      const snackCalories = hasSnack ? 150 + rand() * 200 : 0;
      const remaining = dayTarget - snackCalories;

      const breakfast = remaining * (0.25 + rand() * 0.06);
      const lunch = remaining * (0.33 + rand() * 0.06);
      const portions = [breakfast, lunch, remaining - breakfast - lunch];

      const entries = MEAL_SLOTS.map((slot, i) => ({ ...slot, calories: portions[i] }));
      if (hasSnack) {
        entries.push({ meal: 'snack', hour: 15, minute: 30, calories: snackCalories });
      }

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const calories = Math.round(entry.calories);
        await db.runAsync(
          `INSERT INTO food_logs (
            id, food_id, logged_at, meal_type, quantity_amount, quantity_unit,
            calories, protein_g, carbs_g, fat_g, input_method, photo_uri, raw_transcript, created_at
          ) VALUES (?, ?, ?, ?, 1, 'each', ?, ?, ?, ?, 'manual', NULL, NULL, ?)`,
          `${DEV_ID_PREFIX}log-${day}-${i}`,
          foodIds[Math.floor(rand() * foodIds.length)],
          isoAt(ymd, entry.hour, entry.minute),
          entry.meal,
          calories,
          Math.round((calories * 0.25) / 4),
          Math.round((calories * 0.45) / 4),
          Math.round((calories * 0.3) / 9),
          createdAt
        );
        foodLogs++;
      }
    }
  });

  return { foodLogs, weightLogs };
}
