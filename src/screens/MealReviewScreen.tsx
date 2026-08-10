import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { MealType } from '../types/models';
import { createFoodLog, findOrCacheFood, touchFoodLastUsed } from '../db';
import { resolveQuantity } from '../services/quantity';
import { useMealDraft, type DraftItem } from '../state/MealDraftContext';
import { loggedAtIso } from '../utils/date';
import { colors, fonts, mealTheme } from '../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MealReview'>;

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Below this the model is guessing more than identifying, so the row asks to be checked. */
const LOW_CONFIDENCE = 0.6;

export function MealReviewScreen({ navigation }: Props) {
  const draft = useMealDraft();
  const { items, mealType, logDate, source, transcript, photoUri } = draft;
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function resolveFor(item: DraftItem) {
    return item.match ? resolveQuantity(item.quantity, item.unit, item.match) : null;
  }

  const savableCount = items.filter((item) => (resolveFor(item)?.scale ?? 0) > 0).length;

  async function handleSaveAll() {
    setSaving(true);
    setErrorMessage(null);
    try {
      for (const item of items) {
        if (!item.match) continue;
        const resolved = resolveQuantity(item.quantity, item.unit, item.match);
        if (resolved.scale <= 0) continue;

        const cachedFood = await findOrCacheFood(item.match);
        await createFoodLog({
          foodId: cachedFood.id,
          loggedAt: loggedAtIso(logDate),
          mealType,
          quantityAmount: item.quantity,
          // Stored as spoken/estimated ("x2"), not the gram weight it resolved to.
          quantityUnit: item.unit,
          calories: Math.round(item.match.calories * resolved.scale),
          proteinG: Math.round(item.match.proteinG * resolved.scale),
          carbsG: Math.round(item.match.carbsG * resolved.scale),
          fatG: Math.round(item.match.fatG * resolved.scale),
          inputMethod: source,
          photoUri,
          rawTranscript: transcript,
        });
        await touchFoodLastUsed(cachedFood.id);
      }
      draft.clearDraft();
      navigation.popToTop();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {photoUri && <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />}

        <Text style={styles.label}>Meal</Text>
        <View style={styles.mealRow}>
          {MEAL_TYPES.map((type) => (
            <Pressable
              key={type}
              style={[styles.mealChip, mealType === type && styles.mealChipActive]}
              onPress={() => draft.setMealType(type)}
            >
              <Text style={[styles.mealChipText, mealType === type && styles.mealChipTextActive]}>
                {type[0].toUpperCase() + type.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Items</Text>
        {items.length === 0 && (
          <Text style={styles.emptyText}>
            Nothing here yet — use “Add another food” below to build the meal manually.
          </Text>
        )}

        {items.map((item) => {
          const resolved = resolveFor(item);
          const calories =
            item.match && resolved && resolved.scale > 0
              ? Math.round(item.match.calories * resolved.scale)
              : null;
          const lowConfidence = item.confidence != null && item.confidence < LOW_CONFIDENCE;
          const unresolvedCount = item.unit === 'each' && resolved !== null && resolved.scale <= 0;

          return (
            <View key={item.key} style={styles.itemCard}>
              <Pressable
                style={styles.itemHeader}
                onPress={() => navigation.navigate('MealItemEdit', { itemKey: item.key })}
              >
                <View style={styles.itemHeaderText}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.match?.name ?? item.originalName}
                  </Text>
                  {item.match?.brand && <Text style={styles.itemBrand}>{item.match.brand}</Text>}
                </View>
                {lowConfidence && (
                  <View style={styles.confidenceBadge}>
                    <Ionicons name="help-circle-outline" size={12} color="#8A5A00" />
                    <Text style={styles.confidenceBadgeText}>Check</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color="rgba(127, 94, 87, 0.5)" />
              </Pressable>

              {/* Quantity stays editable here so the common fix — right food, wrong amount —
                  never requires opening the detail page. */}
              <View style={styles.itemRow}>
                <TextInput
                  style={styles.quantityInput}
                  value={String(item.quantity)}
                  onChangeText={(v) => draft.updateItem(item.key, { quantity: Number(v) || 0 })}
                  keyboardType="numeric"
                />
                <Text style={styles.unitText}>
                  {item.unit === 'each' ? (item.quantity === 1 ? 'item' : 'items') : item.unit}
                </Text>
                <Text style={styles.itemCalories}>{calories != null ? `${calories} cal` : '—'}</Text>
                <Pressable onPress={() => draft.removeItem(item.key)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={17} color="rgba(127, 94, 87, 0.6)" />
                </Pressable>
              </View>

              {resolved?.portion && resolved.resolvedAmount != null && (
                <Text style={styles.note}>
                  {resolved.portion.label} ≈ {Math.round(resolved.portion.gramWeight)}g · total{' '}
                  {Math.round(resolved.resolvedAmount)}
                  {item.match?.referenceUnit}
                </Text>
              )}
              {!item.match && (
                <Text style={styles.warnText}>
                  No database match — tap to search for “{item.originalName}”.
                </Text>
              )}
              {unresolvedCount && (
                <Text style={styles.warnText}>
                  No serving size for this food — tap to pick a different match.
                </Text>
              )}
            </View>
          );
        })}

        <Pressable
          style={styles.addRow}
          onPress={() => navigation.navigate('MealItemEdit', { itemKey: null })}
        >
          <Ionicons name="add" size={18} color={colors.textMuted} />
          <Text style={styles.addRowText}>Add another food</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.saveButton, (savableCount === 0 || saving) && styles.saveButtonDisabled]}
          onPress={handleSaveAll}
          disabled={savableCount === 0 || saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving…' : `Log ${savableCount} item${savableCount === 1 ? '' : 's'}`}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 16, paddingBottom: 24, gap: 8 },
  photo: { width: '100%', height: 160, borderRadius: 12, marginBottom: 8 },
  errorBanner: {
    backgroundColor: 'rgba(179, 38, 30, 0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  errorText: { fontFamily: fonts.regular, fontSize: 13, color: '#B3261E' },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted, marginTop: 4 },
  mealRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  mealChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#FFFFFF' },
  mealChipActive: { backgroundColor: colors.textMuted },
  mealChipText: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  mealChipTextActive: { fontFamily: fonts.medium, color: '#FFFFFF' },
  emptyText: { fontFamily: fonts.regular, fontSize: 13, color: 'rgba(127, 94, 87, 0.7)' },
  itemCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, gap: 8 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemHeaderText: { flex: 1 },
  itemName: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  itemBrand: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 176, 32, 0.18)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  confidenceBadgeText: { fontFamily: fonts.medium, fontSize: 10, color: '#8A5A00' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  quantityInput: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: 70,
  },
  unitText: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, flex: 1 },
  itemCalories: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  note: { fontFamily: fonts.regular, fontSize: 11, color: 'rgba(127, 94, 87, 0.75)' },
  warnText: { fontFamily: fonts.regular, fontSize: 12, color: 'rgba(179, 38, 30, 0.8)' },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  addRowText: { fontFamily: fonts.medium, fontSize: 15, color: colors.textMuted },
  footer: { padding: 16, paddingTop: 8 },
  saveButton: {
    backgroundColor: mealTheme.dinner.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { fontFamily: fonts.medium, color: '#FFFFFF', fontSize: 16 },
});
