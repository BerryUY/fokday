import { useEffect, useId } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Stop, Circle } from 'react-native-svg';

/**
 * The streak flame: three layered SVG tongues that flicker at different speeds, sway from the
 * base, breathe a warm glow and (when big) throw a few embers. Unlit it's a still grey flame.
 * Every motion is an eased loop: no springs, no bounce.
 */

// viewBox 0 0 64 80, the base of the flame at the bottom center.
const OUTER = 'M32 2 C36 16 52 24 54 44 C56 62 45 76 32 78 C19 76 8 64 10 46 C11 34 18 28 22 20 C24 28 28 30 30 30 C28 20 29 10 32 2 Z';
const MIDDLE = 'M33 24 C36 35 47 42 47 56 C47 68 41 75 32 76 C23 75 17 68 18 57 C19 49 24 45 27 39 C29 44 31 45 32 45 C31 38 31 31 33 24 Z';
const CORE = 'M32 46 C35 53 41 57 41 65 C41 71 37 75 32 75 C27 75 23 71 23 66 C23 61 27 57 30 52 C31 55 32 56 32 56 C32 52 31 49 32 46 Z';

const ease = Easing.inOut(Easing.sin);

/** An endless back-and-forth between two values. */
function useLoop(from: number, to: number, ms: number, delay: number, on: boolean): SharedValue<number> {
  const v = useSharedValue(from);
  useEffect(() => {
    v.set(on ? withDelay(delay, withRepeat(withTiming(to, { duration: ms, easing: ease }), -1, true, undefined, ReduceMotion.Never)) : from);
  }, [v, from, to, ms, delay, on]);
  return v;
}

export function Flame({ size = 24, lit = true, embers = false, style }: { size?: number; lit?: boolean; embers?: boolean; style?: ViewStyle }) {
  const reduced = useReducedMotion();
  const moving = lit && !reduced;
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const w = size * 0.8;
  const h = size;

  const sway = useLoop(-2.5, 2.5, 1500, 0, moving);
  const outerY = useLoop(0.97, 1.05, 900, 0, moving);
  const midY = useLoop(0.92, 1.08, 640, 120, moving);
  const midSway = useLoop(3, -3, 1100, 0, moving);
  const coreS = useLoop(0.9, 1.08, 480, 60, moving);
  const glow = useLoop(0.25, 0.5, 1300, 0, moving);

  const outerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sway.get()}deg` }, { scaleY: outerY.get() }, { scaleX: 2 - outerY.get() }] }));
  const midStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${midSway.get()}deg` }, { scaleY: midY.get() }] }));
  const coreStyle = useAnimatedStyle(() => ({ transform: [{ scale: coreS.get() }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));

  const g = (name: string) => `${name}${id}`;
  const layer = (d: string, fill: string) => (
    <Svg width={w} height={h} viewBox="0 0 64 80">
      <Defs>
        <LinearGradient id={g('o')} x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={lit ? '#F2441B' : '#5C5C63'} />
          <Stop offset="1" stopColor={lit ? '#FFA53A' : '#7A7A82'} />
        </LinearGradient>
        <LinearGradient id={g('m')} x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={lit ? '#FF8A1F' : '#8A8A92'} />
          <Stop offset="1" stopColor={lit ? '#FFC94D' : '#9E9EA6'} />
        </LinearGradient>
        <LinearGradient id={g('c')} x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={lit ? '#FFE07A' : '#B4B4BB'} />
          <Stop offset="1" stopColor={lit ? '#FFF8D6' : '#C8C8CE'} />
        </LinearGradient>
      </Defs>
      <Path d={d} fill={`url(#${g(fill)})`} />
    </Svg>
  );

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }, style]} pointerEvents="none">
      {lit ? (
        <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
          <Svg width={size} height={size} viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id={g('glow')} cx="50" cy="58" r="42" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#FF9632" stopOpacity="0.9" />
                <Stop offset="1" stopColor="#FF9632" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx="50" cy="58" r="42" fill={`url(#${g('glow')})`} />
          </Svg>
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.layer, { width: w, height: h }, outerStyle]}>{layer(OUTER, 'o')}</Animated.View>
      <Animated.View style={[styles.layer, { width: w, height: h }, midStyle]}>{layer(MIDDLE, 'm')}</Animated.View>
      <Animated.View style={[styles.layer, { width: w, height: h }, coreStyle]}>{layer(CORE, 'c')}</Animated.View>
      {embers && moving ? [0, 1, 2].map((i) => <Ember key={i} index={i} size={size} />) : null}
    </View>
  );
}

/** A spark that rises, drifts and fades, then starts over. */
function Ember({ index, size }: { index: number; size: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(index * 650, withRepeat(withSequence(withTiming(1, { duration: 1700, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })), -1)));
  }, [t, index]);
  const drift = (index - 1) * size * 0.12;
  const style = useAnimatedStyle(() => ({
    opacity: t.get() < 0.1 ? t.get() * 10 : 1 - t.get(),
    transform: [{ translateY: -t.get() * size * 0.55 }, { translateX: drift * t.get() }, { scale: 1 - t.get() * 0.5 }],
  }));
  const d = Math.max(3, size * 0.05);
  return <Animated.View style={[styles.ember, { width: d, height: d, borderRadius: d, bottom: size * 0.55, left: size / 2 - d / 2 + (index - 1) * size * 0.08 }, style]} />;
}

const styles = StyleSheet.create({
  // Transforms grow and sway from the base, like a real flame.
  layer: { position: 'absolute', bottom: 0, transformOrigin: 'bottom' },
  ember: { position: 'absolute', backgroundColor: '#FFC94D' },
});
