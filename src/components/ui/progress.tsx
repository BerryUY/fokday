import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from '@/theme/ThemeProvider';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Animated ring. Values above 1 draw a second, brighter lap so going over a
 * target is visible without being shown as an error.
 */
export function ProgressRing({ progress, size = 120, stroke = 12, color, trackColor, children }: {
  progress: number;
  size?: number;
  stroke?: number;
  color: string;
  trackColor?: string;
  children?: ReactNode;
}) {
  const c = useColors();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const value = useSharedValue(0);

  useEffect(() => {
    value.value = withTiming(Math.max(0, Math.min(progress, 2)), { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [progress, value]);

  const firstLap = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - Math.min(value.value, 1)) }));
  const secondLap = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - Math.max(0, value.value - 1)) }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? c.track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={firstLap}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.text}
          strokeOpacity={0.55}
          strokeWidth={stroke * 0.45}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={secondLap}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
    </View>
  );
}

export function ProgressBar({ progress, color, height = 8, style, trackColor }: {
  progress: number;
  color: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  trackColor?: string;
}) {
  const c = useColors();
  const value = useSharedValue(0);
  useEffect(() => {
    value.value = withTiming(Math.max(0, Math.min(progress, 1)), { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [progress, value]);
  const fill = useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: trackColor ?? c.track, overflow: 'hidden' }, style]}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, fill]} />
    </View>
  );
}
