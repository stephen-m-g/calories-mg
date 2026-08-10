import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { File } from 'expo-file-system';
import type { RootStackParamList } from '../navigation/types';
import { transcribeAudio } from '../services/groqTranscribe';
import { parseMealTranscript } from '../services/geminiParseMeal';
import { buildDraftItems } from '../services/mealDraftBuilder';
import { useMealDraft } from '../state/MealDraftContext';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { env } from '../utils/env';
import { colors, fonts, mealTheme } from '../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddFoodVoice'>;

type Phase = 'idle' | 'recording' | 'transcribing' | 'reviewTranscript' | 'parsing';

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

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function AddFoodVoiceScreen({ route, navigation }: Props) {
  const { logDate, initialMealType } = route.params;
  const recorder = useVoiceRecorder();
  const draft = useMealDraft();

  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
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
      draft.startDraft({
        items: await buildDraftItems(parsed, 'voice'),
        source: 'voice',
        mealType: initialMealType ?? 'breakfast',
        logDate,
        transcript,
        photoUri: null,
      });
      navigation.navigate('MealReview');
      setPhase('reviewTranscript');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Parsing failed');
      setPhase('reviewTranscript');
    }
  }

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

      {(phase === 'transcribing' || phase === 'parsing') && (
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color={colors.textMuted} />
          <Text style={styles.subtitle}>
            {phase === 'transcribing' ? 'Transcribing…' : 'Parsing meal…'}
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
  saveButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { fontFamily: fonts.medium, color: '#FFFFFF', fontSize: 16 },
});
