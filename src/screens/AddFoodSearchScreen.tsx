import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { searchFoods } from '../services/foodSearch';
import {
  getRecentFoods,
  searchFoodsByName,
  getCustomFoods,
  searchCustomFoodsByName,
  getAllRecipes,
  searchRecipesByName,
  deleteRecipe,
  computeRecipeMacros,
} from '../db';
import type { SearchResultFood } from '../types/search';
import type { Food, Recipe } from '../types/models';
import { colors, fonts } from '../utils/theme';
import { AddMethodFab, type AddMethod } from '../components/AddMethodFab';
import { SourceTabs, type SearchSource } from '../components/SourceTabs';

type Props = NativeStackScreenProps<RootStackParamList, 'AddFoodSearch'>;

type ListRow =
  | { kind: 'recipe'; recipe: Recipe }
  | { kind: 'cachedFood'; food: Food }
  | { kind: 'online'; food: SearchResultFood };

function foodToSearchResult(food: Food): SearchResultFood {
  return {
    source: food.source,
    sourceId: food.sourceId ?? food.id,
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
    // Cached rows don't retain which USDA dataset they came from, so infer: an unbranded
    // USDA food is a generic one. Only affects labelling here — these tabs aren't re-ranked.
    isGeneric: food.source === 'usda' && !food.brand,
    portions: food.portions,
  };
}

export function AddFoodSearchScreen({ navigation, route }: Props) {
  const { logDate, initialMealType } = route.params;
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchSource>('all');

  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  const [cachedFoodMatches, setCachedFoodMatches] = useState<Food[]>([]);
  const [customFoods, setCustomFoods] = useState<Food[]>([]);
  const [recipeMatches, setRecipeMatches] = useState<Recipe[]>([]);
  const [onlineResults, setOnlineResults] = useState<SearchResultFood[]>([]);
  const [onlineSearched, setOnlineSearched] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshRecents = useCallback(() => {
    getRecentFoods(15).then(setRecentFoods);
  }, []);

  useEffect(() => {
    refreshRecents();
  }, [refreshRecents]);

  const refreshRecipes = useCallback(async (q: string) => {
    const recipes = q.trim() ? await searchRecipesByName(q.trim()) : await getAllRecipes();
    setRecipeMatches(recipes);
  }, []);

  const refreshCustomFoods = useCallback(async (q: string) => {
    const foods = q.trim() ? await searchCustomFoodsByName(q.trim()) : await getCustomFoods();
    setCustomFoods(foods);
  }, []);

  // Local matches (cached foods + recipes + custom foods) filter live as you type —
  // cheap SQLite queries, no reason to gate them behind an explicit search like the
  // online lookup.
  useEffect(() => {
    const q = query.trim();
    if (q) {
      searchFoodsByName(q).then(setCachedFoodMatches);
    } else {
      setCachedFoodMatches([]);
    }
    refreshRecipes(query);
    refreshCustomFoods(query);
  }, [query, refreshRecipes, refreshCustomFoods]);

  const runOnlineSearch = useCallback(async () => {
    if (!query.trim() || activeTab !== 'all') return;
    setLoading(true);
    setError(null);
    try {
      const foods = await searchFoods(query);
      setOnlineResults(foods);
      setOnlineSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query, activeTab]);

  function openEntry(food: SearchResultFood) {
    navigation.navigate('AddFoodEntry', { food, logDate, initialMealType });
  }

  async function openRecipeEntry(recipe: Recipe) {
    const macros = await computeRecipeMacros(recipe.id);
    openEntry({
      source: 'recipe',
      sourceId: recipe.id,
      barcode: null,
      name: recipe.name,
      brand: null,
      referenceAmount: 1,
      referenceUnit: 'each',
      fiberG: null,
      sugarG: null,
      sodiumMg: null,
      // A user's own recipe isn't a packaged product. Its reference unit is already 'each'
      // (one batch), so counts need no portion conversion.
      isGeneric: true,
      portions: [],
      ...macros,
    });
  }

  function confirmDeleteRecipe(recipe: Recipe) {
    Alert.alert('Delete recipe?', `Delete "${recipe.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRecipe(recipe.id);
          refreshRecipes(query);
        },
      },
    ]);
  }

  function handleSelectMethod(method: AddMethod) {
    switch (method) {
      case 'photo':
        navigation.navigate('AddFoodPhoto', { logDate, initialMealType });
        break;
      case 'barcode':
        navigation.navigate('AddFoodBarcode', { logDate, initialMealType });
        break;
      case 'voice':
        navigation.navigate('AddFoodVoice', { logDate, initialMealType });
        break;
    }
  }

  const hasQuery = query.trim().length > 0;

  let listData: ListRow[] = [];
  let sectionLabel: string | null = null;

  if (activeTab === 'recipes') {
    listData = recipeMatches.map((recipe) => ({ kind: 'recipe', recipe }));
  } else if (activeTab === 'foods') {
    listData = customFoods.map((food) => ({ kind: 'cachedFood', food }));
  } else {
    // all
    if (!hasQuery) {
      listData = recentFoods.map((food) => ({ kind: 'cachedFood', food }));
      sectionLabel = recentFoods.length > 0 ? 'Recently logged' : null;
    } else {
      listData = [
        ...recipeMatches.map((recipe): ListRow => ({ kind: 'recipe', recipe })),
        ...cachedFoodMatches.map((food): ListRow => ({ kind: 'cachedFood', food })),
        ...onlineResults.map((food): ListRow => ({ kind: 'online', food })),
      ];
    }
  }

  const showEmptyState =
    !loading &&
    !error &&
    listData.length === 0 &&
    (activeTab === 'all' ? hasQuery && onlineSearched : true);

  const emptyMessage =
    activeTab === 'recipes'
      ? hasQuery
        ? 'No matching recipes.'
        : 'No recipes yet — create one to get started.'
      : activeTab === 'foods'
        ? hasQuery
          ? 'No matching foods.'
          : "No custom foods yet — create one for anything that's not in USDA or Open Food Facts."
        : 'No results. Try a different search term.';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholder="Search foods (e.g. banana, chicken breast)"
          placeholderTextColor="rgba(127, 94, 87, 0.55)"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runOnlineSearch}
          returnKeyType="search"
        />
      </View>

      <SourceTabs active={activeTab} onChange={setActiveTab} />

      <View style={styles.content}>
        {loading && <ActivityIndicator style={styles.spinner} color={colors.textMuted} />}
        {error && <Text style={styles.error}>{error}</Text>}

        <FlatList
          data={listData}
          keyExtractor={(row) =>
            row.kind === 'recipe'
              ? `recipe:${row.recipe.id}`
              : row.kind === 'cachedFood'
                ? `cached:${row.food.id}`
                : `online:${row.food.source}:${row.food.sourceId}`
          }
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              {activeTab === 'recipes' && (
                <Pressable style={styles.newItemRow} onPress={() => navigation.navigate('CreateRecipe')}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.textMuted} />
                  <Text style={styles.newItemText}>Create a new recipe</Text>
                </Pressable>
              )}
              {activeTab === 'foods' && (
                <Pressable style={styles.newItemRow} onPress={() => navigation.navigate('CreateCustomFood')}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.textMuted} />
                  <Text style={styles.newItemText}>Create a new food</Text>
                </Pressable>
              )}
              {sectionLabel && <Text style={styles.sectionLabel}>{sectionLabel}</Text>}
            </>
          }
          ListEmptyComponent={showEmptyState ? <Text style={styles.empty}>{emptyMessage}</Text> : null}
          renderItem={({ item }) => {
            if (item.kind === 'recipe') {
              return (
                <Pressable
                  style={styles.resultRow}
                  onPress={() => openRecipeEntry(item.recipe)}
                  onLongPress={() => confirmDeleteRecipe(item.recipe)}
                  delayLongPress={400}
                >
                  <Ionicons name="restaurant-outline" size={18} color={colors.textMuted} />
                  <View style={styles.resultText}>
                    <Text style={styles.resultName}>{item.recipe.name}</Text>
                    <Text style={styles.resultMeta}>Recipe · hold to delete</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(127, 94, 87, 0.5)" />
                </Pressable>
              );
            }

            const food = item.kind === 'cachedFood' ? foodToSearchResult(item.food) : item.food;
            return (
              <Pressable style={styles.resultRow} onPress={() => openEntry(food)}>
                <View style={styles.resultText}>
                  <View style={styles.resultNameRow}>
                    <Text style={styles.resultName} numberOfLines={2}>
                      {food.name}
                    </Text>
                    {item.kind === 'online' && food.isGeneric && (
                      <View style={styles.genericBadge}>
                        <Text style={styles.genericBadgeText}>Generic</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.resultMeta}>
                    {food.brand ? `${food.brand} · ` : ''}
                    {Math.round(food.calories)} kcal / {food.referenceAmount}
                    {food.referenceUnit}
                    {item.kind === 'online' ? ` · ${food.source === 'usda' ? 'USDA' : 'Open Food Facts'}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(127, 94, 87, 0.5)" />
              </Pressable>
            );
          }}
        />

        <AddMethodFab onSelectMethod={handleSelectMethod} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    shadowColor: colors.textMuted,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  content: { flex: 1 },
  spinner: { marginTop: 20 },
  error: {
    fontFamily: fonts.regular,
    color: '#B3261E',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 24,
  },
  empty: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 8,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 120, gap: 8 },
  sectionLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 8,
    marginTop: 4,
  },
  newItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(127, 94, 87, 0.3)',
    borderStyle: 'dashed',
    marginBottom: 8,
  },
  newItemText: { fontFamily: fonts.medium, fontSize: 15, color: colors.textMuted },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: colors.textMuted,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  resultText: { flex: 1, gap: 2 },
  resultName: { fontFamily: fonts.medium, fontSize: 16, color: colors.text, flexShrink: 1 },
  resultNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  genericBadge: {
    backgroundColor: 'rgba(127, 94, 87, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  genericBadgeText: { fontFamily: fonts.medium, fontSize: 10, color: colors.textMuted },
  resultMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
});
