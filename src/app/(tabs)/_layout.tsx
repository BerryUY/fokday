import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { TopTabs, type MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isOnboarded } from '@/data/settings';
import { useQuery } from '@/state/db';
import { haptic } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Inicio', icon: 'home-variant-outline', iconActive: 'home-variant' },
  comidas: { label: 'Comidas', icon: 'silverware-fork-knife', iconActive: 'silverware-fork-knife' },
  entrenar: { label: 'Entrenar', icon: 'dumbbell', iconActive: 'dumbbell' },
  progreso: { label: 'Progreso', icon: 'chart-line-variant', iconActive: 'chart-line-variant' },
};

const ITEM_H = 52;
const grow = LinearTransition.duration(240);

/**
 * Floating bar: the other sections are just icons, the current one is a filled pill with its
 * name. The pill widens into place, so the bar reads at a glance.
 */
function TabBar({ state, navigateToTab }: MaterialTopTabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => TABS[r.name]);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={[styles.bar, { backgroundColor: c.scheme === 'dark' ? 'rgba(24,24,27,0.97)' : 'rgba(255,255,255,0.97)', borderColor: c.border }]}>
        {routes.map((route) => {
          const meta = TABS[route.name];
          const focused = state.routes[state.index]?.key === route.key;
          return (
            <Animated.View key={route.key} layout={grow} style={{ flex: focused ? 2.4 : 1 }}>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={meta.label}
                onPress={() => {
                  if (focused) return;
                  haptic('light');
                  navigateToTab(route.key);
                }}
                style={[styles.item, focused && { backgroundColor: c.accent }]}
              >
                <MaterialCommunityIcons name={focused ? meta.iconActive : meta.icon} size={24} color={focused ? c.accentText : c.textDim} />
                {focused ? (
                  <Animated.Text entering={FadeIn.duration(200).delay(60)} maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.label, { color: c.accentText }]}>
                    {meta.label}
                  </Animated.Text>
                ) : null}
              </Pressable>
            </Animated.View>
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
    </TopTabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  bar: {
    flexDirection: 'row',
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 6,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  item: { height: ITEM_H, borderRadius: ITEM_H / 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  label: { fontFamily: font.bold, fontSize: 15, letterSpacing: -0.2, flexShrink: 1 },
});
