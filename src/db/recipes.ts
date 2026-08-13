import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import { getFoodBySourceId, createFood, updateCachedFoodMacros } from './foods';
import type { Recipe, RecipeIngredient, ReferenceUnit, Food } from '../types/models';

interface RecipeRow {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

interface RecipeIngredientRow {
  id: string;
  recipe_id: string;
  food_id: string;
  quantity_amount: number;
  quantity_unit: string;
  sort_order: number;
}

function rowToRecipe(row: RecipeRow): Recipe {
  return { id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at };
}

function rowToRecipeIngredient(row: RecipeIngredientRow): RecipeIngredient {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    foodId: row.food_id,
    quantityAmount: row.quantity_amount,
    quantityUnit: row.quantity_unit as ReferenceUnit,
    sortOrder: row.sort_order,
  };
}

export interface NewRecipeIngredient {
  foodId: string;
  quantityAmount: number;
  quantityUnit: ReferenceUnit;
}

export async function createRecipe(name: string, ingredients: NewRecipeIngredient[]): Promise<Recipe> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO recipes (id, name, created_at, last_used_at) VALUES (?, ?, ?, NULL)',
      id,
      name,
      createdAt
    );
    for (let i = 0; i < ingredients.length; i++) {
      const ingredient = ingredients[i];
      await db.runAsync(
        `INSERT INTO recipe_ingredients (id, recipe_id, food_id, quantity_amount, quantity_unit, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        Crypto.randomUUID(),
        id,
        ingredient.foodId,
        ingredient.quantityAmount,
        ingredient.quantityUnit,
        i
      );
    }
  });

  return { id, name, createdAt, lastUsedAt: null };
}

export async function updateRecipe(id: string, name: string, ingredients: NewRecipeIngredient[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE recipes SET name = ? WHERE id = ?', name, id);
    await db.runAsync('DELETE FROM recipe_ingredients WHERE recipe_id = ?', id);
    for (let i = 0; i < ingredients.length; i++) {
      const ingredient = ingredients[i];
      await db.runAsync(
        `INSERT INTO recipe_ingredients (id, recipe_id, food_id, quantity_amount, quantity_unit, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        Crypto.randomUUID(),
        id,
        ingredient.foodId,
        ingredient.quantityAmount,
        ingredient.quantityUnit,
        i
      );
    }
  });
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM recipe_ingredients WHERE recipe_id = ?', id);
    await db.runAsync('DELETE FROM recipes WHERE id = ?', id);
  });
}

export async function getRecipeById(id: string): Promise<Recipe | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<RecipeRow>('SELECT * FROM recipes WHERE id = ?', id);
  return row ? rowToRecipe(row) : null;
}

export async function getAllRecipes(): Promise<Recipe[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<RecipeRow>(
    'SELECT * FROM recipes ORDER BY last_used_at IS NULL, last_used_at DESC, name ASC'
  );
  return rows.map(rowToRecipe);
}

export async function searchRecipesByName(query: string): Promise<Recipe[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<RecipeRow>(
    'SELECT * FROM recipes WHERE name LIKE ? COLLATE NOCASE ORDER BY name ASC',
    `%${query}%`
  );
  return rows.map(rowToRecipe);
}

export async function getRecipeIngredients(recipeId: string): Promise<RecipeIngredient[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<RecipeIngredientRow>(
    'SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order ASC',
    recipeId
  );
  return rows.map(rowToRecipeIngredient);
}

export async function touchRecipeLastUsed(id: string, when = new Date().toISOString()): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE recipes SET last_used_at = ? WHERE id = ?', when, id);
}

export interface RecipeMacros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Computed live from current ingredients + their cached food macros — never stored,
 * so editing a recipe's ingredients is reflected immediately (see PROJECT_PLAN.md §5). */
export async function computeRecipeMacros(recipeId: string): Promise<RecipeMacros> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    quantity_amount: number;
    reference_amount: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>(
    `SELECT ri.quantity_amount, f.reference_amount, f.calories, f.protein_g, f.carbs_g, f.fat_g
     FROM recipe_ingredients ri
     JOIN foods f ON f.id = ri.food_id
     WHERE ri.recipe_id = ?`,
    recipeId
  );

  return rows.reduce<RecipeMacros>(
    (totals, row) => {
      const scale = row.quantity_amount / row.reference_amount;
      return {
        calories: totals.calories + row.calories * scale,
        proteinG: totals.proteinG + row.protein_g * scale,
        carbsG: totals.carbsG + row.carbs_g * scale,
        fatG: totals.fatG + row.fat_g * scale,
      };
    },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
}

/** Refreshes (or creates, on first log) the `foods` cache row backing this recipe, so its
 * macros always reflect the recipe's current ingredients rather than whatever they were
 * the first time it was logged. The resulting food_logs snapshot still stays frozen as usual. */
export async function getOrRefreshRecipeCachedFood(recipeId: string): Promise<Food> {
  const recipe = await getRecipeById(recipeId);
  if (!recipe) {
    throw new Error(`Recipe ${recipeId} not found`);
  }
  const macros = await computeRecipeMacros(recipeId);
  const existing = await getFoodBySourceId('recipe', recipeId);

  if (existing) {
    await updateCachedFoodMacros(existing.id, macros);
    return { ...existing, ...macros };
  }

  return createFood({
    source: 'recipe',
    sourceId: recipeId,
    barcode: null,
    name: recipe.name,
    brand: null,
    referenceAmount: 1,
    referenceUnit: 'each',
    ...macros,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    // A recipe's reference amount is already one serving of itself, so there's no separate
    // named portion to offer.
    portions: [],
  });
}
