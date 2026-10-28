import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { Easing, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** One motion language for the app: quick, eased, never bouncy. */
export const MOTION = {
  enter: { duration: 260, easing: Easing.out(Easing.cubic) },
  exit: { duration: 190, easing: Easing.in(Easing.cubic) },
  press: { duration: 110, easing: Easing.out(Easing.quad) },
} as const;

/**
 * Keeps an overlay mounted while it animates out. `progress` goes 0 → 1 on open and back to 0
 * on close; the overlay unmounts only when the exit animation finishes.
 */
export function usePresence(visible: boolean): { mounted: boolean; progress: SharedValue<number> } {
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  // Mount as soon as it opens (state adjusted during render, React's recommended pattern).
  if (visible && !mounted) setMounted(true);
  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, MOTION.enter);
    } else {
      progress.value = withTiming(0, MOTION.exit, (finished) => {
        if (finished) scheduleOnRN(setMounted, false);
      });
    }
  }, [visible, progress]);
  return { mounted: mounted || visible, progress };
}

/** Android back button closes the topmost open overlay first. */
export function useBackToClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [active, onClose]);
}
