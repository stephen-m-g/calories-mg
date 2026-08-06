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
  AddFoodSearch: { initialMealType?: MealType } | undefined;
  AddFoodEntry: { food: SearchResultFood; initialMealType?: MealType };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
