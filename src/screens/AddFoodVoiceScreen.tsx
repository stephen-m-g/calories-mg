import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { File } from 'expo-file-system';
import type { RootStackParamList } from '../navigation/types';
import type { MealType, ReferenceUnit } from '../types/models';
import type { SearchResultFood } from '../types/search';
import { findOrCacheFood, createFoodLog, touchFoodLastUsed } from '../db';
import { searchFoods } from '../services/foodSearch';
import { fetchUsdaPortions } from '../services/usdaFdc';
import { resolveQuantity, formatQuantity } from '../services/quantity';
import { transcribeAudio } from '../services/groqTranscribe';
import { parseMealTranscript, type ParsedMealItem } from '../services/geminiParseMeal';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { loggedAtIso } from '../utils/date';
import { env } from '../utils/env';
import { colors, fonts, mealTheme } from '../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddFoodVoice'>;

type Phase = 'idle' | 'recording' | 'transcribing' | 'reviewTranscript' | 'parsing' | 'reviewItems' | 'saving';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// Below this, a recording is almost certainly an accidental tap rather than real speech —
// Groq returns a 400, a blank transcript, or a garbage word guessed from the tap noise itself.
const MIN_RECORDING_MS = 400;

function deleteRecordingFile(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best-effort cleanup; a leftover temp file isn't worth surfacing an error for.
  }
}

// Whisper hallucinates a bare "." (or similar punctuation-only filler) for silence rather than
// returning empty text — treat anything with no letters as "nothing was said."
function hasSpeechContent(text: string): boolean {
  return /[a-zA-Z]/.test(text);
}

interface ReviewItem {
  key: string;
  originalFood: string;
  match: SearchResultFood | null;
  quantityInput: string;
  /** The unit as spoken ("2 eggs" -> each), preserved rather than coerced into the food's own
   * reference unit — logging that as 2 grams was the whole bug this guards against. */
  unit: ReferenceUnit;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

async function buildReviewItems(items: ParsedMealItem[]): Promise<ReviewItem[]> {
  return Promise.all(
    items.map(async (item, index) => {
      const results = await searchFoods(item.food);
      let match = results[0] ?? null;

      // A spoken count can't be converted without a serving weight, and USDA only returns those
      // inline for FNDDS foods — so fetch them for anything else before the user sees a total.
      if (match && item.unit === 'each' && match.portions.length === 0 && match.source === 'usda') {
        try {
          const portions = await fetchUsdaPortions(match.sourceId);
          match = { ...match, portions };
        } catch {
          // Leave portions empty; the row renders as unresolvable rather than silently wrong.
        }
      }

      return {
        key: `${index}-${item.food}`,
        originalFood: item.food,
        match,
        quantityInput: String(item.quantity),
        unit: item.unit,
      };
    })
  );
}

export function AddFoodVoiceScreen({ route, navigation }: Props) {
  const { logDate, initialMealType } = route.params;
  const recorder = useVoiceRecorder();

  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [mealType, setMealType] = useState<MealType>(initialMealType ?? 'breakfast');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const missingKeys = !env.groqApiKey || !env.geminiApiKey;

  // Read inside the AppState listener via a ref rather than a dependency — the recorder's
  // native session can be interrupted by the OS at any moment while backgrounded, independent
  // of React's render cycle, so the listener needs the current phase without re-subscribing.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && phaseRef.current === 'recording') {
        cancelRecording('Recording was interrupted when you left the app. Try again.');
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cancelRecording(message: string) {
    const { uri } = await recorder.stop();
    if (uri) deleteRecordingFile(uri);
    setErrorMessage(message);
    setPhase('idle');
  }

  async function handleStartRecording() {
    setErrorMessage(null);
    const result = await recorder.start();
    if (result === 'permission_denied') {
      setErrorMessage('Microphone access is required for voice logging. Enable it in system settings.');
      return;
    }
    setPhase('recording');
  }

  async function handleStopRecording() {
    const { uri, durationMillis } = await recorder.stop();
    if (!uri || durationMillis < MIN_RECORDING_MS) {
      if (uri) deleteRecordingFile(uri);
      setErrorMessage('Recording was too short to transcribe. Hold the mic a moment longer and try again.');
      setPhase('idle');
      return;
    }
    setPhase('transcribing');
    try {
      const text = await transcribeAudio(uri);
      setTranscript(text);
      setPhase('reviewTranscript');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Transcription failed');
      setPhase('idle');
    } finally {
      // Audio is never kept once transcribed — only the transcript is persisted.
      deleteRecordingFile(uri);
    }
  }

  async function handleParse() {
    if (!hasSpeechContent(transcript)) {
      setErrorMessage('No speech was detected in that recording. Try again, or edit the transcript above.');
      return;
    }
    setPhase('parsing');
    setErrorMessage(null);
    try {
      const parsed = await parseMealTranscript(transcript);
      if (parsed.length === 0) {
        setErrorMessage('No food items were detected. Try rephrasing, or edit the transcript above.');
        setPhase('reviewTranscript');
        return;
      }
      setItems(await buildReviewItems(parsed));
      setPhase('reviewItems');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Parsing failed');
      setPhase('reviewTranscript');
    }
  }

  function updateQuantity(key: string, value: string) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, quantityInput: value } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  async function handleSaveAll() {
    setPhase('saving');
    setErrorMessage(null);
    try {
      for (const item of items) {
        if (!item.match) continue;
        const qty = Number(item.quantityInput);
        const { scale } = resolveQuantity(qty, item.unit, item.match);
        if (scale <= 0) continue;

        const cachedFood = await findOrCacheFood(item.match);
        await createFoodLog({
          foodId: cachedFood.id,
          loggedAt: loggedAtIso(logDate),
          mealType,
          quantityAmount: qty,
          // Store the unit as spoken, so the log reads "×2" rather than a gram weight the user
          // never said. Macros are already resolved through the portion conversion above.
          quantityUnit: item.unit,
          calories: Math.round(item.match.calories * scale),
          proteinG: Math.round(item.match.proteinG * scale),
          carbsG: Math.round(item.match.carbsG * scale),
          fatG: Math.round(item.match.fatG * scale),
          inputMethod: 'voice',
          photoUri: null,
          rawTranscript: transcript,
        });
        await touchFoodLastUsed(cachedFood.id);
      }
      navigation.popToTop();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save');
      setPhase('reviewItems');
    }
  }

  // Mirrors the guard in handleSaveAll, so the button count never promises rows that get skipped
  // (a count with no available serving weight can't be converted and won't be written).
  const savableCount = items.filter(
    (it) => it.match && resolveQuantity(Number(it.quantityInput), it.unit, it.match).scale > 0
  ).length;

  if (missingKeys) {
    return (
      <SafeAreaView style={styles.centeredContainer} edges={['bottom']}>
        <Ionicons name="key-outline" size={40} color={colors.textMuted} />
        <Text style={styles.title}>Voice logging needs API keys</Text>
        <Text style={styles.subtitle}>
          Add EXPO_PUBLIC_GROQ_API_KEY and EXPO_PUBLIC_GEMINI_API_KEY to your .env file (see
          .env.example), then restart the dev server.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {(phase === 'idle' || phase === 'recording') && (
        <View style={styles.centeredContent}>
          <Ionicons name="mic-outline" size={40} color={colors.textMuted} />
          <Text style={styles.title}>{phase === 'recording' ? 'Listening…' : 'Voice logging'}</Text>
          <Text style={styles.subtitle}>
            {phase === 'recording'
              ? formatDuration(recorder.durationMillis)
              : 'Describe your meal out loud, then tap the mic again to stop.'}
          </Text>
          <Pressable
            style={[styles.micButton, phase === 'recording' && styles.micButtonActive]}
            onPress={phase === 'recording' ? handleStopRecording : handleStartRecording}
          >
            <Ionicons name={phase === 'recording' ? 'stop' : 'mic'} size={32} color="#FFFFFF" />
          </Pressable>
        </View>
      )}

      {(phase === 'transcribing' || phase === 'parsing' || phase === 'saving') && (
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color={colors.textMuted} />
          <Text style={styles.subtitle}>
            {phase === 'transcribing' ? 'Transcribing…' : phase === 'parsing' ? 'Parsing meal…' : 'Saving…'}
          </Text>
        </View>
      )}

      {phase === 'reviewTranscript' && (
        <View style={styles.flexContainer}>
          <Text style={styles.label}>Transcript</Text>
          <TextInput
            style={styles.transcriptInput}
            value={transcript}
            onChangeText={setTranscript}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButton} onPress={() => setPhase('idle')}>
              <Text style={styles.secondaryButtonText}>Re-record</Text>
            </Pressable>
            <Pressable
              style={[styles.saveButton, styles.flex1, !transcript.trim() && styles.saveButtonDisabled]}
              onPress={handleParse}
              disabled={!transcript.trim()}
            >
              <Text style={styles.saveButtonText}>Parse meal</Text>
            </Pressable>
          </View>
        </View>
      )}

      {phase === 'reviewItems' && (
        <View style={styles.flexContainer}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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

            <Text style={styles.label}>Items</Text>
            {items.map((item) => {
              const qty = Number(item.quantityInput);
              const resolved = item.match
                ? resolveQuantity(qty, item.unit, item.match)
                : null;
              const previewCalories =
                item.match && resolved ? Math.round(item.match.calories * resolved.scale) : null;
              const unresolvedCount = item.unit === 'each' && resolved !== null && resolved.scale <= 0;
              return (
                <View key={item.key} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.match?.name ?? item.originalFood}
                    </Text>
                    <Pressable onPress={() => removeItem(item.key)} hitSlop={8}>
                      <Ionicons name="close" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                  {item.match ? (
                    <>
                      <View style={styles.itemRow}>
                        <TextInput
                          style={styles.quantityInput}
                          value={item.quantityInput}
                          onChangeText={(v) => updateQuantity(item.key, v)}
                          keyboardType="numeric"
                        />
                        <Text style={styles.unitText}>
                          {item.unit === 'each' ? (qty === 1 ? 'item' : 'items') : item.unit}
                        </Text>
                        <Text style={styles.itemCalories}>
                          {previewCalories != null && resolved && resolved.scale > 0
                            ? `${previewCalories} cal`
                            : '—'}
                        </Text>
                      </View>
                      {/* Counts hide the real weight behind an average, so show what it worked
                          out to — the difference between 2 eggs and 100g is worth seeing. */}
                      {resolved?.portion && resolved.resolvedAmount != null && (
                        <Text style={styles.conversionNote}>
                          {resolved.portion.label} ≈ {Math.round(resolved.portion.gramWeight)}g · total{' '}
                          {Math.round(resolved.resolvedAmount)}
                          {item.match.referenceUnit}
                        </Text>
                      )}
                      {unresolvedCount && (
                        <Text style={styles.noMatchText}>
                          No serving size available for this food — switch to grams by editing the
                          transcript, or log it manually.
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.noMatchText}>
                      No database match for "{item.originalFood}" — remove it and add manually from Home.
                    </Text>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <Pressable
            style={[styles.saveButton, savableCount === 0 && styles.saveButtonDisabled]}
            onPress={handleSaveAll}
            disabled={savableCount === 0}
          >
            <Text style={styles.saveButtonText}>
              Log {savableCount} item{savableCount === 1 ? '' : 's'}
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  flexContainer: { flex: 1, gap: 12 },
  centeredContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 32,
  },
  centeredContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontFamily: fonts.medium, fontSize: 22, color: colors.text, marginTop: 4 },
  subtitle: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: mealTheme.dinner.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  micButtonActive: { backgroundColor: '#B3261E' },
  errorBanner: {
    backgroundColor: 'rgba(179, 38, 30, 0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontFamily: fonts.regular, fontSize: 13, color: '#B3261E' },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted, marginBottom: 4 },
  transcriptInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  scrollContent: { gap: 8, paddingBottom: 12 },
  mealRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  mealChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#FFFFFF' },
  mealChipActive: { backgroundColor: colors.textMuted },
  mealChipText: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  mealChipTextActive: { fontFamily: fonts.medium, color: '#FFFFFF' },
  itemCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, gap: 8 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontFamily: fonts.medium, fontSize: 15, color: colors.text, flex: 1, marginRight: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  conversionNote: { fontFamily: fonts.regular, fontSize: 11, color: 'rgba(127, 94, 87, 0.75)' },
  itemCalories: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  noMatchText: { fontFamily: fonts.regular, fontSize: 13, color: 'rgba(179, 38, 30, 0.8)' },
  saveButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { fontFamily: fonts.medium, color: '#FFFFFF', fontSize: 16 },
});
