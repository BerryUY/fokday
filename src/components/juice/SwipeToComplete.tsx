import { Feather } from '@expo/vector-icons';
import { useRef } from 'react';
import { ActivityIndicator, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { T } from '@/components/ui/primitives';
import { haptic } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

const KNOB = 52;
const PAD = 4;

/**
 * A deliberate "I did it": drag the knob to the end to complete. Asking for a physical gesture
 * makes big moments (finishing a workout) feel earned. Screen readers get a plain action.
 */
export function SwipeToComplete({ label, onComplete, loading }: { label: string; onComplete: () => void; loading?: boolean }) {
  const c = useColors();
  const x = useSharedValue(0);
  const max = useSharedValue(0);
  const drag = useRef({ startX: 0, passed: false });

  const move = (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.pageX - drag.current.startX;
    const m = max.get();
    x.set(Math.min(m, Math.max(0, dx)));
    // A tick when the knob reaches the point of no return.
    if (!drag.current.passed && dx > m * 0.85) {
      drag.current.passed = true;
      haptic('medium');
    }
  };
  const release = (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.pageX - drag.current.startX;
    const m = max.get();
    if (m > 0 && dx > m * 0.85) {
      x.set(withTiming(m, { duration: 120 }));
      haptic('success');
      onComplete();
    } else {
      x.set(withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) }));
    }
  };

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fill = useAnimatedStyle(() => ({ width: x.value + KNOB + PAD }));
  const text = useAnimatedStyle(() => ({ opacity: max.value ? interpolate(x.value, [0, max.value * 0.6], [1, 0]) : 1 }));

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => max.set(Math.max(0, e.nativeEvent.layout.width - KNOB - PAD * 2))}
      style={[styles.track, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Deslizá hacia la derecha para confirmar"
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={() => onComplete()}
    >
      <Animated.View style={[styles.fill, { backgroundColor: c.accentSoft }, fill]} />
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, text]} pointerEvents="none">
        <T variant="bodyMedium" tone="muted">{label}  →</T>
      </Animated.View>
      <Animated.View
        onStartShouldSetResponder={() => !loading}
        onMoveShouldSetResponder={() => !loading}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          drag.current = { startX: e.nativeEvent.pageX, passed: false };
          haptic('light');
        }}
        onResponderMove={move}
        onResponderRelease={release}
        onResponderTerminate={() => x.set(withTiming(0, { duration: 220 }))}
        style={[styles.knob, { backgroundColor: c.accent }, knob]}
      >
        {loading ? <ActivityIndicator color={c.accentText} /> : <Feather name="chevrons-right" size={24} color={c.accentText} />}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: KNOB + PAD * 2, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  center: { alignItems: 'center', justifyContent: 'center' },
  knob: { position: 'absolute', left: PAD, width: KNOB, height: KNOB, borderRadius: KNOB / 2, alignItems: 'center', justifyContent: 'center' },
});
