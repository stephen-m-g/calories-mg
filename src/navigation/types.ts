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
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
