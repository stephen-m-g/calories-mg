import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Dimensions, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { getWeekDates, shiftYmd, todayYmd } from '../utils/date';
import { colors, fonts, mealTheme } from '../utils/theme';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'Th', 'F', 'S'];
// Reuses the same accent already used to mark "today" in the calendar modal's dot marker.
const TODAY_ACCENT = mealTheme.dinner.border;
const SWIPE_THRESHOLD = 40;
const STRIP_WIDTH = Dimensions.get('window').width;

interface Props {
  /** The actual selected/active day driving the rest of the screen. */
  activeDate: string;
  /** Sunday (YYYY-MM-DD) anchoring whichever week the strip is currently showing — can
   * differ from activeDate's week while the user is browsing without having committed. */
  viewedWeekStart: string;
  loggedDays: Set<string>;
  /** Tapping a day commits it as the new active day. */
  onSelectDay: (ymd: string) => void;
  /** Swiping the strip only repositions it — it does not change the active day. */
  onWeekChange: (newWeekStart: string) => void;
}

export function WeekStrip({ activeDate, viewedWeekStart, loggedDays, onSelectDay, onWeekChange }: Props) {
  const weekDates = getWeekDates(viewedWeekStart);
  const today = todayYmd();
  const translateX = useRef(new Animated.Value(0)).current;

  // PanResponder is created once (via useRef below) and its handlers are never
  // re-created, so they'd otherwise always see the viewedWeekStart prop from that
  // first render. Mirroring it into a ref keeps it fresh for those frozen closures.
  const viewedWeekStartRef = useRef(viewedWeekStart);
  viewedWeekStartRef.current = viewedWeekStart;

  function animateWeekChange(weekDelta: 7 | -7) {
    const exitTo = weekDelta < 0 ? STRIP_WIDTH : -STRIP_WIDTH;
    Animated.timing(translateX, {
      toValue: exitTo,
      duration: 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      onWeekChange(shiftYmd(viewedWeekStartRef.current, weekDelta));
      translateX.setValue(weekDelta < 0 ? -STRIP_WIDTH : STRIP_WIDTH);
      Animated.spring(translateX, {
        toValue: 0,
        friction: 11,
        tension: 55,
        useNativeDriver: true,
      }).start();
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 15 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderMove: (_, gesture) => {
        translateX.setValue(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          animateWeekChange(-7);
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          animateWeekChange(7);
        } else {
          Animated.spring(translateX, { toValue: 0, friction: 9, tension: 90, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles.clip}>
      <Animated.View style={[styles.row, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        {weekDates.map((ymd, i) => {
          const isToday = ymd === today;
          const isActive = ymd === activeDate;
          const hasLog = loggedDays.has(ymd);

          return (
            <Pressable key={ymd} style={styles.dayCell} onPress={() => onSelectDay(ymd)}>
              <View style={styles.dotSlot}>{isToday && <View style={styles.todayDot} />}</View>
              <Text style={[styles.letter, isToday && styles.letterToday]}>{WEEKDAY_LETTERS[i]}</Text>
              <View style={[styles.circle, hasLog && styles.circleFilled, isActive && styles.circleSelected]}>
                {hasLog && <Ionicons name="checkmark" size={10} color="#FFFFFF" />}
              </View>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    width: '100%',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  dayCell: {
    alignItems: 'center',
  },
  dotSlot: {
    height: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: TODAY_ACCENT,
  },
  letter: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: 6,
  },
  letterToday: {
    fontFamily: fonts.medium,
    color: TODAY_ACCENT,
  },
  circle: {
    width: 23,
    height: 23,
    borderRadius: 11.5,
    borderWidth: 1,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleFilled: {
    backgroundColor: colors.textMuted,
  },
  circleSelected: {
    borderWidth: 1.75,
    borderColor: TODAY_ACCENT,
  },
});
