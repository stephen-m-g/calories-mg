import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { SearchResultFood } from '../types/search';
import { getFoodByBarcode } from '../db';
import { lookupOpenFoodFactsBarcode } from '../services/openFoodFacts';
import { extractNutritionLabel } from '../services/geminiLabel';
import { env } from '../utils/env';
import { colors, fonts, mealTheme } from '../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddFoodBarcode'>;

type Phase = 'scanning' | 'looking-up' | 'not-found' | 'label-capture' | 'reading-label';

/** Retail product barcodes only — QR and the document formats would just cause misfires. */
const PRODUCT_BARCODES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e'];

export function AddFoodBarcodeScreen({ route, navigation }: Props) {
  const { logDate, initialMealType } = route.params;
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [barcode, setBarcode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The scanner fires continuously while a barcode is in frame; without this guard a single
  // scan would kick off a lookup on every frame.
  const handledRef = useRef(false);

  function openEntry(food: SearchResultFood) {
    navigation.replace('AddFoodEntry', { food, logDate, initialMealType });
  }

  async function handleScanned(code: string) {
    if (handledRef.current) return;
    handledRef.current = true;
    setBarcode(code);
    setPhase('looking-up');
    setErrorMessage(null);

    try {
      // Check locally first: a barcode saved from a previous label scan won't exist upstream,
      // and a previously-scanned product shouldn't need the network again.
      const cached = await getFoodByBarcode(code);
      if (cached) {
        openEntry({
          source: cached.source,
          sourceId: cached.sourceId ?? cached.id,
          barcode: cached.barcode,
          name: cached.name,
          brand: cached.brand,
          referenceAmount: cached.referenceAmount,
          referenceUnit: cached.referenceUnit,
          calories: cached.calories,
          proteinG: cached.proteinG,
          carbsG: cached.carbsG,
          fatG: cached.fatG,
          fiberG: cached.fiberG,
          sugarG: cached.sugarG,
          sodiumMg: cached.sodiumMg,
          isGeneric: false,
          // Persisted now, so a re-scanned product keeps the serving its label declared instead
          // of dropping back to a bare 100 g.
          portions: cached.portions,
        });
        return;
      }

      const found = await lookupOpenFoodFactsBarcode(code);
      if (found) {
        openEntry(found);
        return;
      }
      setPhase('not-found');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Barcode lookup failed');
      setPhase('not-found');
    }
  }

  async function handleCaptureLabel() {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
    if (!photo?.uri) return;

    setPhase('reading-label');
    setErrorMessage(null);
    try {
      const label = await extractNutritionLabel(photo.uri);
      // Hand off to the custom-food form rather than saving blind — OCR on small print needs a
      // human check, and the form already knows how to validate and store this shape.
      navigation.replace('CreateCustomFood', {
        barcode,
        prefill: {
          name: label.name,
          servingAmount: label.servingAmount,
          servingUnit: label.servingUnit,
          calories: label.calories,
          proteinG: label.proteinG,
          carbsG: label.carbsG,
          fatG: label.fatG,
        },
        logDate,
        initialMealType,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not read that label');
      setPhase('label-capture');
    }
  }

  function resetScan() {
    handledRef.current = false;
    setBarcode(null);
    setErrorMessage(null);
    setPhase('scanning');
  }

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <Ionicons name="barcode-outline" size={40} color={colors.textMuted} />
        <Text style={styles.title}>Camera access</Text>
        <Text style={styles.subtitle}>
          {permission?.canAskAgain === false
            ? 'Camera access was denied. Enable it in system settings to scan barcodes.'
            : 'Allow camera access to scan a product barcode.'}
        </Text>
        {permission?.canAskAgain !== false && (
          <Pressable style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Allow camera</Text>
          </Pressable>
        )}
      </SafeAreaView>
    );
  }

  if (phase === 'looking-up' || phase === 'reading-label') {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <ActivityIndicator size="large" color={colors.textMuted} />
        <Text style={styles.subtitle}>
          {phase === 'looking-up' ? 'Looking up that barcode…' : 'Reading the label…'}
        </Text>
      </SafeAreaView>
    );
  }

  if (phase === 'not-found') {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <Ionicons name="help-circle-outline" size={40} color={colors.textMuted} />
        <Text style={styles.title}>Not in the database</Text>
        <Text style={styles.subtitle}>
          {barcode ? `No product found for ${barcode}. ` : ''}
          Photograph the nutrition label and it'll be read automatically, then saved against this
          barcode for next time.
        </Text>
        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        {env.geminiApiKey ? (
          <Pressable style={styles.primaryButton} onPress={() => setPhase('label-capture')}>
            <Text style={styles.primaryButtonText}>Photograph label</Text>
          </Pressable>
        ) : (
          <Text style={styles.errorText}>
            Reading labels needs EXPO_PUBLIC_GEMINI_API_KEY in your .env file.
          </Text>
        )}
        <Pressable onPress={resetScan} hitSlop={8}>
          <Text style={styles.linkText}>Scan a different barcode</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const capturingLabel = phase === 'label-capture';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      <View style={styles.cameraWrap}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={capturingLabel ? undefined : { barcodeTypes: PRODUCT_BARCODES }}
          onBarcodeScanned={capturingLabel ? undefined : ({ data }) => handleScanned(data)}
        />
      </View>

      <Text style={styles.hint}>
        {capturingLabel
          ? 'Fill the frame with the nutrition facts panel, then tap to capture.'
          : 'Point the camera at the product barcode.'}
      </Text>

      {capturingLabel && (
        <View style={styles.controls}>
          <Pressable style={styles.shutter} onPress={handleCaptureLabel}>
            <Ionicons name="camera" size={30} color="#FFFFFF" />
          </Pressable>
        </View>
      )}
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
  title: { fontFamily: fonts.medium, fontSize: 20, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  linkText: { fontFamily: fonts.medium, fontSize: 14, color: mealTheme.dinner.border },
  errorBanner: {
    backgroundColor: 'rgba(179, 38, 30, 0.1)',
    borderRadius: 10,
    padding: 12,
    margin: 16,
    marginBottom: 0,
  },
  errorText: { fontFamily: fonts.regular, fontSize: 13, color: '#B3261E', textAlign: 'center' },
  cameraWrap: { flex: 1, margin: 16, borderRadius: 16, overflow: 'hidden' },
  camera: { flex: 1 },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  controls: { alignItems: 'center', paddingVertical: 16 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: mealTheme.dinner.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 4,
  },
  primaryButtonText: { fontFamily: fonts.medium, color: '#FFFFFF', fontSize: 15 },
});
