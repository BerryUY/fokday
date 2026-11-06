import { Feather } from '@expo/vector-icons';
import { forwardRef, useState, type ComponentProps, type ComponentRef, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';
import { showConfirm } from './dialog';
import { useBackToClose, usePresence } from './motion';
import { Portal } from './portal';
import { PressableScale, T } from './primitives';

/**
 * Text field. icon: a small icon on the left (a magnifier for search). Password fields
 * (secureTextEntry) get an eye to show or hide what's being typed.
 */
export const Field = forwardRef<ComponentRef<typeof TextInput>, TextInputProps & { label?: string; suffix?: string; hint?: string; large?: boolean; error?: string | null; icon?: ComponentProps<typeof Feather>['name'] }>(
  function Field({ label, suffix, hint, large, error, icon, style, secureTextEntry, ...rest }, ref) {
    const c = useColors();
    const [hidden, setHidden] = useState(true);
    return (
      <View style={{ gap: 6 }}>
        {label ? <T variant="label" tone="muted">{label}</T> : null}
        <View style={[styles.field, { backgroundColor: c.surfaceAlt, borderColor: error ? c.danger : 'transparent' }, large && { height: 72 }]}>
          {icon ? <Feather name={icon} size={18} color={c.textDim} style={{ marginRight: space.sm }} /> : null}
          <TextInput
            ref={ref}
            placeholderTextColor={c.textDim}
            selectionColor={c.accent}
            cursorColor={c.accent}
            {...rest}
            secureTextEntry={secureTextEntry && hidden}
            style={[
              styles.input,
              { color: c.text },
              // The big number gets the full field height and its own line height, so its top isn't clipped.
              large && { fontFamily: font.heavy, fontSize: 34, lineHeight: 42, height: 72, paddingVertical: 0, letterSpacing: -1, includeFontPadding: false, textAlignVertical: 'center' },
              rest.multiline && { height: undefined, minHeight: 88, textAlignVertical: 'top', paddingTop: 14 },
              style,
            ]}
          />
          {suffix ? <T variant={large ? 'h2' : 'label'} tone="dim">{suffix}</T> : null}
          {secureTextEntry ? (
            <Pressable
              onPress={() => setHidden((h) => !h)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Mostrar la contraseña' : 'Ocultar la contraseña'}
            >
              <Feather name={hidden ? 'eye' : 'eye-off'} size={20} color={c.textMuted} />
            </Pressable>
          ) : null}
        </View>
        {error ? <T variant="caption" tone="danger">{error}</T> : hint ? <T variant="caption" tone="dim">{hint}</T> : null}
      </View>
    );
  },
);

/** Compact −/+ control for small integers (sets, reps). */
export function Stepper({ value, onChange, min = 0, max = 99, step = 1, format }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  const c = useColors();
  return (
    <View style={[styles.stepper, { backgroundColor: c.surfaceAlt }]}>
      <PressableScale accessibilityRole="button" accessibilityLabel="Restar" onPress={() => onChange(Math.max(min, value - step))} style={styles.stepBtn} scaleTo={0.85}>
        <Feather name="minus" size={16} color={c.text} />
      </PressableScale>
      <T variant="h3" style={{ minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{format ? format(value) : value}</T>
      <PressableScale accessibilityRole="button" accessibilityLabel="Sumar" onPress={() => onChange(Math.min(max, value + step))} style={styles.stepBtn} scaleTo={0.85}>
        <Feather name="plus" size={16} color={c.text} />
      </PressableScale>
    </View>
  );
}

/**
 * Bottom sheet in the app's overlay layer: dimmed backdrop, slides up and back down, closes on
 * backdrop tap or the Android back button. Toasts stay visible above it.
 */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { mounted, progress } = usePresence(visible);
  const height = useSharedValue(600);
  useBackToClose(visible, onClose);
  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * height.value }] }));
  if (!mounted) return null;
  return (
    <Portal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }, backdrop]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Cerrar" disabled={!visible} />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" pointerEvents="box-none" style={styles.sheetWrap}>
        <Animated.View
          onLayout={(e) => (height.value = e.nativeEvent.layout.height + 40)}
          pointerEvents={visible ? 'auto' : 'none'}
          style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + space.lg }, panel]}
        >
          <View style={[styles.grabber, { backgroundColor: c.border }]} />
          {title ? <T variant="h2" style={{ marginBottom: space.lg }}>{title}</T> : null}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Portal>
  );
}

/** Confirmation dialog in the app's own style (native alert only if the host is not mounted yet). */
export function confirm(title: string, message: string, confirmLabel = 'Confirmar', destructive = false): Promise<boolean> {
  const styled = showConfirm(title, message, confirmLabel, destructive);
  if (styled) return styled;
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: radius.md, paddingHorizontal: space.lg, borderWidth: 1 },
  // minWidth 0 lets the input shrink to the row on web (browsers give inputs a wide intrinsic size).
  input: { flex: 1, minWidth: 0, height: 52, fontFamily: font.medium, fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, padding: 4 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    maxHeight: '92%',
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: space.lg },
});
