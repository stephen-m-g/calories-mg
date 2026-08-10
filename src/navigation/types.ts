import type { NavigatorScreenParams } from '@react-navigation/native';
import type { SearchResultFood } from '../types/search';
import type { MealType } from '../types/models';

export type TabParamList = {
  Home: undefined;
  Progress: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Settings: undefined;
  AddFoodSearch: { logDate: string; initialMealType?: MealType };
  AddFoodEntry: { food: SearchResultFood; logDate: string; initialMealType?: MealType };
  AddFoodPhoto: { logDate: string; initialMealType?: MealType };
  AddFoodBarcode: { logDate: string; initialMealType?: MealType };
  AddFoodVoice: { logDate: string; initialMealType?: MealType };
  CreateRecipe: { recipeId?: string } | undefined;
  CreateCustomFood: undefined;
  /** Shared final step for the voice and photo flows. Items live in MealDraftContext rather
   * than params — they hold food objects and are mutated from the edit screen. */
  MealReview: undefined;
  /** itemKey null means "add another food" rather than editing an existing row. */
  MealItemEdit: { itemKey: string | null };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
