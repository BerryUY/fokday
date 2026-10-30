import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { TopTabs, type MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isOnboarded } from '@/data/settings';
import { useQuery } from '@/state/db';
import { haptic } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type TabMeta = { label: string; icon: IconName; iconActive: IconName };

const TABS: Record<string, TabMeta> = {
  index: { label: 'Inicio', icon: 'home-variant-outline', iconActive: 'home-variant' },
  comidas: { label: 'Comidas', icon: 'silverware-fork-knife', iconActive: 'silverware-fork-knife' },
  entrenar: { label: 'Entrenar', icon: 'dumbbell', iconActive: 'dumbbell' },
  progreso: { label: 'Progreso', icon: 'chart-line-variant', iconActive: 'chart-line-variant' },
};

const ITEM_H = 48;
const PAD = 5;
const GAP = 4;
/** The open tab is this many times wider than a closed one. */
const GROW = 2.4;
const OPEN = { duration: 340, easing: Easing.out(Easing.cubic) };

/**
 * Floating bar: the other sections are just icons, the current one is a filled pill with its
 * name. Changing section opens the new pill (it widens and its name slides in) while the old one
 * closes, so the move is visible instead of a plain switch.
 */
function TabBar({ state, navigateToTab }: MaterialTopTabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const routes = state.routes.filter((r) => TABS[r.name]);
  const current = state.routes[state.index]?.key;
  const unit = (width - PAD * 2 - GAP * (routes.length - 1)) / (routes.length - 1 + GROW);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.bar, { backgroundColor: c.scheme === 'dark' ? 'rgba(24,24,27,0.97)' : 'rgba(255,255,255,0.97)', borderColor: c.border }]}
      >
        {width > 0
          ? routes.map((route) => (
              <TabItem
                key={route.key}
                meta={TABS[route.name]}
                focused={route.key === current}
                closed={unit}
                open={unit * GROW}
                onPress={() => {
                  if (route.key === current) return;
                  haptic('light');
                  navigateToTab(route.key);
                }}
              />
            ))
          : null}
      </View>
    </View>
  );
}

function TabItem({ meta, focused, closed, open, onPress }: { meta: TabMeta; focused: boolean; closed: number; open: number; onPress: () => void }) {
  const c = useColors();
  const p = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    p.set(withTiming(focused ? 1 : 0, OPEN));
  }, [focused, p]);

  const box = useAnimatedStyle(() => ({ width: closed + (open - closed) * p.get() }));
  const fill = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ scaleX: 0.6 + 0.4 * p.get() }, { scaleY: 0.85 + 0.15 * p.get() }] }));
  const label = useAnimatedStyle(() => ({ opacity: p.get() * p.get(), maxWidth: 110 * p.get(), marginLeft: 8 * p.get(), transform: [{ translateX: -10 * (1 - p.get()) }] }));

  return (
    <Animated.View style={[{ height: ITEM_H }, box]}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={meta.label} onPress={onPress} style={styles.item}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fill, { backgroundColor: c.accent }, fill]} />
        <MaterialCommunityIcons name={focused ? meta.iconActive : meta.icon} size={24} color={focused ? c.accentText : c.textDim} />
        <Animated.Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.label, { color: c.accentText }, label]}>
          {meta.label}
        </Animated.Text>
      </Pressable>
    </Animated.View>
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
    </TopTabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 28, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 340,
    borderRadius: 29,
    borderWidth: StyleSheet.hairlineWidth,
    padding: PAD,
    gap: GAP,
    minHeight: ITEM_H + PAD * 2,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  item: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, overflow: 'hidden' },
  fill: { borderRadius: ITEM_H / 2 },
  label: { fontFamily: font.bold, fontSize: 15, letterSpacing: -0.2 },
});
