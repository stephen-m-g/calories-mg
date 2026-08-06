import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../utils/theme';

export function SettingsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Goals, water, WHOOP, and backup land in a later phase.</Text>
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
  title: { fontFamily: fonts.medium, fontSize: 22, color: colors.text },
  subtitle: { fontFamily: fonts.regular, color: colors.textMuted, textAlign: 'center' },
});
