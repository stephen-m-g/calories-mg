import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { searchFoods } from '../services/foodSearch';
import { findOrCacheFood, createRecipe, updateRecipe, getRecipeById, getRecipeIngredients, getFoodById } from '../db';
import type { SearchResultFood } from '../types/search';
import type { Food } from '../types/models';
import { colors, fonts } from '../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateRecipe'>;

interface DraftIngredient {
  food: Food;
  quantityText: string;
}

export function CreateRecipeScreen({ navigation, route }: Props) {
  const recipeId = route.params?.recipeId;
  const [name, setName] = useState('');
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [loadingRecipe, setLoadingRecipe] = useState(!!recipeId);

  const [ingredientQuery, setIngredientQuery] = useState('');
  const [ingredientResults, setIngredientResults] = useState<SearchResultFood[]>([]);
  const [searchingIngredient, setSearchingIngredient] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: recipeId ? 'Edit Recipe' : 'New Recipe' });
  }, [navigation, recipeId]);

  useEffect(() => {
    if (!recipeId) return;
    (async () => {
      const recipe = await getRecipeById(recipeId);
      const recipeIngredients = await getRecipeIngredients(recipeId);
      const draft = await Promise.all(
        recipeIngredients.map(async (ing) => {
          const food = await getFoodById(ing.foodId);
          return food ? { food, quantityText: String(ing.quantityAmount) } : null;
        })
      );
      setName(recipe?.name ?? '');
      setIngredients(draft.filter((d): d is DraftIngredient => d !== null));
      setLoadingRecipe(false);
    })();
  }, [recipeId]);

  async function runIngredientSearch() {
    if (!ingredientQuery.trim()) return;
    setSearchingIngredient(true);
    try {
      const results = await searchFoods(ingredientQuery);
      setIngredientResults(results);
    } catch {
      setIngredientResults([]);
    } finally {
      setSearchingIngredient(false);
    }
  }

  async function addIngredient(searchFood: SearchResultFood) {
    const cached = await findOrCacheFood(searchFood);
    setIngredients((prev) => [...prev, { food: cached, quantityText: String(cached.referenceAmount) }]);
    setIngredientQuery('');
    setIngredientResults([]);
  }

  function updateQuantity(index: number, text: string) {
    setIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, quantityText: text } : ing)));
  }

  function removeIngredient(index: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  const parsedIngredients = ingredients.map((ing) => {
    const amount = Number(ing.quantityText);
    const valid = Number.isFinite(amount) && amount > 0;
    const scale = valid ? amount / ing.food.referenceAmount : 0;
    return { ...ing, amount, valid, scale };
  });

  const totals = parsedIngredients.reduce(
    (acc, ing) => ({
      calories: acc.calories + ing.food.calories * ing.scale,
      proteinG: acc.proteinG + ing.food.proteinG * ing.scale,
      carbsG: acc.carbsG + ing.food.carbsG * ing.scale,
      fatG: acc.fatG + ing.food.fatG * ing.scale,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );

  const canSave = name.trim().length > 0 && ingredients.length > 0 && parsedIngredients.every((i) => i.valid);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const ingredientInput = parsedIngredients.map((ing) => ({
        foodId: ing.food.id,
        quantityAmount: ing.amount,
        quantityUnit: ing.food.referenceUnit,
      }));
      if (recipeId) {
        await updateRecipe(recipeId, name.trim(), ingredientInput);
      } else {
        await createRecipe(name.trim(), ingredientInput);
      }
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recipe');
    } finally {
      setSaving(false);
    }
  }

  if (loadingRecipe) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['bottom']}>
        <ActivityIndicator color={colors.textMuted} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>Recipe name</Text>
          <TextInput
            style={styles.nameInput}
            placeholder="e.g. Chicken stir fry"
            placeholderTextColor="rgba(127, 94, 87, 0.55)"
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Ingredients</Text>

          {ingredients.length === 0 && <Text style={styles.emptyIngredients}>No ingredients added yet.</Text>}

          {parsedIngredients.map((ing, index) => (
            <View key={`${ing.food.id}-${index}`} style={styles.ingredientRow}>
              <View style={styles.ingredientText}>
                <Text style={styles.ingredientName}>{ing.food.name}</Text>
                <Text style={styles.ingredientCalories}>
                  {ing.valid ? Math.round(ing.food.calories * ing.scale) : '—'} kcal
                </Text>
              </View>
              <TextInput
                style={styles.quantityInput}
                value={ing.quantityText}
                onChangeText={(text) => updateQuantity(index, text)}
                keyboardType="numeric"
              />
              <Text style={styles.unitLabel}>{ing.food.referenceUnit}</Text>
              <Pressable onPress={() => removeIngredient(index)} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color="rgba(127, 94, 87, 0.5)" />
              </Pressable>
            </View>
          ))}

          {ingredients.length > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsText}>
                Total: {Math.round(totals.calories)} kcal · P {Math.round(totals.proteinG)}g · C{' '}
                {Math.round(totals.carbsG)}g · F {Math.round(totals.fatG)}g
              </Text>
            </View>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Add ingredient</Text>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search foods to add"
              placeholderTextColor="rgba(127, 94, 87, 0.55)"
              value={ingredientQuery}
              onChangeText={setIngredientQuery}
              onSubmitEditing={runIngredientSearch}
              returnKeyType="search"
            />
          </View>

          {searchingIngredient && <ActivityIndicator style={styles.spinner} color={colors.textMuted} />}

          {ingredientResults.length > 0 && (
            <FlatList
              data={ingredientResults}
              keyExtractor={(item) => `${item.source}:${item.sourceId}`}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <Pressable style={styles.pickRow} onPress={() => addIngredient(item)}>
                  <View style={styles.ingredientText}>
                    <Text style={styles.ingredientName}>{item.name}</Text>
                    <Text style={styles.ingredientCalories}>
                      {Math.round(item.calories)} kcal / {item.referenceAmount}
                      {item.referenceUnit}
                    </Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={20} color={colors.textMuted} />
                </Pressable>
              )}
            />
          )}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.saveButton, (!canSave || saving) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save recipe'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, gap: 24, paddingBottom: 48 },
  field: { gap: 10 },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
  nameInput: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  emptyIngredients: { fontFamily: fonts.regular, fontSize: 14, color: 'rgba(127, 94, 87, 0.7)' },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  ingredientText: { flex: 1, gap: 2 },
  ingredientName: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  ingredientCalories: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  quantityInput: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
    width: 56,
    textAlign: 'right',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(127, 94, 87, 0.3)',
    paddingVertical: 2,
  },
  unitLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  totalsRow: { paddingTop: 4 },
  totalsText: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  spinner: { marginTop: 12 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
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
