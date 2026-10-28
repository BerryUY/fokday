import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { MARK } from '@/brand/mark';
import { haptic } from '@/state/toast';
import { MarkLayer } from './FokDayMark';

const SIZE = 150;
const ease = { inOut: Easing.inOut(Easing.cubic), out: Easing.out(Easing.cubic), in: Easing.in(Easing.cubic) };

/**
 * The opening on every cold start: the mark appears, the arrows load up in short pulls (with
 * light haptics) and the green chevron takes off like a rocket — more discipline, more push —
 * leaving a trail while the app fades in underneath. About 1.6 s; reduced motion just fades.
 */
export function LaunchAnimation({ background, onDone }: { background: string; onDone: () => void }) {
  const intro = useSharedValue(0);
  const charge = useSharedValue(0);
  const launch = useSharedValue(0);
  const out = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(() => !cancelled && fn(), ms));
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        intro.value = 1;
        out.value = withDelay(350, withTiming(1, { duration: 250 }, (f) => f && scheduleOnRN(onDone)));
        return;
      }
      intro.value = withTiming(1, { duration: 280, easing: ease.out });
      // Revving: three pulls down, each a bit deeper.
      charge.value = withDelay(
        300,
        withSequence(
          withTiming(0.55, { duration: 150, easing: ease.out }),
          withTiming(0.15, { duration: 110, easing: ease.inOut }),
          withTiming(0.8, { duration: 150, easing: ease.out }),
          withTiming(0.3, { duration: 100, easing: ease.inOut }),
          withTiming(1, { duration: 190, easing: ease.out }),
        ),
      );
      at(300, () => haptic('light'));
      at(560, () => haptic('light'));
      at(810, () => haptic('medium'));
      launch.value = withDelay(1010, withTiming(1, { duration: 430, easing: ease.in }));
      at(1010, () => haptic('heavy'));
      out.value = withDelay(1280, withTiming(1, { duration: 300, easing: ease.out }, (f) => f && scheduleOnRN(onDone)));
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [intro, charge, launch, out, onDone]);

  const container = useAnimatedStyle(() => ({ opacity: 1 - out.value }));
  const mark = useAnimatedStyle(() => ({ opacity: intro.value, transform: [{ scale: interpolate(intro.value, [0, 1], [0.86, 1]) }] }));
  const diamond = useAnimatedStyle(() => ({
    opacity: 1 - launch.value * 0.35,
    transform: [{ translateY: charge.value * 3 }],
  }));
  const middle = useAnimatedStyle(() => ({ transform: [{ translateY: charge.value * 7 - launch.value * 46 }] }));
  const top = useAnimatedStyle(() => ({
    transform: [{ translateY: charge.value * 11 - launch.value * 340 }, { scaleY: 1 - charge.value * 0.07 + launch.value * 0.12 }],
  }));
  const glow = useAnimatedStyle(() => ({
    opacity: 0.55 + charge.value * 0.45,
    transform: [{ translateY: charge.value * 8 - launch.value * 170 }, { scale: 1 + charge.value * 0.18 + launch.value * 0.5 }],
  }));
  const trail = useAnimatedStyle(() => ({
    opacity: interpolate(launch.value, [0, 0.15, 1], [0, 1, 0.85]),
    height: launch.value * 260,
    transform: [{ translateY: -launch.value * 230 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: background }, container]}>
      <Animated.View style={[{ width: (SIZE * 120) / 152, height: SIZE }, mark]}>
        <Animated.View style={[StyleSheet.absoluteFill, glow]}>
          <MarkLayer piece="glow" size={SIZE} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, diamond]}>
          <MarkLayer piece="diamond" size={SIZE} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, middle]}>
          <MarkLayer piece="middle" size={SIZE} />
        </Animated.View>
        <Animated.View style={[styles.trail, trail]}>
          <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 100">
            <Defs>
              <LinearGradient id="fd-trail" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={MARK.colors.topFrom} stopOpacity={0.9} />
                <Stop offset="1" stopColor={MARK.colors.glow} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={10} height={100} rx={5} fill="url(#fd-trail)" />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, top]}>
          <MarkLayer piece="top" size={SIZE} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  // Starts under the green chevron and stretches down while it climbs.
  trail: { position: 'absolute', left: '34%', width: '32%', top: SIZE * 0.42, borderRadius: 999, overflow: 'hidden' },
});
