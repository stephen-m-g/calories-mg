import { StyleSheet, Text, View } from 'react-native';
import type { MealType } from '../types/models';
import { colors, fonts, mealTheme } from '../utils/theme';

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface Props {
  caloriesEaten: number;
  calorieGoal: number;
  mealCalories: Record<MealType, number>;
  protein: number;
  proteinGoal: number | null;
  carbs: number;
  carbsGoal: number | null;
  fat: number;
  fatGoal: number | null;
}

function MacroPill({ label, value, goal }: { label: string; value: number; goal: number | null }) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValue}>{Math.round(value)}g</Text>
      <Text style={styles.macroLabel}>
        {label}
        {goal ? ` / ${goal}g` : ''}
      </Text>
    </View>
  );
}

/**
 * Segment widths are proportional to each meal's own calories, not to the goal —
 * under goal, segment_i = mealCalories_i / goal (so unfilled track remains);
 * over goal, the bar is fully filled and segment_i = mealCalories_i / totalEaten
 * (each meal's share of the whole bar). Order is always breakfast→lunch→dinner→snack,
 * regardless of what time of day each was actually logged.
 */
function computeSegmentWidths(
  mealCalories: Record<MealType, number>,
  goal: number,
  totalEaten: number
): { mealType: MealType; widthPct: number }[] {
  if (goal <= 0 || totalEaten <= 0) {
    return MEAL_ORDER.map((mealType) => ({ mealType, widthPct: 0 }));
  }
  const overGoal = totalEaten > goal;
  return MEAL_ORDER.map((mealType) => {
    const cals = mealCalories[mealType] ?? 0;
    const widthPct = overGoal ? (cals / totalEaten) * 100 : (cals / goal) * 100;
    return { mealType, widthPct };
  });
}

export function CalorieMacroCard({
  caloriesEaten,
  calorieGoal,
  mealCalories,
  protein,
  proteinGoal,
  carbs,
  carbsGoal,
  fat,
  fatGoal,
}: Props) {
  const remaining = Math.max(calorieGoal - caloriesEaten, 0);
  const segments = computeSegmentWidths(mealCalories, calorieGoal, caloriesEaten);

  return (
    <View style={styles.card}>
      <View style={styles.calorieRow}>
        <View>
          <Text style={styles.eatenValue}>{Math.round(caloriesEaten)}</Text>
          <Text style={styles.eatenLabel}>eaten</Text>
        </View>
        <View style={styles.calorieDivider} />
        <View>
          <Text style={styles.eatenValue}>{Math.round(remaining)}</Text>
          <Text style={styles.eatenLabel}>remaining</Text>
        </View>
        <View style={styles.calorieDivider} />
        <View>
          <Text style={styles.eatenValue}>{Math.round(calorieGoal)}</Text>
          <Text style={styles.eatenLabel}>goal</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        {segments.map(({ mealType, widthPct }) =>
          widthPct > 0 ? (
            <View
              key={mealType}
              style={{ width: `${widthPct}%`, backgroundColor: mealTheme[mealType].border }}
            />
          ) : null
        )}
      </View>

      <View style={styles.macroRow}>
        <MacroPill label="Protein" value={protein} goal={proteinGoal} />
        <MacroPill label="Carbs" value={carbs} goal={carbsGoal} />
        <MacroPill label="Fat" value={fat} goal={fatGoal} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  calorieDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.cardBorder,
    opacity: 0.3,
  },
  eatenValue: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.textMuted,
    textAlign: 'center',
  },
  eatenLabel: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  progressTrack: {
    flexDirection: 'row',
    height: 10.5,
    borderRadius: 5.25,
    backgroundColor: '#F0E4D6',
    overflow: 'hidden',
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macro: { alignItems: 'center', flex: 1 },
  macroValue: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.textMuted,
  },
  macroLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
});
