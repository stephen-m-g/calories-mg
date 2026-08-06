import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../utils/theme';

export function ProgressScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Progress</Text>
      <Text style={styles.subtitle}>History and trend charts land in a later phase.</Text>
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
  title: { fontFamily: fonts.medium, fontSize: 24, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: 16, color: colors.textMuted, textAlign: 'center' },
});
