import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/theme/ThemeProvider';
import { font, radius } from '@/theme/tokens';

type Kind = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; kind: Kind };
type ToastApi = { show: (message: string, kind?: Kind) => void };

const ToastContext = createContext<ToastApi>({ show: () => {} });

export function haptic(kind: 'success' | 'light' | 'warning' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else if (kind === 'warning') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);
  const insets = useSafeAreaInsets();
  const c = useColors();

  const show = useCallback((message: string, kind: Kind = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    counter.current += 1;
    setToast({ id: counter.current, message, kind });
    haptic(kind === 'error' ? 'warning' : kind === 'success' ? 'success' : 'light');
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 4200 : 2400);
  }, []);

  const api = useMemo(() => ({ show }), [show]);
  const icon = toast?.kind === 'error' ? 'alert-circle' : toast?.kind === 'info' ? 'info' : 'check';
  const tint = toast?.kind === 'error' ? c.danger : toast?.kind === 'info' ? c.protein : c.accent;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', paddingBottom: insets.bottom + 92 }]}>
        {toast && (
          <Animated.View
            key={toast.id}
            entering={FadeInDown.duration(220)}
            exiting={FadeOutDown.duration(180)}
            style={[styles.toast, { backgroundColor: c.scheme === 'dark' ? '#F5F5F4' : '#141416' }]}
          >
            <View style={[styles.dot, { backgroundColor: tint }]}>
              <Feather name={icon} size={13} color={c.scheme === 'dark' ? '#0B0F02' : '#FFFFFF'} />
            </View>
            <Text style={[styles.text, { color: c.scheme === 'dark' ? '#0E0E10' : '#F5F5F4' }]} numberOfLines={3}>
              {toast.message}
            </Text>
          </Animated.View>
        )}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  toast: {
    alignSelf: 'center',
    maxWidth: '88%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 18,
    borderRadius: radius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: font.semibold, fontSize: 14, flexShrink: 1 },
});
