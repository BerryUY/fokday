import { Feather } from '@expo/vector-icons';
import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';
import { showConfirm } from './dialog';
import { PressableScale, T } from './primitives';

export const Field = forwardRef<ComponentRef<typeof TextInput>, TextInputProps & { label?: string; suffix?: string; hint?: string; large?: boolean; error?: string | null }>(
  function Field({ label, suffix, hint, large, error, style, ...rest }, ref) {
    const c = useColors();
    return (
      <View style={{ gap: 6 }}>
        {label ? <T variant="label" tone="muted">{label}</T> : null}
        <View style={[styles.field, { backgroundColor: c.surfaceAlt, borderColor: error ? c.danger : 'transparent' }, large && { height: 72 }]}>
          <TextInput
            ref={ref}
            placeholderTextColor={c.textDim}
            selectionColor={c.accent}
            cursorColor={c.accent}
            {...rest}
            style={[
              styles.input,
              { color: c.text },
              large && { fontFamily: font.heavy, fontSize: 34, letterSpacing: -1 },
              rest.multiline && { height: undefined, minHeight: 88, textAlignVertical: 'top', paddingTop: 14 },
              style,
            ]}
          />
          {suffix ? <T variant={large ? 'h2' : 'label'} tone="dim">{suffix}</T> : null}
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
      <PressableScale accessibilityLabel="Restar" onPress={() => onChange(Math.max(min, value - step))} style={styles.stepBtn} scaleTo={0.85}>
        <Feather name="minus" size={16} color={c.text} />
      </PressableScale>
      <T variant="h3" style={{ minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{format ? format(value) : value}</T>
      <PressableScale accessibilityLabel="Sumar" onPress={() => onChange(Math.min(max, value + step))} style={styles.stepBtn} scaleTo={0.85}>
        <Feather name="plus" size={16} color={c.text} />
      </PressableScale>
    </View>
  );
}

/** Bottom sheet built on Modal: dimmed backdrop, slides up, closes on backdrop tap. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Cerrar" />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" pointerEvents="box-none" style={styles.sheetWrap}>
        <Animated.View
          entering={SlideInDown.duration(220)}
          style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + space.lg }]}
        >
          <View style={[styles.grabber, { backgroundColor: c.border }]} />
          {title ? <T variant="h2" style={{ marginBottom: space.lg }}>{title}</T> : null}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
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
  input: { flex: 1, height: 52, fontFamily: font.medium, fontSize: 16 },
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
