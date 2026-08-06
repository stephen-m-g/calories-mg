import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../navigation/types';
import type { MealType, UserSettings } from '../types/models';
import {
  getFoodLogsWithNamesBetween,
  getUserSettings,
  deleteFoodLog,
  hasFoodLogsBetween,
  type FoodLogWithFoodName,
} from '../db';
import { todayYmd, dayBoundsIso, formatHeaderDate, getWeekDates, startOfWeekYmd } from '../utils/date';
import { colors, fonts } from '../utils/theme';
import { CalorieMacroCard } from '../components/CalorieMacroCard';
import { MealCard } from '../components/MealCard';
import { WeekStrip } from '../components/WeekStrip';
import { DateCalendarModal } from '../components/DateCalendarModal';

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function TodayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [selectedDate, setSelectedDate] = useState(todayYmd());
  const [viewedWeekStart, setViewedWeekStart] = useState(startOfWeekYmd(todayYmd()));
  const [logs, setLogs] = useState<FoodLogWithFoodName[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loggedDays, setLoggedDays] = useState<Set<string>>(new Set());
  const [expandedMealType, setExpandedMealType] = useState<MealType | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // The week strip can be swiped to browse other weeks without changing which
  // day is actually active — so it re-syncs to the active day's week whenever
  // that day changes (tapping a circle, or picking a date in the calendar),
  // but browsing the strip alone doesn't touch selectedDate at all.
  useEffect(() => {
    setViewedWeekStart(startOfWeekYmd(selectedDate));
  }, [selectedDate]);

  const loadDay = useCallback(async () => {
    const { startIso, endIso } = dayBoundsIso(selectedDate);
    const [todaysLogs, userSettings] = await Promise.all([
      getFoodLogsWithNamesBetween(startIso, endIso),
      getUserSettings(),
    ]);
    setLogs(todaysLogs);
    setSettings(userSettings);
  }, [selectedDate]);

  const loadWeek = useCallback(async () => {
    const weekDates = getWeekDates(viewedWeekStart);
    const weekHasLogs = await Promise.all(
      weekDates.map((ymd) => {
        const bounds = dayBoundsIso(ymd);
        return hasFoodLogsBetween(bounds.startIso, bounds.endIso);
      })
    );
    setLoggedDays(new Set(weekDates.filter((_, i) => weekHasLogs[i])));
  }, [viewedWeekStart]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  useFocusEffect(
    useCallback(() => {
      loadDay();
      loadWeek();
    }, [loadDay, loadWeek])
  );

  const totals = logs.reduce(
    (acc, log) => ({
      calories: acc.calories + log.calories,
      protein: acc.protein + log.proteinG,
      carbs: acc.carbs + log.carbsG,
      fat: acc.fat + log.fatG,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const mealCaloriesByType = MEAL_ORDER.reduce((acc, mealType) => {
    acc[mealType] = logs
      .filter((l) => l.mealType === mealType)
      .reduce((sum, l) => sum + l.calories, 0);
    return acc;
  }, {} as Record<MealType, number>);

  async function handleDeleteFoodLog(logId: string) {
    await deleteFoodLog(logId);
    loadDay();
  }

  function toggleMeal(mealType: MealType) {
    setExpandedMealType((cur) => (cur === mealType ? null : mealType));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable style={styles.dateRow} onPress={() => setCalendarOpen(true)} hitSlop={8}>
            <Text style={styles.dateText}>{formatHeaderDate(selectedDate)}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={8}>
            <Ionicons name="settings-outline" size={24} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.weekStripWrap}>
          <WeekStrip
            activeDate={selectedDate}
            viewedWeekStart={viewedWeekStart}
            loggedDays={loggedDays}
            onSelectDay={setSelectedDate}
            onWeekChange={setViewedWeekStart}
          />
        </View>

        <View style={styles.calorieWrap}>
          <CalorieMacroCard
            caloriesEaten={totals.calories}
            calorieGoal={settings?.calorieGoal ?? 2000}
            mealCalories={mealCaloriesByType}
            protein={totals.protein}
            proteinGoal={settings?.proteinGoalG ?? null}
            carbs={totals.carbs}
            carbsGoal={settings?.carbsGoalG ?? null}
            fat={totals.fat}
            fatGoal={settings?.fatGoalG ?? null}
          />
        </View>

        <View style={styles.meals}>
          {MEAL_ORDER.map((mealType, index) => {
            const mealLogs = logs.filter((l) => l.mealType === mealType);
            return (
              <MealCard
                key={mealType}
                mealType={mealType}
                logs={mealLogs}
                expanded={expandedMealType === mealType}
                isFirst={index === 0}
                isLast={index === MEAL_ORDER.length - 1}
                onToggle={() => toggleMeal(mealType)}
                onLogPress={() => navigation.navigate('AddFoodSearch', { initialMealType: mealType })}
                onDeleteLog={handleDeleteFoodLog}
              />
            );
          })}
        </View>
      </ScrollView>

      <DateCalendarModal
        visible={calendarOpen}
        selectedDate={selectedDate}
        onSelect={(ymd) => {
          setSelectedDate(ymd);
          setCalendarOpen(false);
        }}
        onClose={() => setCalendarOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, paddingTop: 8, paddingBottom: 110 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  dateText: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.textMuted,
  },
  weekStripWrap: { marginBottom: 24 },
  calorieWrap: { marginBottom: 24 },
  meals: { gap: 0 },
});
