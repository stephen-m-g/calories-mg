export type FoodSource = 'usda' | 'off' | 'custom' | 'recipe';
export type ReferenceUnit = 'g' | 'ml' | 'oz' | 'each';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type InputMethod = 'manual' | 'voice' | 'photo' | 'barcode';
export type GoalMode = 'fixed_intake' | 'deficit';
export type BackupStatus = 'success' | 'failed';

/** A named serving size for a food, e.g. "1 large" = 50 g. Sourced from USDA portion data or a
 * packaged product's declared serving, and used to log counts ("2 eggs") instead of raw weight. */
export interface FoodPortion {
  label: string;
  gramWeight: number;
}

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
  /** Known serving sizes, persisted so they survive caching. Empty when none are known. */
  portions: FoodPortion[];
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
  /** Which named serving the amount counts, when it isn't a raw weight — "banana", "serving".
   * Null for plain weight/volume entries. */
  portionLabel: string | null;
  /** Grams per portion at the time of logging, snapshotted so a past entry can't shift if the
   * upstream average is revised. */
  portionGramWeight: number | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  inputMethod: InputMethod;
  photoUri: string | null;
  rawTranscript: string | null;
  createdAt: string;
}

export interface Recipe {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  foodId: string;
  quantityAmount: number;
  quantityUnit: ReferenceUnit;
  sortOrder: number;
}

export interface WaterLog {
  id: string;
  loggedAt: string;
  amountMl: number;
}

export interface WeightLog {
  id: string;
  loggedAt: string;
  weightLbs: number;
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

export interface BackupLogEntry {
  id: string;
  backedUpAt: string;
  blobPath: string;
  status: BackupStatus;
}
