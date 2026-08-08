import { useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../utils/theme';

export type AddMethod = 'photo' | 'barcode' | 'voice';

interface Props {
  onSelectMethod: (method: AddMethod) => void;
}

const FAB_SIZE = 56;
const ICON_SIZE = 48;
const GAP = 16;

const METHODS: { key: AddMethod; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'photo', icon: 'camera' },
  { key: 'barcode', icon: 'barcode-outline' },
  { key: 'voice', icon: 'mic' },
];

/** Staggers each icon's reveal window across the shared 0→1 progress value —
 * the one closest to the FAB (lowest index) starts animating in first. */
function stepInterpolation(progress: Animated.Value, index: number) {
  const start = index * 0.15;
  const end = Math.min(start + 0.55, 1);
  return {
    opacity: progress.interpolate({ inputRange: [start, end], outputRange: [0, 1], extrapolate: 'clamp' }),
    translateY: progress.interpolate({ inputRange: [start, end], outputRange: [16, 0], extrapolate: 'clamp' }),
  };
}

export function AddMethodFab({ onSelectMethod }: Props) {
  const [open, setOpen] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  function toggle() {
    const next = !open;
    setOpen(next);
    Animated.timing(progress, {
      toValue: next ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  function handleSelect(method: AddMethod) {
    toggle();
    onSelectMethod(method);
  }

  const fabOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] });

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { opacity: progress }]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={toggle}>
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </Pressable>
      </Animated.View>

      <View style={styles.stack}>
        {METHODS.map((method, index) => {
          const { opacity, translateY } = stepInterpolation(progress, index);
          return (
            <Animated.View
              key={method.key}
              pointerEvents={open ? 'auto' : 'none'}
              style={[
                styles.iconSlot,
                { bottom: FAB_SIZE + GAP + index * (ICON_SIZE + GAP), opacity, transform: [{ translateY }] },
              ]}
            >
              <Pressable style={styles.iconButton} onPress={() => handleSelect(method.key)}>
                <Ionicons name={method.icon} size={22} color="#FFFFFF" />
              </Pressable>
            </Animated.View>
          );
        })}

        <Pressable style={styles.fab} onPress={toggle} hitSlop={4}>
          <Animated.View style={{ opacity: fabOpacity }}>
            <Ionicons name="apps" size={22} color="#FFFFFF" />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  stack: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: FAB_SIZE,
    alignItems: 'center',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: colors.textMuted,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  iconSlot: {
    position: 'absolute',
    width: FAB_SIZE,
    alignItems: 'center',
  },
  iconButton: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: colors.textMuted,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
