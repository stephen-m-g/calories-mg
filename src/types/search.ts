import type { FoodSource, ReferenceUnit } from './models';

/** A named serving size for a food, e.g. "1 large" = 50 g. Sourced from USDA portion data and
 * used to turn a spoken count ("2 eggs") into a real weight. */
export interface FoodPortion {
  label: string;
  gramWeight: number;
}

/** A food search result, normalized from either USDA FDC or Open Food Facts, before it's cached into `foods`. */
export interface SearchResultFood {
  source: FoodSource;
  sourceId: string;
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
  /** True for whole/unbranded foods (USDA Foundation, SR Legacy, FNDDS). Drives search ranking
   * and the "Generic" label — packaged products from Open Food Facts are always false. */
  isGeneric: boolean;
  /** Known serving sizes. Often empty: USDA only returns these inline for FNDDS foods, so for
   * others they're fetched on demand (see `fetchUsdaPortions`). */
  portions: FoodPortion[];
}
