import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { TopTabs, type MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { useState, type ComponentProps } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isOnboarded } from '@/data/settings';
import { useQuery } from '@/state/db';
import { haptic } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { font, radius } from '@/theme/tokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Inicio', icon: 'home-variant-outline', iconActive: 'home-variant' },
  comidas: { label: 'Comidas', icon: 'silverware-fork-knife', iconActive: 'silverware-fork-knife' },
  entrenar: { label: 'Entrenar', icon: 'dumbbell', iconActive: 'dumbbell' },
  progreso: { label: 'Progreso', icon: 'chart-line-variant', iconActive: 'chart-line-variant' },
  historial: { label: 'Historial', icon: 'calendar-blank-outline', iconActive: 'calendar-blank' },
};

const PILL_W = 52;
const PILL_H = 34;

/**
 * Floating bar with one pill that slides between tabs. It follows the finger while swiping
 * between sections (the pill is a single view that only moves, so its rounded shape never changes).
 */
function TabBar({ state, navigateToTab, position }: MaterialTopTabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [itemWidth, setItemWidth] = useState(0);
  const routes = state.routes.filter((r) => TABS[r.name]);
  const translateX = itemWidth
    ? position.interpolate({
        inputRange: routes.map((_, i) => i),
        outputRange: routes.map((_, i) => i * itemWidth + (itemWidth - PILL_W) / 2),
        extrapolate: 'clamp',
      })
    : 0;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View
        style={[styles.bar, { backgroundColor: c.scheme === 'dark' ? 'rgba(24,24,27,0.97)' : 'rgba(255,255,255,0.97)', borderColor: c.border }]}
        onLayout={(e) => setItemWidth((e.nativeEvent.layout.width - 8) / Math.max(1, routes.length))}
      >
        {itemWidth ? (
          <Animated.View pointerEvents="none" style={[styles.pill, { backgroundColor: c.accentSoft, transform: [{ translateX }] }]} />
        ) : null}
        {routes.map((route, index) => {
          const meta = TABS[route.name];
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              onPress={() => {
                if (focused) return;
                haptic('light');
                navigateToTab(route.key);
              }}
              style={styles.item}
            >
              <View style={styles.iconSlot}>
                <MaterialCommunityIcons name={focused ? meta.iconActive : meta.icon} size={22} color={focused ? c.accent : c.textDim} />
              </View>
              <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.label, { color: focused ? c.text : c.textDim }]}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const c = useColors();
  const { data: onboarded } = useQuery((db) => isOnboarded(db), []);
  if (onboarded === undefined) return null;
  if (!onboarded) return <Redirect href="/bienvenida" />;
  return (
    <TopTabs
      tabBarPosition="bottom"
      tabBar={(props) => <TabBar {...props} />}
      style={{ backgroundColor: c.bg }}
      screenOptions={{ swipeEnabled: true, animationEnabled: true, lazy: true, lazyPreloadDistance: 1, sceneStyle: { backgroundColor: c.bg } }}
    >
      <TopTabs.Screen name="index" />
      <TopTabs.Screen name="comidas" />
      <TopTabs.Screen name="entrenar" />
      <TopTabs.Screen name="progreso" />
      <TopTabs.Screen name="historial" />
    </TopTabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
  bar: {
    flexDirection: 'row',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  pill: { position: 'absolute', top: 8, left: 4, width: PILL_W, height: PILL_H, borderRadius: PILL_H / 2 },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  iconSlot: { width: PILL_W, height: PILL_H, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: font.semibold, fontSize: 11 },
});
