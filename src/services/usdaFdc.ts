import { env } from '../utils/env';
import type { SearchResultFood } from '../types/search';

const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

interface UsdaNutrient {
  nutrientId: number;
  nutrientName: string;
  value: number;
}

interface UsdaFoodResult {
  fdcId: number;
  description: string;
  brandOwner?: string;
  dataType: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients: UsdaNutrient[];
}

interface UsdaSearchResponse {
  foods: UsdaFoodResult[];
}

const NUTRIENT_NAMES = {
  calories: 'Energy',
  protein: 'Protein',
  carbs: 'Carbohydrate, by difference',
  fat: 'Total lipid (fat)',
  fiber: 'Fiber, total dietary',
  sugar: 'Sugars, total including NLEA',
  sodium: 'Sodium, Na',
} as const;

function findNutrient(nutrients: UsdaNutrient[], name: string): number | null {
  const match = nutrients.find((n) => n.nutrientName === name);
  return match ? match.value : null;
}

function normalizeUnit(unit: string | undefined): SearchResultFood['referenceUnit'] {
  switch (unit?.toLowerCase()) {
    case 'g':
      return 'g';
    case 'ml':
      return 'ml';
    case 'oz':
      return 'oz';
    default:
      return 'g';
  }
}

function toSearchResult(food: UsdaFoodResult): SearchResultFood {
  const useServingSize = food.dataType === 'Branded' && food.servingSize;
  const referenceAmount = useServingSize ? (food.servingSize as number) : 100;
  const referenceUnit = useServingSize ? normalizeUnit(food.servingSizeUnit) : 'g';

  return {
    source: 'usda',
    sourceId: String(food.fdcId),
    barcode: null,
    name: food.description,
    brand: food.brandOwner ?? null,
    referenceAmount,
    referenceUnit,
    calories: findNutrient(food.foodNutrients, NUTRIENT_NAMES.calories) ?? 0,
    proteinG: findNutrient(food.foodNutrients, NUTRIENT_NAMES.protein) ?? 0,
    carbsG: findNutrient(food.foodNutrients, NUTRIENT_NAMES.carbs) ?? 0,
    fatG: findNutrient(food.foodNutrients, NUTRIENT_NAMES.fat) ?? 0,
    fiberG: findNutrient(food.foodNutrients, NUTRIENT_NAMES.fiber),
    sugarG: findNutrient(food.foodNutrients, NUTRIENT_NAMES.sugar),
    sodiumMg: findNutrient(food.foodNutrients, NUTRIENT_NAMES.sodium),
  };
}

export async function searchUsdaFoods(query: string, pageSize = 15): Promise<SearchResultFood[]> {
  if (!env.usdaFdcApiKey) return [];

  const url = `${BASE_URL}/foods/search?query=${encodeURIComponent(query)}&pageSize=${pageSize}&api_key=${env.usdaFdcApiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`USDA FDC search failed: ${response.status}`);
  }
  const data: UsdaSearchResponse = await response.json();
  return (data.foods ?? []).map(toSearchResult);
}
