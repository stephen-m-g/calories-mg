import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { getUserSettings, updateUserSettings } from '../db';
import type { GoalMode } from '../types/models';
import { colors, fonts } from '../utils/theme';
import { seedDevData, clearDevData } from '../dev/seedDevData';

export function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [goalMode, setGoalMode] = useState<GoalMode>('fixed_intake');
  const [calorieGoal, setCalorieGoal] = useState('2000');
  const [proteinGoal, setProteinGoal] = useState('');
  const [carbsGoal, setCarbsGoal] = useState('');
  const [fatGoal, setFatGoal] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    getUserSettings().then((settings) => {
      setGoalMode(settings.goalMode);
      setCalorieGoal(settings.calorieGoal != null ? String(settings.calorieGoal) : '');
      setProteinGoal(settings.proteinGoalG != null ? String(settings.proteinGoalG) : '');
      setCarbsGoal(settings.carbsGoalG != null ? String(settings.carbsGoalG) : '');
      setFatGoal(settings.fatGoalG != null ? String(settings.fatGoalG) : '');
      setLoading(false);
    });
  }, []);

  function explainDeficitLocked() {
    Alert.alert(
      'Requires WHOOP',
      "Deficit mode tracks calories eaten against calories burned, which needs a live WHOOP connection. That's coming in a later phase — connect WHOOP below once it's available to unlock this."
    );
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const { foodLogs, weightLogs } = await seedDevData();
      Alert.alert('Test data seeded', `${foodLogs} food logs and ${weightLogs} weigh-ins over the last 6 months. Open Progress to check the charts.`);
    } catch (err) {
      Alert.alert('Seeding failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSeeding(false);
    }
  }

  async function handleClearSeed() {
    setSeeding(true);
    try {
      await clearDevData();
      Alert.alert('Test data cleared', 'Only seeded rows were removed — anything you logged yourself is untouched.');
    } catch (err) {
      Alert.alert('Clear failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSeeding(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateUserSettings({
        goalMode,
        calorieGoal: calorieGoal.trim() ? Number(calorieGoal) : null,
        proteinGoalG: proteinGoal.trim() ? Number(proteinGoal) : null,
        carbsGoalG: carbsGoal.trim() ? Number(carbsGoal) : null,
        fatGoalG: fatGoal.trim() ? Number(fatGoal) : null,
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator color={colors.textMuted} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.screenTitle}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Goal</Text>

          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeChip, goalMode === 'fixed_intake' && styles.modeChipActive]}
              onPress={() => setGoalMode('fixed_intake')}
            >
              <Text style={[styles.modeChipText, goalMode === 'fixed_intake' && styles.modeChipTextActive]}>
                Fixed intake
              </Text>
            </Pressable>
            <Pressable style={[styles.modeChip, styles.modeChipLocked]} onPress={explainDeficitLocked}>
              <Ionicons name="lock-closed" size={13} color="rgba(127, 94, 87, 0.6)" />
              <Text style={styles.modeChipLockedText}>Deficit</Text>
            </Pressable>
          </View>
          <Text style={styles.modeHint}>Deficit mode requires WHOOP — coming in a later phase.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Daily calorie goal</Text>
            <TextInput
              style={styles.input}
              value={calorieGoal}
              onChangeText={setCalorieGoal}
              keyboardType="numeric"
              placeholder="2000"
              placeholderTextColor="rgba(127, 94, 87, 0.55)"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Macro goals</Text>
          <View style={styles.macroRow}>
            <View style={[styles.field, styles.flex1]}>
              <Text style={styles.label}>Protein (g)</Text>
              <TextInput
                style={styles.input}
                value={proteinGoal}
                onChangeText={setProteinGoal}
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.field, styles.flex1]}>
              <Text style={styles.label}>Carbs (g)</Text>
              <TextInput style={styles.input} value={carbsGoal} onChangeText={setCarbsGoal} keyboardType="numeric" />
            </View>
            <View style={[styles.field, styles.flex1]}>
              <Text style={styles.label}>Fat (g)</Text>
              <TextInput style={styles.input} value={fatGoal} onChangeText={setFatGoal} keyboardType="numeric" />
            </View>
          </View>
        </View>

        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : justSaved ? 'Saved ✓' : 'Save'}</Text>
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WHOOP</Text>
          <Pressable style={styles.lockedRow} onPress={explainDeficitLocked}>
            <Ionicons name="watch-outline" size={20} color="rgba(127, 94, 87, 0.6)" />
            <View style={styles.lockedText}>
              <Text style={styles.lockedTitle}>Connect WHOOP</Text>
              <Text style={styles.lockedSubtitle}>Coming in a later phase</Text>
            </View>
            <Ionicons name="lock-closed" size={16} color="rgba(127, 94, 87, 0.5)" />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backup</Text>
          <Pressable
            style={styles.lockedRow}
            onPress={() => Alert.alert('Coming later', 'Cloud backup to Azure Blob Storage lands in a later phase.')}
          >
            <Ionicons name="cloud-upload-outline" size={20} color="rgba(127, 94, 87, 0.6)" />
            <View style={styles.lockedText}>
              <Text style={styles.lockedTitle}>Back up now</Text>
              <Text style={styles.lockedSubtitle}>Coming in a later phase</Text>
            </View>
            <Ionicons name="lock-closed" size={16} color="rgba(127, 94, 87, 0.5)" />
          </Pressable>
        </View>

        {__DEV__ && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Developer</Text>
            <Pressable
              style={[styles.devButton, seeding && styles.devButtonDisabled]}
              onPress={handleSeed}
              disabled={seeding}
            >
              <Ionicons name="flask-outline" size={18} color={colors.textMuted} />
              <Text style={styles.devButtonText}>
                {seeding ? 'Working…' : 'Seed 6 months of test data'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.devButton, seeding && styles.devButtonDisabled]}
              onPress={handleClearSeed}
              disabled={seeding}
            >
              <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
              <Text style={styles.devButtonText}>Clear test data</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutText}>
            {Constants.expoConfig?.name ?? 'Calorie Tracker'} · v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, paddingBottom: 48, gap: 24 },
  screenTitle: { fontFamily: fonts.extraBold, fontSize: 24, color: colors.textMuted },
  section: { gap: 12 },
  sectionTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.textMuted },
  devButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  devButtonDisabled: { opacity: 0.5 },
  devButtonText: { fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  modeChipActive: { backgroundColor: colors.textMuted },
  modeChipLocked: { backgroundColor: 'rgba(127, 94, 87, 0.08)' },
  modeChipText: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  modeChipTextActive: { fontFamily: fonts.medium, color: '#FFFFFF' },
  modeChipLockedText: { fontFamily: fonts.regular, fontSize: 14, color: 'rgba(127, 94, 87, 0.6)' },
  modeHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  field: { gap: 8 },
  flex1: { flex: 1 },
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  input: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  macroRow: { flexDirection: 'row', gap: 12 },
  saveButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontFamily: fonts.medium, color: '#FFFFFF', fontSize: 16 },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(127, 94, 87, 0.06)',
  },
  lockedText: { flex: 1, gap: 2 },
  lockedTitle: { fontFamily: fonts.medium, fontSize: 15, color: 'rgba(0, 0, 0, 0.6)' },
  lockedSubtitle: { fontFamily: fonts.regular, fontSize: 12, color: 'rgba(127, 94, 87, 0.6)' },
  aboutText: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted },
});
