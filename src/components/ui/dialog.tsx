import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Button, T } from './primitives';

type Request = { title: string; message: string; confirmLabel: string; destructive: boolean; resolve: (ok: boolean) => void };

let open: ((request: Request) => void) | null = null;

/** Styled replacement for the native alert. Resolves false when dismissed. Null when no host is mounted. */
export function showConfirm(title: string, message: string, confirmLabel = 'Confirmar', destructive = false): Promise<boolean> | null {
  const present = open;
  if (!present) return null;
  return new Promise((resolve) => present({ title, message, confirmLabel, destructive, resolve }));
}

/** Mount once near the root, inside the theme provider. */
export function DialogHost() {
  const c = useColors();
  const [request, setRequest] = useState<Request | null>(null);

  useEffect(() => {
    open = (r) => setRequest(r);
    return () => {
      open = null;
    };
  }, []);

  const close = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  if (!request) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => close(false)}>
      <Animated.View entering={FadeIn.duration(140)} style={[StyleSheet.absoluteFill, styles.backdrop, { backgroundColor: c.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close(false)} accessibilityLabel="Cerrar" />
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="alert">
          <T variant="h2">{request.title}</T>
          {request.message ? <T variant="body" tone="muted" style={{ marginTop: space.sm }}>{request.message}</T> : null}
          <View style={styles.actions}>
            <View style={{ flex: 1 }}><Button label="Cancelar" variant="secondary" onPress={() => close(false)} /></View>
            <View style={{ flex: 1 }}>
              <Button label={request.confirmLabel} variant={request.destructive ? 'danger' : 'primary'} onPress={() => close(true)} />
            </View>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, padding: space.xl },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
});
