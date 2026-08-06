import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, fonts } from '../utils/theme';

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: 'home',
  Progress: 'stats-chart',
};

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      <BlurView intensity={40} tint="dark" style={styles.pill}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const iconName = TAB_ICONS[route.name] ?? 'ellipse';

          return (
            <Pressable
              key={route.key}
              onPress={() => {
                if (!focused) navigation.navigate(route.name);
              }}
              style={[styles.item, focused && styles.itemActive]}
            >
              <Ionicons
                name={iconName}
                size={26}
                color={focused ? colors.navIconActive : colors.navIconInactive}
              />
              <Text style={[styles.label, focused && styles.labelActive]}>{route.name}</Text>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 30,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    padding: 5,
    borderRadius: 125,
    overflow: 'hidden',
    backgroundColor: colors.navBg,
  },
  item: {
    width: 120,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    borderRadius: 125,
  },
  itemActive: {
    backgroundColor: colors.navPillActive,
    borderWidth: 0.625,
    borderColor: colors.navPillActiveBorder,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    letterSpacing: -0.125,
    color: colors.navIconInactive,
  },
  labelActive: {
    color: colors.navIconActive,
  },
});
