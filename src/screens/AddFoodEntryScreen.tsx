import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { MealType } from '../types/models';
import {
  findOrCacheFood,
  getOrRefreshRecipeCachedFood,
  touchFoodLastUsed,
  createFoodLog,
  computeRecipeMacros,
  getTypicalQuantity,
} from '../db';
import {
  buildServingOptions,
  defaultQuantityFor,
  ensurePortions,
  optionKey,
  optionLabel,
  quantityFieldsFor,
  scaleFor,
  type ServingOption,
} from '../services/servings';
import { colors, fonts, mealTheme } from '../utils/theme';
import { formatHeaderDate, loggedAtIso, todayYmd } from '../utils/date';

type Props = NativeStackScreenProps<RootStackParamList, 'AddFoodEntry'>;

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function AddFoodEntryScreen({ route, navigation }: Props) {
  const { initialMealType, logDate } = route.params;
  const [food, setFood] = useState(route.params.food);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<string | null>(null);
  // Non-null once history shows a habit for this food; drives the prefill and the note below it.
  const [typical, setTypical] = useState<{ amount: number; sampleCount: number } | null>(null);
  const [mealType, setMealType] = useState<MealType>(initialMealType ?? 'breakfast');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => buildServingOptions(food), [food]);
  // Falls back to the leading option, which is the best serving the food knows about — so before
  // anything has loaded the screen still opens on something sensible rather than a raw 100 g.
  const selected = options.find((o) => optionKey(o) === selectedKey) ?? options[0];

  // USDA generics arrive without portions (they're only inline on FNDDS hits), so "1 banana"
  // isn't offered until they're fetched. Doing it here means the picker fills in shortly after
  // the screen opens rather than requiring the user to go hunting for a count unit.
  useEffect(() => {
    let cancelled = false;
    ensurePortions(food).then((withServings) => {
      if (cancelled || withServings.portions.length === food.portions.length) return;
      setFood(withServings);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A reference amount is a denominator, not a serving — opening on it meant every scanned
  // product started at 100 g regardless of what its own label said. Once a food has been logged
  // enough times the user's own habit beats even the declared serving, so history wins when it
  // exists. Only fills a quantity the user hasn't touched.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const unit = selected.kind === 'portion' ? 'each' : selected.unit;
    getTypicalQuantity(food.name, unit).then((result) => {
      if (cancelled) return;
      setTypical(result);
      setQuantity((current) => current ?? String(result?.amount ?? defaultQuantityFor(selected, food.referenceAmount)));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, food.name, options.length]);

  function selectOption(option: ServingOption) {
    // Switching between "bananas" and "grams" makes the number on screen meaningless, so it's
    // reset to that option's own default rather than reinterpreted as the new unit.
    setSelectedKey(optionKey(option));
    setQuantity(String(defaultQuantityFor(option, food.referenceAmount)));
    setTypical(null);
  }

  // Recipes aren't immutable — if the user edits one (via the link below) and comes
  // back, refresh the displayed macros rather than showing what's now a stale preview.
  useFocusEffect(
    useCallback(() => {
      if (food.source !== 'recipe') return;
      computeRecipeMacros(food.sourceId).then((macros) => {
        setFood((prev) => ({ ...prev, ...macros }));
      });
    }, [food.source, food.sourceId])
  );

  const parsedQuantity = Number(quantity ?? '');
  const validQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0;
  const scale = selected && validQuantity ? scaleFor(parsedQuantity, selected, food) : 0;

  const previewCalories = Math.round(food.calories * scale);
  const previewProtein = Math.round(food.proteinG * scale);
  const previewCarbs = Math.round(food.carbsG * scale);
  const previewFat = Math.round(food.fatG * scale);

  async function handleSave() {
    if (!validQuantity || !selected) return;
    setSaving(true);
    setError(null);
    try {
      // Recipes aren't immutable like USDA/OFF foods — their own definition can change,
      // so logging one refreshes the cached macros instead of reusing a stale snapshot.
      const cachedFood =
        food.source === 'recipe' ? await getOrRefreshRecipeCachedFood(food.sourceId) : await findOrCacheFood(food);

      await createFoodLog({
        foodId: cachedFood.id,
        loggedAt: loggedAtIso(logDate),
        mealType,
        ...quantityFieldsFor(parsedQuantity, selected, food),
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
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.foodName}>{food.name}</Text>
          {food.brand && <Text style={styles.foodBrand}>{food.brand}</Text>}
          {logDate !== todayYmd() && (
            <Text style={styles.loggingForDate}>Logging for {formatHeaderDate(logDate)}</Text>
          )}
        </View>
        {food.source === 'recipe' && (
          <Pressable onPress={() => navigation.navigate('CreateRecipe', { recipeId: food.sourceId })}>
            <Text style={styles.editLink}>Edit recipe</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Amount</Text>
        <View style={styles.amountRow}>
          <TextInput
            style={[styles.input, styles.quantityInput]}
            value={quantity ?? ''}
            onChangeText={setQuantity}
            keyboardType="numeric"
          />
          <View style={styles.optionChips}>
            {options.map((option) => {
              const key = optionKey(option);
              const active = selected != null && optionKey(selected) === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.optionChip, active && styles.optionChipActive]}
                  onPress={() => selectOption(option)}
                >
                  <Text
                    style={[styles.optionChipText, active && styles.optionChipTextActive]}
                    numberOfLines={1}
                  >
                    {optionLabel(option)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {/* Counting servings hides the weight being logged, which is the number that actually
            drives the macros — so it's spelled out rather than left to be inferred. */}
        {selected?.kind === 'portion' && validQuantity && (
          <Text style={styles.resolvedNote}>
            {Math.round(parsedQuantity * selected.gramWeight)}
            {food.referenceUnit} total
          </Text>
        )}
        {typical && (
          <Text style={styles.typicalNote}>
            Your usual amount, from {typical.sampleCount} past logs
          </Text>
        )}
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
  container: { flex: 1, backgroundColor: colors.background, padding: 16, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  headerText: { flex: 1 },
  editLink: { fontFamily: fonts.medium, color: mealTheme.dinner.border, fontSize: 14 },
  foodName: { fontFamily: fonts.medium, fontSize: 20, color: colors.text },
  foodBrand: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted },
  loggingForDate: { fontFamily: fonts.medium, fontSize: 13, color: mealTheme.dinner.border, marginTop: 2 },
  typicalNote: { fontFamily: fonts.regular, fontSize: 12, color: 'rgba(127, 94, 87, 0.8)' },
  resolvedNote: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  field: { gap: 8 },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
  input: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  quantityInput: { width: 84 },
  optionChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  optionChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexShrink: 1,
  },
  optionChipActive: { backgroundColor: colors.textMuted },
  optionChipText: { fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  optionChipTextActive: { fontFamily: fonts.medium, color: '#FFFFFF' },
  mealRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  mealChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  mealChipActive: { backgroundColor: colors.textMuted },
  mealChipText: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  mealChipTextActive: { fontFamily: fonts.medium, color: '#FFFFFF' },
  preview: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 4,
  },
  previewCalories: { fontFamily: fonts.extraBold, fontSize: 28, color: colors.text },
  previewMacros: { fontFamily: fonts.regular, color: colors.textMuted },
  error: { fontFamily: fonts.regular, color: '#B3261E', textAlign: 'center' },
  saveButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { fontFamily: fonts.medium, color: '#FFFFFF', fontSize: 16 },
});
