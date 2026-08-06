import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, mealTheme } from '../utils/theme';
import { todayYmd } from '../utils/date';

const TODAY_DOT_COLOR = mealTheme.dinner.border;

interface Props {
  visible: boolean;
  selectedDate: string;
  onSelect: (ymd: string) => void;
  onClose: () => void;
}

export function DateCalendarModal({ visible, selectedDate, onSelect, onClose }: Props) {
  const today = todayYmd();

  const markedDates =
    today === selectedDate
      ? { [today]: { selected: true, selectedColor: colors.textMuted, marked: true, dotColor: '#FFFFFF' } }
      : {
          [today]: { marked: true, dotColor: TODAY_DOT_COLOR },
          [selectedDate]: { selected: true, selectedColor: colors.textMuted },
        };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Jump to a day</Text>
            <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <Calendar
            current={selectedDate}
            initialDate={selectedDate}
            onDayPress={(day: DateData) => onSelect(day.dateString)}
            markedDates={markedDates}
            theme={{
              backgroundColor: colors.background,
              calendarBackground: colors.background,
              textSectionTitleColor: colors.textMuted,
              selectedDayBackgroundColor: colors.textMuted,
              selectedDayTextColor: '#FFFFFF',
              todayTextColor: colors.textMuted,
              dayTextColor: colors.text,
              arrowColor: colors.textMuted,
              monthTextColor: colors.text,
              textDayFontFamily: fonts.regular,
              textMonthFontFamily: fonts.medium,
              textDayHeaderFontFamily: fonts.regular,
            }}
            style={styles.calendar}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 18,
    color: colors.textMuted,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  calendar: { borderRadius: 12 },
});
