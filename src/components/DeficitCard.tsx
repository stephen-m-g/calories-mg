import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, mealTheme } from '../utils/theme';

interface Props {
  caloriesEaten: number;
  /** Null until WHOOP has been synced at least once for this day. */
  caloriesBurned: number | null;
  deficitGoalKcal: number | null;
  protein: number;
  proteinGoal: number | null;
  carbs: number;
  carbsGoal: number | null;
  fat: number;
  fatGoal: number | null;
  /** True when the burn figure came from cache rather than a fresh sync. */
  burnedFromCache: boolean;
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
 * Deficit-mode header: eaten, burned, net, and target net as plain numbers.
 *
 * Deliberately not collapsed into a single "calories remaining today". Doing that would require
 * projecting the rest of the day's burn from an estimated TDEE or rolling average — a real
 * modelling assumption with its own error bars. Showing the components keeps the figure honest
 * at every hour, including first thing in the morning when burned-so-far is naturally tiny.
 */
export function DeficitCard({
  caloriesEaten,
  caloriesBurned,
  deficitGoalKcal,
  protein,
  proteinGoal,
  carbs,
  carbsGoal,
  fat,
  fatGoal,
  burnedFromCache,
}: Props) {
  const hasBurn = caloriesBurned != null;
  const net = hasBurn ? caloriesEaten - caloriesBurned : null;
  const targetNet = deficitGoalKcal != null ? -deficitGoalKcal : null;
  // Net below target means the deficit goal is currently being met.
  const onTrack = net != null && targetNet != null && net <= targetNet;

  return (
    <View style={styles.card}>
      <View style={styles.netBlock}>
        <Text style={[styles.netValue, onTrack && styles.netValueOnTrack]}>
          {net != null ? `${net > 0 ? '+' : ''}${Math.round(net)}` : '—'}
        </Text>
        <Text style={styles.netLabel}>
          net calories{targetNet != null ? ` · target ${Math.round(targetNet)}` : ''}
        </Text>
      </View>

      <View style={styles.calorieRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{Math.round(caloriesEaten)}</Text>
          <Text style={styles.statLabel}>eaten</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{hasBurn ? Math.round(caloriesBurned) : '—'}</Text>
          <Text style={styles.statLabel}>burned</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {net != null && targetNet != null ? Math.round(targetNet - net) : '—'}
          </Text>
          <Text style={styles.statLabel}>to target</Text>
        </View>
      </View>

      {!hasBurn && (
        <Text style={styles.note}>
          Waiting on WHOOP for today's burn — pull down to refresh.
        </Text>
      )}
      {hasBurn && burnedFromCache && (
        <Text style={styles.note}>Burn figure is the last synced value.</Text>
      )}

      <View style={styles.macroRow}>
        <MacroPill label="Protein" value={protein} goal={proteinGoal} />
        <MacroPill label="Carbs" value={carbs} goal={carbsGoal} />
        <MacroPill label="Fat" value={fat} goal={fatGoal} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', borderRadius: 12, padding: 16, gap: 12 },
  netBlock: { alignItems: 'center', gap: 2 },
  netValue: { fontFamily: fonts.extraBold, fontSize: 40, color: colors.text },
  netValueOnTrack: { color: mealTheme.dinner.border },
  netLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  calorieRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statValue: { fontFamily: fonts.medium, fontSize: 20, color: colors.text },
  statLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  divider: { width: 1, height: 32, backgroundColor: colors.cardBorder, opacity: 0.3 },
  note: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: 'rgba(127, 94, 87, 0.8)',
    textAlign: 'center',
  },
  macroRow: { flexDirection: 'row', justifyContent: 'space-between' },
  macro: { alignItems: 'center', flex: 1 },
  macroValue: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  macroLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
});
