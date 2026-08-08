import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ReferenceUnit } from '../types/models';
import { createFood } from '../db';
import { colors, fonts } from '../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateCustomFood'>;

const UNITS: ReferenceUnit[] = ['g', 'ml', 'oz', 'each'];

export function CreateCustomFoodScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [servingAmount, setServingAmount] = useState('100');
  const [servingUnit, setServingUnit] = useState<ReferenceUnit>('g');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = Number(servingAmount);
  const parsedCalories = Number(calories);

  const canSave =
    name.trim().length > 0 &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    Number.isFinite(parsedCalories) &&
    parsedCalories >= 0;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await createFood({
        source: 'custom',
        sourceId: null,
        barcode: null,
        name: name.trim(),
        brand: null,
        referenceAmount: parsedAmount,
        referenceUnit: servingUnit,
        calories: parsedCalories,
        proteinG: Number(protein) || 0,
        carbsG: Number(carbs) || 0,
        fatG: Number(fat) || 0,
        fiberG: null,
        sugarG: null,
        sodiumMg: null,
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save food');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Mom's granola"
            placeholderTextColor="rgba(127, 94, 87, 0.55)"
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.field, styles.flex1]}>
            <Text style={styles.label}>Serving size</Text>
            <TextInput
              style={styles.input}
              value={servingAmount}
              onChangeText={setServingAmount}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Unit</Text>
            <View style={styles.unitRow}>
              {UNITS.map((unit) => (
                <Pressable
                  key={unit}
                  style={[styles.unitChip, servingUnit === unit && styles.unitChipActive]}
                  onPress={() => setServingUnit(unit)}
                >
                  <Text style={[styles.unitChipText, servingUnit === unit && styles.unitChipTextActive]}>
                    {unit}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Calories (per serving)</Text>
          <TextInput style={styles.input} value={calories} onChangeText={setCalories} keyboardType="numeric" />
        </View>

        <View style={styles.row}>
          <View style={[styles.field, styles.flex1]}>
            <Text style={styles.label}>Protein (g)</Text>
            <TextInput style={styles.input} value={protein} onChangeText={setProtein} keyboardType="numeric" />
          </View>
          <View style={[styles.field, styles.flex1]}>
            <Text style={styles.label}>Carbs (g)</Text>
            <TextInput style={styles.input} value={carbs} onChangeText={setCarbs} keyboardType="numeric" />
          </View>
          <View style={[styles.field, styles.flex1]}>
            <Text style={styles.label}>Fat (g)</Text>
            <TextInput style={styles.input} value={fat} onChangeText={setFat} keyboardType="numeric" />
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.saveButton, (!canSave || saving) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save food'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, gap: 20, paddingBottom: 48 },
  field: { gap: 8 },
  row: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },
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
  unitRow: { flexDirection: 'row', gap: 6 },
  unitChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  unitChipActive: { backgroundColor: colors.textMuted },
  unitChipText: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  unitChipTextActive: { color: '#FFFFFF' },
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
