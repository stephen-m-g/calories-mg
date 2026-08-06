import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabs } from './BottomTabs';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AddFoodSearchScreen } from '../screens/AddFoodSearchScreen';
import { AddFoodEntryScreen } from '../screens/AddFoodEntryScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator>
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
    </Stack.Navigator>
  );
}
