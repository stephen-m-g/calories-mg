import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import type { ReferenceUnit } from '../types/models';
import type { SearchResultFood } from '../types/search';
import { searchFoods } from '../services/foodSearch';
import { withPortions } from '../services/mealDraftBuilder';
import { resolveQuantity } from '../services/quantity';
import { nextDraftKey, useMealDraft } from '../state/MealDraftContext';
import { colors, fonts, mealTheme } from '../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MealItemEdit'>;

const UNITS: ReferenceUnit[] = ['g', 'ml', 'oz', 'each'];

export function MealItemEditScreen({ route, navigation }: Props) {
  const { itemKey } = route.params;
  const draft = useMealDraft();
  const item = itemKey ? draft.items.find((i) => i.key === itemKey) ?? null : null;
  // No itemKey means "add another food" — the screen becomes a plain search-and-add.
  const isAdding = itemKey === null;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultFood[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  // Alternatives suggested by the vision model are names, not database rows, so they have to be
  // searched before they can be applied.
  const [loadingSuggestion, setLoadingSuggestion] = useState<string | null>(null);

  const unit = item?.unit ?? 'g';
  const quantity = item?.quantity ?? 100;

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    try {
      setResults(await searchFoods(trimmed));
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }, [query]);

  // Opening an unmatched row should land on results already, since searching is the only
  // reason to be here.
  useEffect(() => {
    if (item && !item.match && item.originalName && !searched) {
      setQuery(item.originalName);
    }
  }, [item, searched]);

  async function applyFood(food: SearchResultFood) {
    const withServing = await withPortions(food, unit);
    if (isAdding) {
      draft.addItem({
        key: nextDraftKey('manual'),
        originalName: withServing.name,
        match: withServing,
        quantity,
        unit,
        confidence: null,
        suggestedNames: [],
        candidates: results.filter((r) => r.sourceId !== withServing.sourceId).slice(0, 4),
      });
    } else if (itemKey) {
      draft.updateItem(itemKey, { match: withServing });
    }
    navigation.goBack();
  }

  /** Vision-model suggestions are bare names — resolve to the best database row, then apply. */
  async function applySuggestedName(name: string) {
    setLoadingSuggestion(name);
    try {
      const found = await searchFoods(name);
      if (found[0]) {
        await applyFood(found[0]);
      } else {
        setQuery(name);
        setResults([]);
        setSearched(true);
      }
    } finally {
      setLoadingSuggestion(null);
    }
  }

  function renderFoodRow(food: SearchResultFood, key: string) {
    const preview = resolveQuantity(quantity, unit, food);
    const calories = preview.scale > 0 ? Math.round(food.calories * preview.scale) : null;
    return (
      <Pressable key={key} style={styles.resultRow} onPress={() => applyFood(food)}>
        <View style={styles.resultText}>
          <View style={styles.resultNameRow}>
            <Text style={styles.resultName} numberOfLines={2}>
              {food.name}
            </Text>
            {food.isGeneric && (
              <View style={styles.genericBadge}>
                <Text style={styles.genericBadgeText}>Generic</Text>
              </View>
            )}
          </View>
          <Text style={styles.resultMeta}>
            {food.brand ? `${food.brand} · ` : ''}
            {calories != null
              ? `${calories} cal for this amount`
              : `${Math.round(food.calories)} cal / ${food.referenceAmount}${food.referenceUnit}`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(127, 94, 87, 0.5)" />
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {item && (
          <View style={styles.currentCard}>
            <Text style={styles.currentLabel}>Currently</Text>
            <Text style={styles.currentName}>{item.match?.name ?? item.originalName}</Text>
            {item.confidence != null && (
              <Text style={styles.currentMeta}>
                Identified from photo · {Math.round(item.confidence * 100)}% confident
              </Text>
            )}
          </View>
        )}

        {itemKey && item && (
          <>
            <Text style={styles.label}>Amount</Text>
            <View style={styles.amountRow}>
              <TextInput
                style={styles.quantityInput}
                value={String(item.quantity)}
                onChangeText={(v) => draft.updateItem(itemKey, { quantity: Number(v) || 0 })}
                keyboardType="numeric"
              />
              <View style={styles.unitChips}>
                {UNITS.map((u) => (
                  <Pressable
                    key={u}
                    style={[styles.unitChip, item.unit === u && styles.unitChipActive]}
                    onPress={async () => {
                      draft.updateItem(itemKey, { unit: u });
                      // Switching to a count needs serving weights the match may not carry yet.
                      if (item.match) {
                        const updated = await withPortions(item.match, u);
                        draft.updateItem(itemKey, { match: updated });
                      }
                    }}
                  >
                    <Text style={[styles.unitChipText, item.unit === u && styles.unitChipTextActive]}>
                      {u === 'each' ? 'each' : u}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}

        {item && item.suggestedNames.length > 0 && (
          <>
            <Text style={styles.label}>Could this be…</Text>
            <View style={styles.suggestionWrap}>
              {item.suggestedNames.map((name) => (
                <Pressable
                  key={name}
                  style={styles.suggestionChip}
                  onPress={() => applySuggestedName(name)}
                  disabled={loadingSuggestion !== null}
                >
                  {loadingSuggestion === name ? (
                    <ActivityIndicator size="small" color={colors.textMuted} />
                  ) : (
                    <Text style={styles.suggestionChipText}>{name}</Text>
                  )}
                </Pressable>
              ))}
            </View>
          </>
        )}

        {item && item.candidates.length > 0 && (
          <>
            <Text style={styles.label}>Other close matches</Text>
            {item.candidates.map((food, i) => renderFoodRow(food, `cand-${i}-${food.sourceId}`))}
          </>
        )}

        <Text style={styles.label}>{isAdding ? 'Search for a food' : 'Search for something else'}</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="e.g. ground beef, jasmine rice"
            placeholderTextColor="rgba(127, 94, 87, 0.55)"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={runSearch}
            returnKeyType="search"
          />
        </View>
        <Pressable
          style={[styles.searchButton, (!query.trim() || searching) && styles.searchButtonDisabled]}
          onPress={runSearch}
          disabled={!query.trim() || searching}
        >
          <Text style={styles.searchButtonText}>{searching ? 'Searching…' : 'Search'}</Text>
        </Pressable>

        {searching && <ActivityIndicator color={colors.textMuted} style={styles.spinner} />}
        {!searching && searched && results.length === 0 && (
          <Text style={styles.emptyText}>No matches found. Try a simpler name.</Text>
        )}
        {!searching && results.map((food, i) => renderFoodRow(food, `res-${i}-${food.sourceId}`))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 16, paddingBottom: 32, gap: 8 },
  currentCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, gap: 2 },
  currentLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  currentName: { fontFamily: fonts.medium, fontSize: 17, color: colors.text },
  currentMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted, marginTop: 10 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  quantityInput: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: 84,
  },
  unitChips: { flexDirection: 'row', gap: 6, flex: 1 },
  unitChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  unitChipActive: { backgroundColor: colors.textMuted },
  unitChipText: { fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  unitChipTextActive: { fontFamily: fonts.medium, color: '#FFFFFF' },
  suggestionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestionChip: {
    backgroundColor: mealTheme.breakfast.bg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 60,
    alignItems: 'center',
  },
  suggestionChipText: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  resultText: { flex: 1 },
  resultNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultName: { fontFamily: fonts.medium, fontSize: 15, color: colors.text, flexShrink: 1 },
  resultMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  genericBadge: {
    backgroundColor: 'rgba(127, 94, 87, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  genericBadgeText: { fontFamily: fonts.medium, fontSize: 10, color: colors.textMuted },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  searchButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  searchButtonDisabled: { opacity: 0.5 },
  searchButtonText: { fontFamily: fonts.medium, color: '#FFFFFF', fontSize: 15 },
  spinner: { marginTop: 12 },
  emptyText: { fontFamily: fonts.regular, fontSize: 13, color: 'rgba(127, 94, 87, 0.7)' },
});
