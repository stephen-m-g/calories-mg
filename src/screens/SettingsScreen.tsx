import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { getUserSettings, updateUserSettings, getWhoopConnection, getRecentBackupLogs } from '../db';
import type { GoalMode } from '../types/models';
import { colors, fonts } from '../utils/theme';
import { connectWhoop, clearWhoopTokens, isWhoopConfigured, isWhoopAvailable } from '../services/whoopAuth';
import { syncLatestCycle } from '../services/whoopApi';
import { getBackupSasUrl, setBackupSasUrl, clearBackupSasUrl, runBackup } from '../services/azureBackup';

export function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [goalMode, setGoalMode] = useState<GoalMode>('fixed_intake');
  const [calorieGoal, setCalorieGoal] = useState('2000');
  const [deficitGoal, setDeficitGoal] = useState('500');
  const [proteinGoal, setProteinGoal] = useState('');
  const [carbsGoal, setCarbsGoal] = useState('');
  const [fatGoal, setFatGoal] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Static for the life of the app — no need to track as state.
  const whoopAvailable = isWhoopAvailable();
  const [whoopConnected, setWhoopConnectedState] = useState(false);
  const [whoopLastSynced, setWhoopLastSynced] = useState<string | null>(null);
  const [whoopBusy, setWhoopBusy] = useState(false);
  const [sasUrlConfigured, setSasUrlConfigured] = useState(false);
  const [sasUrlInput, setSasUrlInput] = useState('');
  const [editingSasUrl, setEditingSasUrl] = useState(false);
  const [lastBackup, setLastBackup] = useState<{ backedUpAt: string; status: string } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    getUserSettings().then((settings) => {
      setGoalMode(settings.goalMode);
      setCalorieGoal(settings.calorieGoal != null ? String(settings.calorieGoal) : '');
      setDeficitGoal(settings.deficitGoalKcal != null ? String(settings.deficitGoalKcal) : '500');
      setProteinGoal(settings.proteinGoalG != null ? String(settings.proteinGoalG) : '');
      setCarbsGoal(settings.carbsGoalG != null ? String(settings.carbsGoalG) : '');
      setFatGoal(settings.fatGoalG != null ? String(settings.fatGoalG) : '');
      setLoading(false);
    });
    refreshWhoopState();
    refreshBackupState();
  }, []);

  async function refreshWhoopState() {
    const connection = await getWhoopConnection();
    setWhoopConnectedState(connection.connected);
    setWhoopLastSynced(connection.lastSyncedAt);
  }

  async function refreshBackupState() {
    const [sasUrl, logs] = await Promise.all([getBackupSasUrl(), getRecentBackupLogs(1)]);
    setSasUrlConfigured(Boolean(sasUrl));
    setLastBackup(logs[0] ? { backedUpAt: logs[0].backedUpAt, status: logs[0].status } : null);
  }

  async function handleSaveSasUrl() {
    if (!sasUrlInput.trim()) return;
    await setBackupSasUrl(sasUrlInput.trim());
    setSasUrlInput('');
    setEditingSasUrl(false);
    await refreshBackupState();
  }

  function handleRemoveSasUrl() {
    Alert.alert('Remove backup destination?', 'You can paste a new SAS URL any time to reconnect.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await clearBackupSasUrl();
          await refreshBackupState();
        },
      },
    ]);
  }

  async function handleBackupNow() {
    setBackupBusy(true);
    try {
      const result = await runBackup();
      await refreshBackupState();
      Alert.alert(result.success ? 'Backup complete' : 'Backup failed', result.message);
    } finally {
      setBackupBusy(false);
    }
  }

  function explainDeficitLocked() {
    Alert.alert(
      'Requires WHOOP',
      'Deficit mode tracks calories eaten against calories burned, which needs a live WHOOP connection. Connect WHOOP below to unlock it.'
    );
  }

  async function handleConnectWhoop() {
    if (!isWhoopAvailable()) {
      Alert.alert(
        'Requires a development build',
        "WHOOP's sign-in can't complete inside Expo Go — the redirect address it gets changes with your network and can't be registered with WHOOP. This will work once the app is running from a development build."
      );
      return;
    }
    if (!isWhoopConfigured()) {
      Alert.alert(
        'WHOOP not configured',
        'Add EXPO_PUBLIC_WHOOP_CLIENT_ID and EXPO_PUBLIC_WHOOP_CLIENT_SECRET to your .env file (see .env.example), then restart the dev server.'
      );
      return;
    }
    setWhoopBusy(true);
    try {
      const result = await connectWhoop();
      if (result === 'connected') {
        await refreshWhoopState();
        // Pull a cycle straight away so the connection proves itself with a real number.
        try {
          await syncLatestCycle();
          await refreshWhoopState();
        } catch {
          // Connected fine; the first sync can wait for the Today screen.
        }
      }
    } catch (err) {
      Alert.alert('WHOOP connection failed', err instanceof Error ? err.message : String(err));
    } finally {
      setWhoopBusy(false);
    }
  }

  function handleDisconnectWhoop() {
    Alert.alert('Disconnect WHOOP?', 'Calories burned will stop updating and deficit mode will be unavailable.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await clearWhoopTokens();
          await refreshWhoopState();
          // Deficit mode can't work without it, so don't leave the user on a broken goal.
          if (goalMode === 'deficit') setGoalMode('fixed_intake');
        },
      },
    ]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateUserSettings({
        goalMode,
        calorieGoal: calorieGoal.trim() ? Number(calorieGoal) : null,
        deficitGoalKcal: deficitGoal.trim() ? Number(deficitGoal) : null,
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
            {whoopConnected ? (
              <Pressable
                style={[styles.modeChip, goalMode === 'deficit' && styles.modeChipActive]}
                onPress={() => setGoalMode('deficit')}
              >
                <Text style={[styles.modeChipText, goalMode === 'deficit' && styles.modeChipTextActive]}>
                  Deficit
                </Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.modeChip, styles.modeChipLocked]} onPress={explainDeficitLocked}>
                <Ionicons name="lock-closed" size={13} color="rgba(127, 94, 87, 0.6)" />
                <Text style={styles.modeChipLockedText}>Deficit</Text>
              </Pressable>
            )}
          </View>
          {!whoopConnected && (
            <Text style={styles.modeHint}>Deficit mode requires a WHOOP connection — see below.</Text>
          )}

          {goalMode === 'deficit' ? (
            <View style={styles.field}>
              <Text style={styles.label}>Daily deficit target (kcal)</Text>
              <TextInput
                style={styles.input}
                value={deficitGoal}
                onChangeText={setDeficitGoal}
                keyboardType="numeric"
                placeholder="500"
                placeholderTextColor="rgba(127, 94, 87, 0.55)"
              />
              <Text style={styles.modeHint}>
                How far below your burned calories you aim to eat each day.
              </Text>
            </View>
          ) : (
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
          )}
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
          <Pressable
            style={styles.lockedRow}
            onPress={whoopConnected ? handleDisconnectWhoop : handleConnectWhoop}
            disabled={whoopBusy}
          >
            <Ionicons
              name={whoopConnected ? 'watch' : 'watch-outline'}
              size={20}
              color={whoopConnected ? colors.textMuted : 'rgba(127, 94, 87, 0.6)'}
            />
            <View style={styles.lockedText}>
              <Text style={[styles.lockedTitle, whoopConnected && styles.connectedTitle]}>
                {whoopConnected ? 'WHOOP connected' : 'Connect WHOOP'}
              </Text>
              <Text style={styles.lockedSubtitle}>
                {whoopBusy
                  ? 'Opening WHOOP…'
                  : whoopConnected
                    ? whoopLastSynced
                      ? `Last synced ${new Date(whoopLastSynced).toLocaleString()}`
                      : 'Not synced yet'
                    : whoopAvailable
                      ? 'Automatic calories burned, for deficit mode'
                      : 'Requires a development build — see Settings help'}
              </Text>
            </View>
            {whoopBusy ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : !whoopConnected && !whoopAvailable ? (
              <Ionicons name="lock-closed" size={16} color="rgba(127, 94, 87, 0.5)" />
            ) : (
              <Ionicons
                name={whoopConnected ? 'close-circle-outline' : 'chevron-forward'}
                size={18}
                color="rgba(127, 94, 87, 0.5)"
              />
            )}
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backup</Text>

          {editingSasUrl ? (
            <View style={styles.field}>
              <Text style={styles.label}>Azure SAS URL</Text>
              <TextInput
                style={styles.input}
                value={sasUrlInput}
                onChangeText={setSasUrlInput}
                placeholder="https://...blob.core.windows.net/...&sig=..."
                placeholderTextColor="rgba(127, 94, 87, 0.55)"
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
              <View style={styles.modeRow}>
                <Pressable style={styles.modeChip} onPress={() => setEditingSasUrl(false)}>
                  <Text style={styles.modeChipText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modeChip, styles.modeChipActive]}
                  onPress={handleSaveSasUrl}
                  disabled={!sasUrlInput.trim()}
                >
                  <Text style={[styles.modeChipText, styles.modeChipTextActive]}>Save</Text>
                </Pressable>
              </View>
            </View>
          ) : sasUrlConfigured ? (
            <>
              <Pressable
                style={styles.lockedRow}
                onPress={handleBackupNow}
                disabled={backupBusy}
              >
                <Ionicons name="cloud-upload-outline" size={20} color="rgba(127, 94, 87, 0.6)" />
                <View style={styles.lockedText}>
                  <Text style={[styles.lockedTitle, styles.connectedTitle]}>Back up now</Text>
                  <Text style={styles.lockedSubtitle}>
                    {backupBusy
                      ? 'Backing up…'
                      : lastBackup
                        ? `Last: ${lastBackup.status === 'success' ? 'succeeded' : 'failed'} · ${new Date(lastBackup.backedUpAt).toLocaleString()}`
                        : 'Never backed up'}
                  </Text>
                </View>
                {backupBusy ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="rgba(127, 94, 87, 0.5)" />
                )}
              </Pressable>
              <Pressable onPress={handleRemoveSasUrl} hitSlop={8}>
                <Text style={styles.removeLink}>Remove backup destination</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.lockedRow} onPress={() => setEditingSasUrl(true)}>
              <Ionicons name="cloud-upload-outline" size={20} color="rgba(127, 94, 87, 0.6)" />
              <View style={styles.lockedText}>
                <Text style={styles.lockedTitle}>Set up backup</Text>
                <Text style={styles.lockedSubtitle}>Paste an Azure Blob SAS URL</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(127, 94, 87, 0.5)" />
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutText}>
            {Constants.expoConfig?.name ?? 'risu'} · v{Constants.expoConfig?.version ?? '1.0.0'}
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
  connectedTitle: { color: colors.text },
  removeLink: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: 'rgba(179, 38, 30, 0.8)',
    marginTop: 8,
    textAlign: 'center',
  },
  lockedSubtitle: { fontFamily: fonts.regular, fontSize: 12, color: 'rgba(127, 94, 87, 0.6)' },
  aboutText: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted },
});
