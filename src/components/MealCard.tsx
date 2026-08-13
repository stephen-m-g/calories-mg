import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MealType } from '../types/models';
import type { FoodLogWithFoodName } from '../db';
import { mealTheme, fonts } from '../utils/theme';
import { formatLoggedQuantity } from '../services/quantity';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

const MAX_NAME_WIDTH = Dimensions.get('window').width * 0.5;

interface Props {
  mealType: MealType;
  logs: FoodLogWithFoodName[];
  expanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onLogPress: () => void;
  onDeleteLog: (logId: string) => void;
}

export function MealCard({ mealType, logs, expanded, isFirst, isLast, onToggle, onLogPress, onDeleteLog }: Props) {
  const theme = mealTheme[mealType];
  const logCount = logs.length;
  const totalCalories = logs.reduce((sum, l) => sum + l.calories, 0);

  const [measuredHeight, setMeasuredHeight] = useState(0);
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const targetHeight = expanded && logCount > 0 ? measuredHeight : 0;

  useEffect(() => {
    Animated.spring(animatedHeight, {
      toValue: targetHeight,
      friction: 9,
      tension: 45,
      useNativeDriver: false,
    }).start();
  }, [targetHeight, animatedHeight]);

  function confirmDelete(log: FoodLogWithFoodName) {
    Alert.alert('Remove entry?', `Remove "${log.foodName}" from ${MEAL_LABELS[mealType]}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onDeleteLog(log.id) },
    ]);
  }

  const itemRows = (
    <>
      {logs.map((log) => (
        <Pressable
          key={log.id}
          style={styles.entryRow}
          onPress={() => {}}
          onLongPress={() => confirmDelete(log)}
          delayLongPress={400}
        >
          <View style={styles.entryTextCol}>
            <Text style={styles.entryName} numberOfLines={1} ellipsizeMode="tail">
              {log.foodName}
            </Text>
            <Text style={styles.entryQuantity}>{formatLoggedQuantity(log)}</Text>
          </View>
          <Text style={styles.entryCalories}>{Math.round(log.calories)} cal</Text>
        </Pressable>
      ))}

      {logCount > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL:</Text>
          <Text style={styles.totalCalories}>{Math.round(totalCalories)} cal</Text>
        </View>
      )}
    </>
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.bg, borderColor: theme.border },
        !isFirst && styles.overlap,
        isLast && styles.lastCorners,
      ]}
    >
      <Pressable style={styles.header} onPress={onToggle} disabled={logCount === 0 && !expanded}>
        <Text style={styles.title}>{MEAL_LABELS[mealType]}</Text>
        <Pressable style={[styles.logButton, { backgroundColor: theme.border }]} onPress={onLogPress}>
          <Text style={styles.logButtonText}>log</Text>
        </Pressable>
      </Pressable>

      {logCount === 0 && <Text style={styles.empty}>Nothing logged yet</Text>}
      {!expanded && logCount > 0 && (
        <Text style={styles.summary}>
          {logCount} item{logCount === 1 ? '' : 's'} · {Math.round(totalCalories)} kcal total
        </Text>
      )}

      {/*
        Hidden measurement clone: fully decoupled from the visible animated view below,
        so its onLayout reading can never be perturbed by the animation itself (which
        was the cause of the flicker — the old version measured the same view it was
        animating, and a stray re-measure mid-flight would restart the spring).
      */}
      <View
        style={styles.measureClone}
        pointerEvents="none"
        onLayout={(e) => setMeasuredHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.expandedBody}>{itemRows}</View>
      </View>

      <Animated.View style={{ height: animatedHeight, overflow: 'hidden' }}>
        <View style={styles.expandedBody}>{itemRows}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    minHeight: 130,
    borderWidth: 2,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 16,
    gap: 8,
  },
  // Pulls this card up to overlap the card above by exactly the card's own
  // padding, so the overlap eats empty padding, never real content — and the
  // rounded top corners (always-on, every card) reveal a sliver of the card
  // behind at each seam, giving the stacked/overlapping look.
  overlap: { marginTop: -16 },
  lastCorners: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 20,
    color: '#7F5E57',
  },
  logButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 0.6,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  logButtonText: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  empty: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(127, 94, 87, 0.7)',
  },
  summary: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: '#7F5E57',
  },
  // Invisible, out of flow (absolute), and never clipped — exists purely so
  // onLayout can report the content's true natural height at all times.
  measureClone: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0,
  },
  expandedBody: { gap: 12, paddingTop: 4, paddingBottom: 16 },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  entryTextCol: { flexShrink: 1 },
  entryName: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.75)',
    maxWidth: MAX_NAME_WIDTH,
  },
  entryQuantity: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: 'rgba(0, 0, 0, 0.75)',
  },
  entryCalories: {
    fontFamily: fonts.regular,
    fontSize: 17,
    color: 'rgba(0, 0, 0, 0.75)',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: '#000000',
  },
  totalCalories: {
    fontFamily: fonts.regular,
    fontSize: 22,
    color: '#000000',
  },
});
