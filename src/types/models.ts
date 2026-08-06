export type FoodSource = 'usda' | 'off' | 'custom';
export type ReferenceUnit = 'g' | 'ml' | 'oz' | 'each';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type InputMethod = 'manual' | 'voice' | 'photo' | 'barcode';
export type GoalMode = 'fixed_intake' | 'deficit';
export type BackupStatus = 'success' | 'failed';

export interface Food {
  id: string;
  source: FoodSource;
  sourceId: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  referenceAmount: number;
  referenceUnit: ReferenceUnit;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface FoodLog {
  id: string;
  foodId: string;
  loggedAt: string;
  mealType: MealType;
  quantityAmount: number;
  quantityUnit: ReferenceUnit;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  inputMethod: InputMethod;
  photoUri: string | null;
  rawTranscript: string | null;
  createdAt: string;
}

export interface WaterLog {
  id: string;
  loggedAt: string;
  amountMl: number;
}

export interface UserSettings {
  id: number;
  goalMode: GoalMode;
  calorieGoal: number | null;
  deficitGoalKcal: number | null;
  proteinGoalG: number | null;
  carbsGoalG: number | null;
  fatGoalG: number | null;
  waterGoalMl: number;
  updatedAt: string;
}

export interface WhoopConnection {
  id: number;
  connected: boolean;
  whoopUserId: string | null;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
}

export interface WhoopCycleCache {
  id: string;
  cycleDate: string;
  kilojoules: number;
  caloriesBurned: number;
  fetchedAt: string;
}

export interface BackupLogEntry {
  id: string;
  backedUpAt: string;
  blobPath: string;
  status: BackupStatus;
}
