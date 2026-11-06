import { Feather } from '@expo/vector-icons';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MOTION } from './motion';
import { haptic } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { font, radius, space, type, type Palette, type TypeVariant } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Feather>['name'];

// ---------- Text ----------

type Tone = 'default' | 'muted' | 'dim' | 'accent' | 'protein' | 'weight' | 'danger' | 'inverse';

export function toneColor(c: Palette, tone: Tone): string {
  switch (tone) {
    case 'muted': return c.textMuted;
    case 'dim': return c.textDim;
    case 'accent': return c.accent;
    case 'protein': return c.protein;
    case 'weight': return c.weight;
    case 'danger': return c.danger;
    case 'inverse': return c.accentText;
    default: return c.text;
  }
}

export function T({ variant = 'body', tone = 'default', color, style, ...rest }: TextProps & { variant?: TypeVariant; tone?: Tone; color?: string }) {
  const c = useColors();
  return <Text {...rest} style={[type[variant] as TextStyle, { color: color ?? toneColor(c, tone) }, style]} />;
}

// ---------- Pressable with a subtle scale ----------

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({ style, children, onPressIn, onPressOut, scaleTo = 0.97, hapticFeedback = false, onPress, ...rest }: PressableProps & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  scaleTo?: number;
  hapticFeedback?: boolean;
}) {
  const scale = useSharedValue(1);
  // Pressed state: a touch smaller and dimmer, eased in and out (no spring, no bounce).
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: 1 - (1 - scale.value) * 2.5 }));
  return (
    <AnimatedPressable
      {...rest}
      onPress={(e) => {
        if (hapticFeedback) haptic('light');
        onPress?.(e);
      }}
      onPressIn={(e) => {
        scale.value = withTiming(scaleTo, MOTION.press);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, MOTION.enter);
        onPressOut?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

// ---------- Card ----------

export function Card({ children, style, onPress, padded = true, tone = 'surface' }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
  /** outline: no fill, just a hairline, for variety without breaking the calm. */
  tone?: 'surface' | 'alt' | 'accent' | 'outline';
}) {
  const c = useColors();
  const bg = tone === 'alt' ? c.surfaceAlt : tone === 'accent' ? c.accentSoft : tone === 'outline' ? 'transparent' : c.surface;
  const base = [styles.card, { backgroundColor: bg }, tone === 'outline' && { borderWidth: 1, borderColor: c.border }, padded && { padding: space.lg }, style];
  if (onPress) {
    return (
      <PressableScale onPress={onPress} style={base} scaleTo={0.985}>
        {children}
      </PressableScale>
    );
  }
  return <View style={base}>{children}</View>;
}

// ---------- Buttons ----------

/** danger = soft red (cancel, remove); dangerSolid = filled red for the final destructive confirm. */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSolid';

export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, size = 'md', style, full }: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const c = useColors();
  const off = disabled && variant === 'primary';
  const bg = off ? c.surfaceAlt : variant === 'primary' ? c.accent : variant === 'secondary' ? c.surfaceAlt : variant === 'danger' ? c.dangerSoft : variant === 'dangerSolid' ? c.danger : 'transparent';
  const fg = off ? c.textDim : variant === 'primary' ? c.accentText : variant === 'danger' ? c.danger : variant === 'dangerSolid' ? '#FFFFFF' : variant === 'ghost' ? c.textMuted : c.text;
  const height = size === 'lg' ? 54 : size === 'sm' ? 36 : 46;
  const inactive = disabled || loading;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={inactive}
      onPress={onPress}
      hapticFeedback={variant === 'primary'}
      style={[
        styles.button,
        { backgroundColor: bg, height, paddingHorizontal: size === 'sm' ? 14 : 20, opacity: disabled && !off ? 0.45 : 1 },
        full && { alignSelf: 'stretch' },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Feather name={icon} size={size === 'sm' ? 15 : 18} color={fg} />}
          {/* One line that shrinks to fit: a fixed-height button must never wrap or clip its label (large system fonts included). */}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={1.3}
            style={[styles.buttonText, { color: fg, fontSize: size === 'sm' ? 14 : size === 'lg' ? 17 : 15, flexShrink: 1 }]}
          >
            {label}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({ icon, onPress, label, tone = 'default', size = 40, filled = true, style }: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  tone?: Tone;
  size?: number;
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      scaleTo={0.9}
      style={[
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' },
        filled && { backgroundColor: c.surfaceAlt },
        style,
      ]}
    >
      <Feather name={icon} size={Math.round(size * 0.45)} color={toneColor(c, tone)} />
    </PressableScale>
  );
}

// ---------- Chips & segmented control ----------

export function Chip({ label, selected, onPress, icon, tone = 'accent', compact }: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  tone?: 'accent' | 'protein' | 'weight';
  compact?: boolean;
}) {
  const c = useColors();
  const tint = tone === 'protein' ? c.protein : tone === 'weight' ? c.weight : c.accent;
  const soft = tone === 'protein' ? c.proteinSoft : tone === 'weight' ? c.weightSoft : c.accentSoft;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.chip,
        compact && { height: 30, paddingHorizontal: 11 },
        { backgroundColor: selected ? soft : c.surfaceAlt, borderColor: selected ? tint : 'transparent' },
      ]}
    >
      {icon && <Feather name={icon} size={13} color={selected ? tint : c.textMuted} />}
      <Text style={[styles.chipText, { color: selected ? tint : c.textMuted }]}>{label}</Text>
    </PressableScale>
  );
}

/** The iOS capsule: a thumb slides under the options, eased with no bounce. */
export function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const segment = width / options.length;
  const x = useSharedValue(0);
  useEffect(() => {
    x.set(withTiming(index * segment, MOTION.enter));
  }, [x, index, segment]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const dark = c.scheme === 'dark';
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width - 4)}
      style={[styles.segmented, { backgroundColor: dark ? 'rgba(118, 118, 128, 0.24)' : 'rgba(118, 118, 128, 0.12)' }]}
    >
      {width > 0 ? <Animated.View style={[styles.thumb, { width: segment, backgroundColor: dark ? '#636366' : '#FFFFFF' }, thumb]} /> : null}
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) haptic('light');
              onChange(o.key);
            }}
            style={styles.segment}
          >
            <Text style={[styles.segmentText, { color: c.text, fontFamily: active ? font.semibold : font.medium }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** On/off in the iOS shape, the same on every phone. */
export function Toggle({ value, onValueChange, accessibilityLabel, disabled }: { value: boolean; onValueChange: (v: boolean) => void; accessibilityLabel?: string; disabled?: boolean }) {
  const c = useColors();
  const p = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    p.set(withTiming(value ? 1 : 0, MOTION.enter));
  }, [p, value]);
  const on = useAnimatedStyle(() => ({ opacity: p.get() }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: p.get() * 20 }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        haptic('light');
        onValueChange(!value);
      }}
      style={[styles.toggle, { backgroundColor: c.scheme === 'dark' ? 'rgba(120, 120, 128, 0.36)' : 'rgba(120, 120, 128, 0.16)', opacity: disabled ? 0.45 : 1 }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.accent, borderRadius: 16 }, on]} />
      <Animated.View style={[styles.knob, knob]} />
    </Pressable>
  );
}

export function Badge({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'protein' | 'weight' | 'muted' | 'danger' }) {
  const c = useColors();
  const map = {
    accent: [c.accentSoft, c.accent],
    protein: [c.proteinSoft, c.protein],
    weight: [c.weightSoft, c.weight],
    danger: [c.dangerSoft, c.danger],
    muted: [c.surfaceAlt, c.textMuted],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <T variant="h2">{title}</T>
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <T variant="label" tone="accent">{action}</T>
        </Pressable>
      )}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }, style]} />;
}

export function Row({ children, gap = space.sm, style, align = 'center' }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; align?: ViewStyle['alignItems'] }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;
}

export function IconBubble({ icon, tone = 'accent', size = 36 }: { icon: IconName; tone?: 'accent' | 'protein' | 'weight' | 'muted' | 'danger'; size?: number }) {
  const c = useColors();
  const map = {
    accent: [c.accentSoft, c.accent],
    protein: [c.proteinSoft, c.protein],
    weight: [c.weightSoft, c.weight],
    danger: [c.dangerSoft, c.danger],
    muted: [c.surfaceAlt, c.textMuted],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.36, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name={icon} size={Math.round(size * 0.46)} color={fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: 'hidden' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.pill },
  buttonText: { fontFamily: font.semibold, letterSpacing: -0.1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1 },
  chipText: { fontFamily: font.semibold, fontSize: 13 },
  segmented: { flexDirection: 'row', borderRadius: radius.pill, padding: 2 },
  thumb: { position: 'absolute', left: 2, top: 2, bottom: 2, borderRadius: radius.pill, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segment: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13, letterSpacing: -0.1 },
  toggle: { width: 51, height: 31, borderRadius: 16, overflow: 'hidden' },
  knob: { position: 'absolute', left: 2, top: 2, width: 27, height: 27, borderRadius: 14, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontFamily: font.semibold, fontSize: 11, letterSpacing: 0.2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
});
