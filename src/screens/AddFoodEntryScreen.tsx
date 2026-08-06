import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { MealType } from '../types/models';
import { getFoodBySourceId, createFood, touchFoodLastUsed, createFoodLog } from '../db';

type Props = NativeStackScreenProps<RootStackParamList, 'AddFoodEntry'>;

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function AddFoodEntryScreen({ route, navigation }: Props) {
  const { food, initialMealType } = route.params;
  const [quantity, setQuantity] = useState(String(food.referenceAmount));
  const [mealType, setMealType] = useState<MealType>(initialMealType ?? 'breakfast');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedQuantity = Number(quantity);
  const validQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0;
  const scale = validQuantity ? parsedQuantity / food.referenceAmount : 0;

  const previewCalories = Math.round(food.calories * scale);
  const previewProtein = Math.round(food.proteinG * scale);
  const previewCarbs = Math.round(food.carbsG * scale);
  const previewFat = Math.round(food.fatG * scale);

  async function handleSave() {
    if (!validQuantity) return;
    setSaving(true);
    setError(null);
    try {
      let cachedFood = await getFoodBySourceId(food.source, food.sourceId);
      if (!cachedFood) {
        cachedFood = await createFood({
          source: food.source,
          sourceId: food.sourceId,
          barcode: food.barcode,
          name: food.name,
          brand: food.brand,
          referenceAmount: food.referenceAmount,
          referenceUnit: food.referenceUnit,
          calories: food.calories,
          proteinG: food.proteinG,
          carbsG: food.carbsG,
          fatG: food.fatG,
          fiberG: food.fiberG,
          sugarG: food.sugarG,
          sodiumMg: food.sodiumMg,
        });
      }

      await createFoodLog({
        foodId: cachedFood.id,
        loggedAt: new Date().toISOString(),
        mealType,
        quantityAmount: parsedQuantity,
        quantityUnit: food.referenceUnit,
        calories: previewCalories,
        proteinG: previewProtein,
        carbsG: previewCarbs,
        fatG: previewFat,
        inputMethod: 'manual',
        photoUri: null,
        rawTranscript: null,
      });

      await touchFoodLastUsed(cachedFood.id);

      navigation.popToTop();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Text style={styles.foodName}>{food.name}</Text>
      {food.brand && <Text style={styles.foodBrand}>{food.brand}</Text>}

      <View style={styles.field}>
        <Text style={styles.label}>Quantity ({food.referenceUnit})</Text>
        <TextInput
          style={styles.input}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Meal</Text>
        <View style={styles.mealRow}>
          {MEAL_TYPES.map((type) => (
            <Pressable
              key={type}
              style={[styles.mealChip, mealType === type && styles.mealChipActive]}
              onPress={() => setMealType(type)}
            >
              <Text style={[styles.mealChipText, mealType === type && styles.mealChipTextActive]}>
                {type[0].toUpperCase() + type.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.preview}>
        <Text style={styles.previewCalories}>{validQuantity ? previewCalories : '—'} kcal</Text>
        <Text style={styles.previewMacros}>
          P {validQuantity ? previewProtein : '—'}g · C {validQuantity ? previewCarbs : '—'}g · F{' '}
          {validQuantity ? previewFat : '—'}g
        </Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.saveButton, (!validQuantity || saving) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!validQuantity || saving}
      >
        <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  foodName: { fontSize: 20, fontWeight: '600' },
  foodBrand: { color: '#6b7280', marginTop: -12 },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  mealRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  mealChip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  mealChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  mealChipText: { color: '#374151' },
  mealChipTextActive: { color: 'white', fontWeight: '600' },
  preview: {
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 4,
  },
  previewCalories: { fontSize: 28, fontWeight: '700' },
  previewMacros: { color: '#6b7280' },
  error: { color: '#dc2626', textAlign: 'center' },
  saveButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
