import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { MOTION } from './motion';

/**
 * Fades its content up on mount. It only animates opacity and position on a normal view, on purpose:
 * Reanimated's `entering` animations keep the frame the view had when they started, so a card whose
 * data arrives during the animation (slow phones) could stay cut off until the app restarted.
 */
export function Reveal({ children, index = 0, style }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(40 * index, withTiming(1, MOTION.enter)));
  }, [p, index]);
  const animated = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateY: (1 - p.get()) * 12 }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
