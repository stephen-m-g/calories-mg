import { getDb } from './client';
import type { UserSettings } from '../types/models';

interface UserSettingsRow {
  id: number;
  goal_mode: string;
  calorie_goal: number | null;
  deficit_goal_kcal: number | null;
  protein_goal_g: number | null;
  carbs_goal_g: number | null;
  fat_goal_g: number | null;
  water_goal_ml: number;
  updated_at: string;
}

function rowToUserSettings(row: UserSettingsRow): UserSettings {
  return {
    id: row.id,
    goalMode: row.goal_mode as UserSettings['goalMode'],
    calorieGoal: row.calorie_goal,
    deficitGoalKcal: row.deficit_goal_kcal,
    proteinGoalG: row.protein_goal_g,
    carbsGoalG: row.carbs_goal_g,
    fatGoalG: row.fat_goal_g,
    waterGoalMl: row.water_goal_ml,
    updatedAt: row.updated_at,
  };
}

const DEFAULT_SETTINGS: Omit<UserSettings, 'id' | 'updatedAt'> = {
  goalMode: 'fixed_intake',
  calorieGoal: 2000,
  deficitGoalKcal: null,
  proteinGoalG: 150,
  carbsGoalG: 200,
  fatGoalG: 65,
  waterGoalMl: 2000,
};

export async function ensureDefaultUserSettings(): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<UserSettingsRow>('SELECT * FROM user_settings WHERE id = 1');
  if (existing) return;

  const updatedAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO user_settings (
      id, goal_mode, calorie_goal, deficit_goal_kcal, protein_goal_g, carbs_goal_g, fat_goal_g, water_goal_ml, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    DEFAULT_SETTINGS.goalMode,
    DEFAULT_SETTINGS.calorieGoal,
    DEFAULT_SETTINGS.deficitGoalKcal,
    DEFAULT_SETTINGS.proteinGoalG,
    DEFAULT_SETTINGS.carbsGoalG,
    DEFAULT_SETTINGS.fatGoalG,
    DEFAULT_SETTINGS.waterGoalMl,
    updatedAt
  );
}

export async function getUserSettings(): Promise<UserSettings> {
  const db = await getDb();
  const row = await db.getFirstAsync<UserSettingsRow>('SELECT * FROM user_settings WHERE id = 1');
  if (!row) {
    throw new Error('user_settings row missing — ensureDefaultUserSettings() must run on app start');
  }
  return rowToUserSettings(row);
}

export type UserSettingsUpdate = Partial<Omit<UserSettings, 'id' | 'updatedAt'>>;

export async function updateUserSettings(update: UserSettingsUpdate): Promise<UserSettings> {
  const db = await getDb();
  const current = await getUserSettings();
  const merged: UserSettings = { ...current, ...update, updatedAt: new Date().toISOString() };

  await db.runAsync(
    `UPDATE user_settings SET
      goal_mode = ?, calorie_goal = ?, deficit_goal_kcal = ?, protein_goal_g = ?,
      carbs_goal_g = ?, fat_goal_g = ?, water_goal_ml = ?, updated_at = ?
    WHERE id = 1`,
    merged.goalMode,
    merged.calorieGoal,
    merged.deficitGoalKcal,
    merged.proteinGoalG,
    merged.carbsGoalG,
    merged.fatGoalG,
    merged.waterGoalMl,
    merged.updatedAt
  );

  return merged;
}
