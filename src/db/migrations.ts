import type { SQLiteDatabase } from 'expo-sqlite';

export interface Migration {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS foods (
          id TEXT PRIMARY KEY NOT NULL,
          source TEXT NOT NULL,
          source_id TEXT,
          barcode TEXT,
          name TEXT NOT NULL,
          brand TEXT,
          reference_amount REAL NOT NULL,
          reference_unit TEXT NOT NULL,
          calories REAL NOT NULL,
          protein_g REAL NOT NULL,
          carbs_g REAL NOT NULL,
          fat_g REAL NOT NULL,
          fiber_g REAL,
          sugar_g REAL,
          sodium_mg REAL,
          created_at TEXT NOT NULL,
          last_used_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods(barcode);

        CREATE TABLE IF NOT EXISTS food_logs (
          id TEXT PRIMARY KEY NOT NULL,
          food_id TEXT NOT NULL REFERENCES foods(id),
          logged_at TEXT NOT NULL,
          meal_type TEXT NOT NULL,
          quantity_amount REAL NOT NULL,
          quantity_unit TEXT NOT NULL,
          calories REAL NOT NULL,
          protein_g REAL NOT NULL,
          carbs_g REAL NOT NULL,
          fat_g REAL NOT NULL,
          input_method TEXT NOT NULL,
          photo_uri TEXT,
          raw_transcript TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_food_logs_logged_at ON food_logs(logged_at);
        CREATE INDEX IF NOT EXISTS idx_food_logs_food_id ON food_logs(food_id);

        CREATE TABLE IF NOT EXISTS water_logs (
          id TEXT PRIMARY KEY NOT NULL,
          logged_at TEXT NOT NULL,
          amount_ml REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_water_logs_logged_at ON water_logs(logged_at);

        CREATE TABLE IF NOT EXISTS user_settings (
          id INTEGER PRIMARY KEY NOT NULL,
          goal_mode TEXT NOT NULL,
          calorie_goal REAL,
          deficit_goal_kcal REAL,
          protein_goal_g REAL,
          carbs_goal_g REAL,
          fat_goal_g REAL,
          water_goal_ml REAL NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS whoop_connection (
          id INTEGER PRIMARY KEY NOT NULL,
          connected INTEGER NOT NULL DEFAULT 0,
          whoop_user_id TEXT,
          token_expires_at TEXT,
          last_synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS whoop_cycle_cache (
          id TEXT PRIMARY KEY NOT NULL,
          cycle_date TEXT NOT NULL,
          kilojoules REAL NOT NULL,
          calories_burned REAL NOT NULL,
          fetched_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_whoop_cycle_cache_date ON whoop_cycle_cache(cycle_date);

        CREATE TABLE IF NOT EXISTS backup_log (
          id TEXT PRIMARY KEY NOT NULL,
          backed_up_at TEXT NOT NULL,
          blob_path TEXT NOT NULL,
          status TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS recipes (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_used_at TEXT
        );

        CREATE TABLE IF NOT EXISTS recipe_ingredients (
          id TEXT PRIMARY KEY NOT NULL,
          recipe_id TEXT NOT NULL REFERENCES recipes(id),
          food_id TEXT NOT NULL REFERENCES foods(id),
          quantity_amount REAL NOT NULL,
          quantity_unit TEXT NOT NULL,
          sort_order INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
      `);
    },
  },
  {
    version: 3,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS weight_logs (
          id TEXT PRIMARY KEY NOT NULL,
          logged_at TEXT NOT NULL,
          weight_lbs REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_weight_logs_logged_at ON weight_logs(logged_at);
      `);
    },
  },
  {
    version: 4,
    up: async (db) => {
      // Cached USDA rows written before the kcal fix may hold kilojoules in `calories` (~4.2x
      // too high): SR Legacy foods return two nutrients named "Energy" and the old name-based
      // lookup could pick the kJ one. `foods` is only a cache, so dropping the affected rows
      // makes them re-fetch correctly on next use.
      //
      // Rows still referenced by a food_log are left alone — deleting them would break the
      // foreign key, and those logs keep their own macro snapshots either way. Past logs made
      // with inflated values stay wrong; only re-caching is repaired here.
      await db.execAsync(`
        DELETE FROM foods
        WHERE source = 'usda'
          AND id NOT IN (SELECT DISTINCT food_id FROM food_logs)
          AND id NOT IN (SELECT DISTINCT food_id FROM recipe_ingredients);
      `);
    },
  },
];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = result?.user_version ?? 0;

  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      await migration.up(db);
    });
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    currentVersion = migration.version;
  }
}
