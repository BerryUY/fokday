import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { useBackToClose, usePresence } from './motion';
import { Portal } from './portal';
import { Button, T, type ButtonVariant } from './primitives';

export type DialogAction<K extends string = string> = { key: K; label: string; variant: ButtonVariant };
type Request = { title: string; message: string; actions: DialogAction[]; stacked: boolean; resolve: (key: string | null) => void };

let open: ((request: Request) => void) | null = null;

/** Styled replacement for the native alert. Resolves false when dismissed. Null when no host is mounted. */
export function showConfirm(title: string, message: string, confirmLabel = 'Confirmar', destructive = false): Promise<boolean> | null {
  const present = open;
  if (!present) return null;
  const actions: DialogAction[] = [
    { key: 'no', label: 'Cancelar', variant: 'danger' },
    { key: 'yes', label: confirmLabel, variant: destructive ? 'dangerSolid' : 'primary' },
  ];
  return new Promise((resolve) => present({ title, message, actions, stacked: false, resolve: (key) => resolve(key === 'yes') }));
}

/** Several ways out, one under the other. Resolves with the key of the one chosen, or null when dismissed. */
export function choose<K extends string>(title: string, message: string, actions: DialogAction<K>[]): Promise<K | null> {
  const present = open;
  if (!present) return Promise.resolve(null);
  return new Promise((resolve) => present({ title, message, actions, stacked: true, resolve: (key) => resolve(key as K | null) }));
}

/** Mount once near the root, inside the theme and portal providers. Always drawn above any open sheet. */
export function DialogHost() {
  const c = useColors();
  const [request, setRequest] = useState<Request | null>(null);
  const [shown, setShown] = useState<Request | null>(null);
  const { mounted, progress } = usePresence(!!request);

  useEffect(() => {
    open = (r) => {
      setShown(r);
      setRequest(r);
    };
    return () => {
      open = null;
    };
  }, []);

  const close = useCallback(
    (key: string | null) => {
      request?.resolve(key);
      setRequest(null);
    },
    [request],
  );
  useBackToClose(!!request, () => close(null));

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const card = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: 0.94 + progress.value * 0.06 }] }));

  if (!mounted || !shown) return null;
  return (
    <Portal>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { backgroundColor: c.overlay }, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close(null)} accessibilityLabel="Cerrar" disabled={!request} />
        <Animated.View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, card]} accessibilityRole="alert">
          <T variant="h2">{shown.title}</T>
          {shown.message ? <T variant="body" tone="muted" style={{ marginTop: space.sm }}>{shown.message}</T> : null}
          <View style={shown.stacked ? styles.stack : styles.actions}>
            {shown.actions.map((a) => (
              <View key={a.key} style={shown.stacked ? undefined : { flex: 1 }}>
                <Button label={a.label} variant={a.variant} onPress={() => close(a.key)} />
              </View>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, padding: space.xl },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  stack: { gap: space.sm, marginTop: space.xl },
});
