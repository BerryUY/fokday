import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { IconBubble, IconButton, T, type IconName } from './primitives';
import { Skeleton, type SkeletonVariant } from './skeleton';

export const TAB_BAR_SPACE = 90;

/**
 * Scrollable screen. `tab` screens leave room for the floating tab bar;
 * stack screens get a header with a back button.
 */
export function Screen({ children, title, subtitle, right, tab, footer, scroll = true, contentStyle, onBack, onRefresh, refreshing }: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  tab?: boolean;
  footer?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  onBack?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const bottom = tab ? TAB_BAR_SPACE + insets.bottom : footer ? space.lg : insets.bottom + space.xxl;
  const header = !tab && title !== undefined ? (
    <View style={[styles.stackHeader, { paddingTop: insets.top + 6 }]}>
      <IconButton icon="chevron-left" label="Volver" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} />
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: space.sm }}>
        <T variant="h3" numberOfLines={1}>{title}</T>
        {subtitle ? <T variant="caption" tone="dim" numberOfLines={1}>{subtitle}</T> : null}
      </View>
      <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
    </View>
  ) : null;

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[{ paddingHorizontal: space.lg, paddingTop: tab ? insets.top + space.md : space.sm, paddingBottom: bottom }, contentStyle]}
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingTop: tab ? insets.top : 0 }, contentStyle]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding">
      {header}
      {body}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md, backgroundColor: c.bg, borderTopColor: c.border }]}>{footer}</View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function TabHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.tabHeader}>
      <View style={{ flex: 1 }}>
        {subtitle ? <T variant="overline" tone="dim" style={{ marginBottom: 4 }}>{subtitle}</T> : null}
        <T variant="display">{title}</T>
      </View>
      {right}
    </View>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message?: string; action?: ReactNode }) {
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.empty}>
      <IconBubble icon={icon} size={52} tone="muted" />
      <T variant="h3" style={{ marginTop: space.md, textAlign: 'center' }}>{title}</T>
      {message ? <T variant="label" tone="muted" style={{ marginTop: 4, textAlign: 'center', maxWidth: 280 }}>{message}</T> : null}
      {action ? <View style={{ marginTop: space.lg }}>{action}</View> : null}
    </Animated.View>
  );
}

export function ListRow({ icon, iconTone = 'muted', title, subtitle, right, action, onPress, chevron = !!onPress, style }: {
  icon?: IconName;
  iconTone?: 'accent' | 'protein' | 'weight' | 'muted' | 'danger';
  title: string;
  subtitle?: string;
  /** Something to read at the end of the row. Inside the pressable part, so never a button. */
  right?: ReactNode;
  /** A button at the end of the row, beside the pressable part. */
  action?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const content = (
    <>
      {icon && <IconBubble icon={icon} tone={iconTone} size={34} />}
      <View style={{ flex: 1 }}>
        <T variant="bodyMedium" numberOfLines={1}>{title}</T>
        {subtitle ? <T variant="caption" tone="dim" numberOfLines={2}>{subtitle}</T> : null}
      </View>
      {right}
      {chevron && <Feather name="chevron-right" size={18} color={c.textDim} />}
    </>
  );
  // A row with nothing to do is a plain view: a disabled pressable would also disable a switch inside it.
  const row = onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfacePressed }, style]} accessibilityRole="button">
      {content}
    </Pressable>
  ) : (
    <View style={[styles.row, style]}>{content}</View>
  );
  if (!action) return row;
  return (
    <View style={styles.withAction}>
      <View style={{ flex: 1 }}>{row}</View>
      {action}
    </View>
  );
}

/** What a screen shows while its data loads. */
export function Loading({ variant }: { variant?: SkeletonVariant }) {
  return <Skeleton variant={variant} />;
}

export function ErrorNote({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <View style={{ paddingVertical: space.lg }}>
      <T variant="label" tone="danger">No se pudieron leer los datos: {error.message}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  stackHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingBottom: space.sm },
  tabHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: space.xl, gap: space.md },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  withAction: { flexDirection: 'row', alignItems: 'center', paddingRight: space.lg },
  empty: { alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 50, paddingVertical: 10, paddingHorizontal: space.lg, borderRadius: radius.md },
});
