import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../utils/theme';

export function AddFoodPhotoScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
      <Text style={styles.title}>Photo logging</Text>
      <Text style={styles.subtitle}>Snap a plate and let AI estimate the meal — coming in a later phase.</Text>
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
