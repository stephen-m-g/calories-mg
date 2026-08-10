import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabs } from './BottomTabs';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AddFoodSearchScreen } from '../screens/AddFoodSearchScreen';
import { AddFoodEntryScreen } from '../screens/AddFoodEntryScreen';
import { AddFoodPhotoScreen } from '../screens/AddFoodPhotoScreen';
import { AddFoodBarcodeScreen } from '../screens/AddFoodBarcodeScreen';
import { AddFoodVoiceScreen } from '../screens/AddFoodVoiceScreen';
import { CreateRecipeScreen } from '../screens/CreateRecipeScreen';
import { CreateCustomFoodScreen } from '../screens/CreateCustomFoodScreen';
import { MealReviewScreen } from '../screens/MealReviewScreen';
import { MealItemEditScreen } from '../screens/MealItemEditScreen';
import { MealDraftProvider } from '../state/MealDraftContext';
import { colors, fonts } from '../utils/theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    // Wraps the stack so the review and item-edit routes operate on one shared draft.
    <MealDraftProvider>
      <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontFamily: fonts.medium, color: colors.textMuted },
        headerTintColor: colors.textMuted,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Tabs" component={BottomTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen
        name="AddFoodSearch"
        component={AddFoodSearchScreen}
        options={{ title: 'Add Food', presentation: 'modal' }}
      />
      <Stack.Screen
        name="AddFoodEntry"
        component={AddFoodEntryScreen}
        options={{ title: 'Log Food', presentation: 'modal' }}
      />
      <Stack.Screen name="AddFoodPhoto" component={AddFoodPhotoScreen} options={{ title: 'Photo' }} />
      <Stack.Screen name="AddFoodBarcode" component={AddFoodBarcodeScreen} options={{ title: 'Barcode' }} />
      <Stack.Screen name="AddFoodVoice" component={AddFoodVoiceScreen} options={{ title: 'Voice' }} />
      <Stack.Screen
        name="CreateRecipe"
        component={CreateRecipeScreen}
        options={{ title: 'New Recipe', presentation: 'modal' }}
      />
      <Stack.Screen
        name="CreateCustomFood"
        component={CreateCustomFoodScreen}
        options={{ title: 'New Food', presentation: 'modal' }}
      />
      <Stack.Screen name="MealReview" component={MealReviewScreen} options={{ title: 'Review Meal' }} />
      <Stack.Screen name="MealItemEdit" component={MealItemEditScreen} options={{ title: 'Edit Item' }} />
      </Stack.Navigator>
    </MealDraftProvider>
  );
}
