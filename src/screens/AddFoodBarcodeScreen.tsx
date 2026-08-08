import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../utils/theme';

export function AddFoodBarcodeScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Ionicons name="barcode-outline" size={40} color={colors.textMuted} />
      <Text style={styles.title}>Barcode scanning</Text>
      <Text style={styles.subtitle}>Scan a packaged food for exact label macros — coming in a later phase.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 32,
  },
  title: { fontFamily: fonts.medium, fontSize: 22, color: colors.text, marginTop: 4 },
  subtitle: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted, textAlign: 'center' },
});
