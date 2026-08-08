import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../utils/theme';

export type TimeRange = 'week' | 'month' | '3month' | '6month' | 'all';

const TABS: { key: TimeRange; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: '3month', label: '3 Mo' },
  { key: '6month', label: '6 Mo' },
  { key: 'all', label: 'All Time' },
];

interface Props {
  active: TimeRange;
  onChange: (range: TimeRange) => void;
}

export function TimeRangeTabs({ active, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable key={tab.key} style={styles.tab} onPress={() => onChange(tab.key)} hitSlop={4}>
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
            <View style={[styles.indicator, isActive && styles.indicatorActive]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 24,
    paddingHorizontal: 16,
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
