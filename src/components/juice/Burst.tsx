import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useColors } from '@/theme/ThemeProvider';

const COUNT = 16;

/** One spark flying out from the center and fading. */
function Spark({ index, color, play }: { index: number; color: string; play: number }) {
  const t = useSharedValue(0);
  const angle = (index / COUNT) * Math.PI * 2 + (index % 2 ? 0.2 : -0.1);
  const distance = 70 + (index % 4) * 18;
  const size = index % 3 === 0 ? 9 : 6;
  useEffect(() => {
    if (!play) return;
    t.value = 0;
    t.value = withDelay((index % 4) * 18, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, [play, index, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : 1 - t.value,
    transform: [
      { translateX: Math.cos(angle) * distance * t.value },
      { translateY: Math.sin(angle) * distance * t.value + 20 * t.value * t.value },
      { scale: 1 - t.value * 0.4 },
      { rotate: `${t.value * 180}deg` },
    ],
  }));
  return <Animated.View style={[styles.spark, { width: size, height: size, backgroundColor: color, borderRadius: index % 3 === 0 ? 2 : size }, style]} />;
}

/**
 * A burst of sparks from the middle of its parent; bump `play` (a counter) to fire it again.
 * Drawn above the content and never blocks touches.
 */
export function Burst({ play }: { play: number }) {
  const c = useColors();
  const colors = [c.accent, '#FFFFFF', c.protein, c.weight];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      {Array.from({ length: COUNT }, (_, i) => (
        <Spark key={i} index={i} color={colors[i % colors.length]} play={play} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  spark: { position: 'absolute' },
});
