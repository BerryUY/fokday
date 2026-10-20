import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={[styles.bar, { backgroundColor: c.scheme === 'dark' ? 'rgba(24,24,27,0.97)' : 'rgba(255,255,255,0.97)', borderColor: c.border }]}>
        {state.routes.map((route, index) => {
          const meta = TABS[route.name];
          if (!meta) return null;
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
              <View style={[styles.iconPill, focused && { backgroundColor: c.accentSoft }]}>
                <MaterialCommunityIcons name={focused ? meta.iconActive : meta.icon} size={22} color={focused ? c.accent : c.textDim} />
              </View>
              <Text style={[styles.label, { color: focused ? c.text : c.textDim }]}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg }, animation: 'fade' }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="comidas" />
      <Tabs.Screen name="entrenar" />
      <Tabs.Screen name="progreso" />
      <Tabs.Screen name="historial" />
    </Tabs>
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
  item: { flex: 1, alignItems: 'center', gap: 3 },
  iconPill: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: font.semibold, fontSize: 11 },
});
