import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import {
  getFoodLogsBetween,
  getEarliestLoggedAt,
  getWeightLogsBetween,
  getEarliestWeightLoggedAt,
  getWhoopCyclesBetween,
  getWhoopConnection,
  createWeightLog,
  getRecentWeightLogs,
  deleteWeightLog,
} from '../db';
import type { WeightLog } from '../types/models';
import { todayYmd, shiftYmd, dayBoundsIso, isoToLocalYmd, formatHeaderDate } from '../utils/date';
import { colors, fonts, mealTheme } from '../utils/theme';
import { TimeRangeTabs, type TimeRange } from '../components/TimeRangeTabs';

const SCREEN_PADDING = 20;
const CARD_PADDING = 16;
const CHART_HEIGHT = 190;
/** Reserved for the y-axis tick labels; the plot area is whatever is left over. */
const Y_AXIS_LABEL_WIDTH = 40;
const CHART_WIDTH = Dimensions.get('window').width - SCREEN_PADDING * 2 - CARD_PADDING * 2;
const PLOT_WIDTH = CHART_WIDTH - Y_AXIS_LABEL_WIDTH;
const TICK_WIDTH = 46;

type Metric = 'calories' | 'net' | 'weight';

interface MetricOption {
  key: Metric;
  label: string;
  unit: string;
  /** Net calories needs WHOOP burn data, so it stays locked until a connection exists. */
  requiresWhoop?: boolean;
}

const METRIC_OPTIONS: MetricOption[] = [
  { key: 'calories', label: 'Calories Eaten', unit: 'cal' },
  { key: 'net', label: 'Net Calories', unit: 'cal', requiresWhoop: true },
  { key: 'weight', label: 'Weight', unit: 'lb' },
];

const RANGE_DAYS_BACK: Record<TimeRange, number> = {
  week: 6,
  month: 29,
  '3month': 89,
  '6month': 179,
  all: 0, // unused — 'all' derives its start from the earliest log
};

/** Whole-day difference between two YYYY-MM-DD dates (local calendar days, DST-safe). */
function daysBetween(fromYmd: string, toYmd: string): number {
  const [y1, m1, d1] = fromYmd.split('-').map(Number);
  const [y2, m2, d2] = toYmd.split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1).getTime();
  const b = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((b - a) / 86400000);
}

interface ChartPoint {
  label: string;
  /** Full text for the long-press tooltip. */
  dateLabel: string;
  value: number;
  ymd: string;
  /** False for week-view slots with no logged entry — rendered as an empty gap, never as a real 0. */
  hasData: boolean;
}

function formatShortLabel(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${m}/${d}`;
}

function enumerateDays(startYmd: string, endYmd: string): string[] {
  const days: string[] = [];
  for (let cursor = startYmd; cursor <= endYmd; cursor = shiftYmd(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}

interface ChartSeries {
  points: ChartPoint[];
  /** Left edge of the plotted window — the calendar day day-offset 0 corresponds to. */
  windowStartYmd: string;
}

async function buildSeries(metric: Metric, range: TimeRange): Promise<ChartSeries> {
  const endYmd = todayYmd();

  const earliestIso = metric === 'weight' ? await getEarliestWeightLoggedAt() : await getEarliestLoggedAt();
  const earliestYmd = earliestIso ? isoToLocalYmd(earliestIso) : endYmd;

  // The window never extends further back than real history exists, so a short history
  // renders left-anchored using only the days it actually spans, rather than being spaced
  // out across a full 30/90/180-day slot grid it hasn't earned yet.
  const maxWindowDays = range === 'all' ? Infinity : RANGE_DAYS_BACK[range] + 1;
  const historyDays = Math.max(daysBetween(earliestYmd, endYmd) + 1, 1);
  const windowDays = range === 'week' ? 7 : Math.min(maxWindowDays, historyDays);
  const windowStartYmd = shiftYmd(endYmd, -(windowDays - 1));

  const { startIso } = dayBoundsIso(windowStartYmd);
  const { endIso } = dayBoundsIso(endYmd);

  const byDay = new Map<string, number>();
  if (metric === 'calories') {
    for (const log of await getFoodLogsBetween(startIso, endIso)) {
      const ymd = isoToLocalYmd(log.loggedAt);
      byDay.set(ymd, (byDay.get(ymd) ?? 0) + log.calories);
    }
  } else if (metric === 'net') {
    // Net needs both sides of the equation, so a day only counts when it has a WHOOP burn
    // figure — eaten-with-no-burn would read as a huge surplus that never happened.
    const eatenByDay = new Map<string, number>();
    for (const log of await getFoodLogsBetween(startIso, endIso)) {
      const ymd = isoToLocalYmd(log.loggedAt);
      eatenByDay.set(ymd, (eatenByDay.get(ymd) ?? 0) + log.calories);
    }
    for (const cycle of await getWhoopCyclesBetween(windowStartYmd, endYmd)) {
      byDay.set(cycle.cycleDate, (eatenByDay.get(cycle.cycleDate) ?? 0) - cycle.caloriesBurned);
    }
  } else {
    // Logs come back ASC-ordered, so the last weigh-in of a day naturally wins here.
    for (const log of await getWeightLogsBetween(startIso, endIso)) {
      byDay.set(isoToLocalYmd(log.loggedAt), log.weightLbs);
    }
  }

  const toPoint = (ymd: string, hasData: boolean): ChartPoint => ({
    label: formatShortLabel(ymd),
    dateLabel: formatHeaderDate(ymd),
    value: byDay.get(ymd) ?? 0,
    ymd,
    hasData,
  });

  if (range === 'week') {
    // Always exactly 7 calendar slots ending on today, so the week reads as a fixed grid.
    const points = enumerateDays(windowStartYmd, endYmd).map((ymd) => toPoint(ymd, byDay.has(ymd)));
    return { points, windowStartYmd };
  }

  const points = Array.from(byDay.keys())
    .sort()
    .map((ymd) => toPoint(ymd, true));
  return { points, windowStartYmd };
}

/** Left/right breathing room so a point's radius never gets clipped by the plot edge. */
const EDGE_PAD = 8;

/** Each point's x-offset (px from the plot's left edge) based on real elapsed days from
 * windowStartYmd — so calendar gaps between sparse entries show as real visual gaps instead
 * of being compressed into a fixed slot grid. */
function computeOffsets(points: ChartPoint[], windowStartYmd: string, windowDays: number): number[] {
  const usableWidth = PLOT_WIDTH - EDGE_PAD * 2;
  const pixelsPerDay = usableWidth / Math.max(windowDays - 1, 1);
  return points.map((p) => EDGE_PAD + daysBetween(windowStartYmd, p.ymd) * pixelsPerDay);
}

interface Tick {
  left: number;
  text: string;
}

/** Up to `maxTicks` evenly-spaced date labels, dropping any that would collide with the last kept one. */
function pickTicks(points: ChartPoint[], offsets: number[], maxTicks = 4): Tick[] {
  if (!points.length) return [];
  const count = Math.min(maxTicks, points.length);
  const indices = Array.from(
    new Set(
      Array.from({ length: count }, (_, i) =>
        count === 1 ? 0 : Math.round((i * (points.length - 1)) / (count - 1))
      )
    )
  );

  const ticks: Tick[] = [];
  let lastRight = -Infinity;
  for (const index of indices) {
    const center = Y_AXIS_LABEL_WIDTH + offsets[index];
    const left = Math.min(Math.max(center - TICK_WIDTH / 2, 0), CHART_WIDTH - TICK_WIDTH);
    if (left < lastRight) continue;
    ticks.push({ left, text: points[index].label });
    lastRight = left + TICK_WIDTH;
  }
  return ticks;
}

export function ProgressScreen() {
  const [range, setRange] = useState<TimeRange>('week');
  const [metric, setMetric] = useState<Metric>('calories');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [series, setSeries] = useState<ChartSeries>({ points: [], windowStartYmd: todayYmd() });
  const [loadingChart, setLoadingChart] = useState(true);
  const [recentWeights, setRecentWeights] = useState<WeightLog[]>([]);
  const [weightInput, setWeightInput] = useState('');
  const [logging, setLogging] = useState(false);
  const [whoopConnected, setWhoopConnected] = useState(false);

  const loadChart = useCallback(async () => {
    setLoadingChart(true);
    setSeries(await buildSeries(metric, range));
    setLoadingChart(false);
  }, [range, metric]);

  const loadWeights = useCallback(() => {
    getRecentWeightLogs(5).then(setRecentWeights);
  }, []);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  useFocusEffect(
    useCallback(() => {
      // Re-runs loadChart() (not just loadWeights()) so data seeded/logged elsewhere shows up
      // when navigating back to this tab, not only when range/metric change.
      loadChart();
      loadWeights();
      getWhoopConnection().then((c) => setWhoopConnected(c.connected));
    }, [loadChart, loadWeights])
  );

  async function handleLogWeight() {
    const value = Number(weightInput);
    if (!Number.isFinite(value) || value <= 0) return;
    setLogging(true);
    try {
      await createWeightLog(value);
      setWeightInput('');
      loadWeights();
      loadChart();
    } finally {
      setLogging(false);
    }
  }

  function confirmDeleteWeight(log: WeightLog) {
    Alert.alert('Remove entry?', `Remove the ${log.weightLbs} lb entry?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteWeightLog(log.id);
          loadWeights();
          loadChart();
        },
      },
    ]);
  }

  function handleSelectMetric(option: MetricOption) {
    setDropdownOpen(false);
    if (option.requiresWhoop && !whoopConnected) {
      Alert.alert(
        'Requires WHOOP',
        'Net calories tracks calories eaten against calories burned. Connect WHOOP in Settings to enable it.'
      );
      return;
    }
    setMetric(option.key);
  }

  const activeOption = METRIC_OPTIONS.find((o) => o.key === metric)!;
  const isWeekView = range === 'week';
  const accentColor = metric === 'calories' ? mealTheme.dinner.border : mealTheme.snack.border;
  const points = series.points;
  const isEmpty = !points.some((p) => p.hasData);

  const realValues = points.filter((p) => p.hasData).map((p) => p.value);

  // Net calories is the one metric where zero is meaningful rather than merely small: a day
  // below the axis is a deficit and above it a surplus, so the axis must stay anchored at zero
  // instead of being shifted up to fill the plot.
  const isNet = metric === 'net';
  const mostNegative = isNet && realValues.length ? Math.min(0, Math.min(...realValues)) : 0;
  const netMax = isNet && realValues.length ? Math.max(0, Math.max(...realValues)) : 0;

  // Everything else sits in a band well above zero, so the axis starts just below the lowest
  // reading — otherwise real day-to-day variation reads as a flat line.
  let yAxisOffset = 0;
  if (realValues.length && !isNet) {
    const min = Math.min(...realValues);
    if (metric === 'weight') {
      yAxisOffset = Math.max(0, Math.floor(min) - 3);
    } else {
      const max = Math.max(...realValues);
      const buffer = Math.max(Math.round((max - min) * 0.15), 30);
      yAxisOffset = Math.max(0, Math.floor(min - buffer));
    }
  }

  /** Zero-centred axis config, applied only for net calories. */
  const netAxisProps = isNet
    ? {
        maxValue: Math.max(netMax, 100),
        mostNegativeValue: Math.min(mostNegative, -100),
        noOfSectionsBelowXAxis: 2,
        noOfSections: 2,
        xAxisLabelsAtBottom: true,
      }
    : {};

  // Bars: 7 fixed sections that exactly consume the plot width.
  const barSection = (PLOT_WIDTH - 8) / 7;
  const barWidth = Math.round(barSection * 0.6);
  const barSpacing = barSection - barWidth;

  // Line: each point's x-position reflects real elapsed days since the window started, so a
  // multi-day gap between entries reads as a real gap instead of a uniform slot width.
  const windowDays = Math.max(daysBetween(series.windowStartYmd, todayYmd()) + 1, 1);
  const offsets = isWeekView ? [] : computeOffsets(points, series.windowStartYmd, windowDays);
  const lineInitialSpacing = offsets[0] ?? EDGE_PAD;
  const ticks = isWeekView ? [] : pickTicks(points, offsets, 4);
  // gifted-charts' touch-to-index math (activatePointers) only knows the flat `spacing` prop,
  // not each point's real per-item spacing — so the average keeps long-press tracking roughly
  // calibrated across the whole width even though the rendered gaps are calendar-accurate.
  const avgLineSpacing =
    offsets.length > 1 ? (offsets[offsets.length - 1] - offsets[0]) / (offsets.length - 1) : PLOT_WIDTH;

  const barData = points.map((p) => ({
    // Empty slots collapse to the axis baseline: zero for net, the offset otherwise.
    value: p.hasData ? p.value : isNet ? 0 : yAxisOffset,
    label: p.label,
    labelWidth: barSection,
    // Surplus and deficit are opposite outcomes, so they shouldn't share a colour.
    frontColor: !p.hasData
      ? 'transparent'
      : isNet && p.value > 0
        ? mealTheme.snack.border
        : accentColor,
  }));

  // gifted-charts attaches an item's `spacing` to the gap AFTER it (toward the next point),
  // not before — so point i's spacing must equal the offset delta to point i+1.
  const lineData = points.map((p, i) => ({
    value: p.value,
    dataPointColor: accentColor,
    spacing: i < offsets.length - 1 ? offsets[i + 1] - offsets[i] : 0,
  }));

  const pointerConfig = {
    activatePointersOnLongPress: true,
    persistPointer: false,
    pointerLabelWidth: 130,
    pointerLabelHeight: 56,
    autoAdjustPointerLabelPosition: true,
    pointerStripHeight: CHART_HEIGHT,
    pointerStripColor: 'rgba(127, 94, 87, 0.25)',
    pointerColor: accentColor,
    radius: 5,
    pointerLabelComponent: (_items: unknown[], _secondary: unknown, index: number) => {
      const point = points[index];
      if (!point) return null;
      const shown = metric === 'weight' ? point.value : Math.round(point.value);
      return (
        <View style={styles.tooltipCard}>
          <Text style={styles.tooltipDate}>{point.dateLabel}</Text>
          <Text style={styles.tooltipValue}>
            {point.hasData
              ? `${isNet && point.value > 0 ? '+' : ''}${shown} ${activeOption.unit}`
              : 'No entry'}
          </Text>
          {point.hasData && isNet && (
            <Text style={styles.tooltipDate}>{point.value > 0 ? 'surplus' : 'deficit'}</Text>
          )}
        </View>
      );
    },
  };

  const sharedAxisProps = {
    height: CHART_HEIGHT,
    width: PLOT_WIDTH,
    disableScroll: true,
    noOfSections: 4,
    yAxisOffset,
    yAxisLabelWidth: Y_AXIS_LABEL_WIDTH,
    roundToDigits: metric === 'weight' ? 1 : 0,
    yAxisTextStyle: styles.axisText,
    yAxisColor: 'transparent',
    xAxisColor: 'rgba(127, 94, 87, 0.3)',
    endSpacing: 0,
    pointerConfig,
    ...netAxisProps,
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Progress</Text>

        <TimeRangeTabs active={range} onChange={setRange} />

        <View style={styles.metricSelector}>
          <Pressable style={styles.metricTrigger} onPress={() => setDropdownOpen((o) => !o)} hitSlop={4}>
            <Text style={styles.metricTriggerText}>{activeOption.label}</Text>
            <Ionicons name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </Pressable>
          {dropdownOpen && (
            <View style={styles.metricMenu}>
              {METRIC_OPTIONS.map((option) => (
                <Pressable
                  key={option.key}
                  style={styles.metricMenuItem}
                  onPress={() => handleSelectMetric(option)}
                >
                  <Text
                    style={[
                      styles.metricMenuItemText,
                      option.key === metric && styles.metricMenuItemTextActive,
                      option.requiresWhoop && !whoopConnected && styles.metricMenuItemTextLocked,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {option.requiresWhoop && !whoopConnected && (
                    <Ionicons name="lock-closed" size={13} color="rgba(127, 94, 87, 0.5)" />
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.chartCard}>
          {loadingChart ? (
            <ActivityIndicator color={colors.textMuted} style={styles.chartSpinner} />
          ) : isEmpty ? (
            <Text style={styles.emptyChart}>
              No {metric === 'weight' ? 'weight' : 'meals'} logged in this range.
            </Text>
          ) : isWeekView ? (
            <BarChart
              {...sharedAxisProps}
              data={barData}
              barWidth={barWidth}
              spacing={barSpacing}
              initialSpacing={8}
              barBorderRadius={4}
              xAxisLabelTextStyle={styles.axisText}
            />
          ) : (
            <View>
              <LineChart
                {...sharedAxisProps}
                data={lineData}
                spacing={avgLineSpacing}
                initialSpacing={lineInitialSpacing}
                color={accentColor}
                thickness={2}
                curved
                hideDataPoints={points.length > 40}
                dataPointsColor={accentColor}
                dataPointsRadius={3}
              />
              <View style={styles.tickRow}>
                {ticks.map((tick) => (
                  <Text key={tick.left} style={[styles.axisText, styles.tickText, { left: tick.left }]}>
                    {tick.text}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </View>

        {metric === 'weight' && (
          <View style={styles.weightSection}>
            <Text style={styles.sectionTitle}>Log weight</Text>
            <View style={styles.weightInputRow}>
              <TextInput
                style={styles.weightInput}
                value={weightInput}
                onChangeText={setWeightInput}
                placeholder="lbs"
                placeholderTextColor="rgba(127, 94, 87, 0.55)"
                keyboardType="numeric"
              />
              <Pressable
                style={[styles.logButton, (!weightInput.trim() || logging) && styles.logButtonDisabled]}
                onPress={handleLogWeight}
                disabled={!weightInput.trim() || logging}
              >
                <Text style={styles.logButtonText}>{logging ? 'Saving…' : 'Log'}</Text>
              </Pressable>
            </View>

            {recentWeights.length === 0 ? (
              <Text style={styles.emptyWeights}>No weight logged yet.</Text>
            ) : (
              <View style={styles.recentList}>
                {recentWeights.map((log) => (
                  <Pressable
                    key={log.id}
                    style={styles.recentRow}
                    onLongPress={() => confirmDeleteWeight(log)}
                    delayLongPress={400}
                  >
                    <Text style={styles.recentWeight}>{log.weightLbs} lb</Text>
                    <Text style={styles.recentDate}>
                      {new Date(log.loggedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </Pressable>
                ))}
                <Text style={styles.holdHint}>Hold an entry to remove it</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: SCREEN_PADDING, paddingBottom: 48, gap: 20 },
  title: { fontFamily: fonts.extraBold, fontSize: 24, color: colors.textMuted },
  metricSelector: { zIndex: 10 },
  metricTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  metricTriggerText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  metricMenu: {
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    minWidth: 200,
  },
  metricMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  metricMenuItemText: { fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  metricMenuItemTextActive: { fontFamily: fonts.medium, color: mealTheme.dinner.border },
  metricMenuItemTextLocked: { color: 'rgba(127, 94, 87, 0.6)' },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: CARD_PADDING,
    minHeight: CHART_HEIGHT,
    justifyContent: 'center',
  },
  axisText: { color: colors.textMuted, fontSize: 10, fontFamily: fonts.regular },
  tickRow: { height: 14, marginTop: 6 },
  tickText: { position: 'absolute', width: TICK_WIDTH, textAlign: 'center' },
  chartSpinner: { paddingVertical: 40 },
  emptyChart: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 40,
  },
  tooltipCard: {
    backgroundColor: colors.text,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tooltipDate: { fontFamily: fonts.regular, fontSize: 10, color: 'rgba(255,255,255,0.7)' },
  tooltipValue: { fontFamily: fonts.medium, fontSize: 13, color: '#FFFFFF' },
  weightSection: { gap: 12 },
  sectionTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.textMuted },
  weightInputRow: { flexDirection: 'row', gap: 10 },
  weightInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  logButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 12,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logButtonDisabled: { opacity: 0.5 },
  logButtonText: { fontFamily: fonts.medium, color: '#FFFFFF', fontSize: 15 },
  emptyWeights: { fontFamily: fonts.regular, fontSize: 13, color: 'rgba(127, 94, 87, 0.7)' },
  recentList: { gap: 8 },
  recentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  recentWeight: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  recentDate: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  holdHint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: 'rgba(127, 94, 87, 0.6)',
    textAlign: 'center',
  },
});
