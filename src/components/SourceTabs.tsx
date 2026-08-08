import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../utils/theme';

export type SearchSource = 'all' | 'recipes' | 'foods';

const TABS: { key: SearchSource; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'recipes', label: 'My Recipes' },
  { key: 'foods', label: 'My Foods' },
];

interface Props {
  active: SearchSource;
  onChange: (source: SearchSource) => void;
}

export function SourceTabs({ active, onChange }: Props) {
  return (
    <View style={styles.row}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable key={tab.key} style={styles.tab} onPress={() => onChange(tab.key)} hitSlop={4}>
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
            <View style={[styles.indicator, isActive && styles.indicatorActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 32,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  tab: {
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(127, 94, 87, 0.55)',
  },
  labelActive: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  indicator: {
    height: 2,
    width: 16,
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  indicatorActive: {
    backgroundColor: colors.textMuted,
  },
});
