import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { useBackToClose, usePresence } from './motion';
import { Portal } from './portal';
import { Button, T } from './primitives';

type Request = { title: string; message: string; confirmLabel: string; destructive: boolean; resolve: (ok: boolean) => void };

let open: ((request: Request) => void) | null = null;

/** Styled replacement for the native alert. Resolves false when dismissed. Null when no host is mounted. */
export function showConfirm(title: string, message: string, confirmLabel = 'Confirmar', destructive = false): Promise<boolean> | null {
  const present = open;
  if (!present) return null;
  return new Promise((resolve) => present({ title, message, confirmLabel, destructive, resolve }));
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
    (ok: boolean) => {
      request?.resolve(ok);
      setRequest(null);
    },
    [request],
  );
  useBackToClose(!!request, () => close(false));

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const card = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: 0.94 + progress.value * 0.06 }] }));

  if (!mounted || !shown) return null;
  return (
    <Portal>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { backgroundColor: c.overlay }, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close(false)} accessibilityLabel="Cerrar" disabled={!request} />
        <Animated.View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, card]} accessibilityRole="alert">
          <T variant="h2">{shown.title}</T>
          {shown.message ? <T variant="body" tone="muted" style={{ marginTop: space.sm }}>{shown.message}</T> : null}
          <View style={styles.actions}>
            <View style={{ flex: 1 }}><Button label="Cancelar" variant="danger" onPress={() => close(false)} /></View>
            <View style={{ flex: 1 }}>
              <Button label={shown.confirmLabel} variant={shown.destructive ? 'dangerSolid' : 'primary'} onPress={() => close(true)} />
            </View>
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
});
