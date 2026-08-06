import type { FoodSource, ReferenceUnit } from './models';

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
}
