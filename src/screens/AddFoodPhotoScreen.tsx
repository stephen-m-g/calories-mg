import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { analyzeMealPhoto } from '../services/geminiVision';
import { buildDraftItems } from '../services/mealDraftBuilder';
import { useMealDraft } from '../state/MealDraftContext';
import { env } from '../utils/env';
import { colors, fonts, mealTheme } from '../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddFoodPhoto'>;

type Phase = 'capture' | 'analyzing';

const PHOTO_DIR = 'meal-photos';

/**
 * Moves a captured/picked image out of the cache into permanent storage. Camera output and
 * picker results live in a cache directory the OS can reclaim at any time, which would leave
 * saved logs pointing at files that have silently disappeared.
 */
function persistPhoto(sourceUri: string): string {
  const dir = new Directory(Paths.document, PHOTO_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  const source = new File(sourceUri);
  const target = new File(dir, `${Date.now()}.jpg`);
  source.copy(target);
  return target.uri;
}

export function AddFoodPhotoScreen({ route, navigation }: Props) {
  const { logDate, initialMealType } = route.params;
  const draft = useMealDraft();
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('capture');
  const [preview, setPreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function analyze(sourceUri: string) {
    setPhase('analyzing');
    setErrorMessage(null);
    setPreview(sourceUri);
    try {
      const stored = persistPhoto(sourceUri);
      const found = await analyzeMealPhoto(stored);
      if (found.length === 0) {
        setErrorMessage("Couldn't identify any food in that photo. Try again with the plate filling more of the frame.");
        setPhase('capture');
        setPreview(null);
        return;
      }
      const items = await buildDraftItems(found, 'photo');
      draft.startDraft({
        items,
        source: 'photo',
        mealType: initialMealType ?? 'breakfast',
        logDate,
        transcript: null,
        photoUri: stored,
      });
      navigation.replace('MealReview');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Photo analysis failed');
      setPhase('capture');
      setPreview(null);
    }
  }

  async function handleCapture() {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
    if (photo?.uri) await analyze(photo.uri);
  }

  async function handlePickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await analyze(result.assets[0].uri);
    }
  }

  if (!env.geminiApiKey) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <Ionicons name="key-outline" size={40} color={colors.textMuted} />
        <Text style={styles.title}>Photo logging needs an API key</Text>
        <Text style={styles.subtitle}>
          Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file, then restart the dev server.
        </Text>
      </SafeAreaView>
    );
  }

  if (phase === 'analyzing') {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        {preview && <Image source={{ uri: preview }} style={styles.previewImage} resizeMode="cover" />}
        <ActivityIndicator size="large" color={colors.textMuted} />
        <Text style={styles.subtitle}>Looking at your meal…</Text>
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

      {permission?.granted ? (
        <View style={styles.cameraWrap}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        </View>
      ) : (
        <View style={styles.permissionCard}>
          <Ionicons name="camera-outline" size={36} color={colors.textMuted} />
          <Text style={styles.title}>Camera access</Text>
          <Text style={styles.subtitle}>
            {permission?.canAskAgain === false
              ? 'Camera access was denied. Enable it in system settings, or pick an existing photo below.'
              : 'Allow camera access to photograph your meal, or pick an existing photo below.'}
          </Text>
          {permission?.canAskAgain !== false && (
            <Pressable style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>Allow camera</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.controls}>
        <Pressable style={styles.libraryButton} onPress={handlePickFromLibrary}>
          <Ionicons name="images-outline" size={22} color={colors.textMuted} />
          <Text style={styles.libraryButtonText}>Library</Text>
        </Pressable>

        <Pressable
          style={[styles.shutter, !permission?.granted && styles.shutterDisabled]}
          onPress={handleCapture}
          disabled={!permission?.granted}
        >
          <Ionicons name="camera" size={30} color="#FFFFFF" />
        </Pressable>

        {/* Balances the row so the shutter stays centred. */}
        <View style={styles.controlSpacer} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  previewImage: { width: 180, height: 180, borderRadius: 16, marginBottom: 8 },
  title: { fontFamily: fonts.medium, fontSize: 20, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  errorBanner: {
    backgroundColor: 'rgba(179, 38, 30, 0.1)',
    borderRadius: 10,
    padding: 12,
    margin: 16,
    marginBottom: 0,
  },
  errorText: { fontFamily: fonts.regular, fontSize: 13, color: '#B3261E' },
  cameraWrap: { flex: 1, margin: 16, borderRadius: 16, overflow: 'hidden' },
  camera: { flex: 1 },
  permissionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  permissionButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 4,
  },
  permissionButtonText: { fontFamily: fonts.medium, color: '#FFFFFF', fontSize: 15 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  libraryButton: { alignItems: 'center', gap: 2, width: 64 },
  libraryButtonText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: mealTheme.dinner.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: { opacity: 0.4 },
  controlSpacer: { width: 64 },
});
