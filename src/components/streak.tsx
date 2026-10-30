import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, ZoomIn } from 'react-native-reanimated';
import { getMeta, setMeta } from '@/backup/snapshot';
import { getStreak } from '@/data/streak';
import { milestoneAt, type Streak } from '@/domain/streak';
import { DAY_LETTER, todayKey, weekday } from '@/lib/dates';
import { playReward } from '@/lib/sound';
import { useDb, useQuery } from '@/state/db';
import { haptic } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Flame } from './Flame';
import { Button, PressableScale, Row, T } from './ui/primitives';

const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

/** Header flame: lit once today counts, grey (but still showing the number) while it's pending. */
export function StreakChip({ streak }: { streak: Streak }) {
  const c = useColors();
  const lit = streak.doneToday;
  return (
    <PressableScale
      onPress={() => router.push('/racha')}
      hapticFeedback
      accessibilityRole="button"
      accessibilityLabel={`Racha de ${days(streak.current)}${lit ? '' : ', todavía no sumaste hoy'}`}
      style={[styles.chip, { backgroundColor: lit ? c.streakSoft : c.surface, borderColor: lit ? 'transparent' : c.border }]}
    >
      <Flame size={24} lit={lit} />
      <T variant="h3" color={lit ? c.streak : c.textMuted} style={{ fontVariant: ['tabular-nums'] }}>{streak.current}</T>
    </PressableScale>
  );
}

/** Shown on Inicio only while today doesn't count yet: the nudge that protects the streak. */
export function StreakBanner({ streak }: { streak: Streak }) {
  const c = useColors();
  if (streak.doneToday) return null;
  const atRisk = streak.current > 0;
  return (
    <PressableScale onPress={() => router.push('/racha')} style={[styles.banner, { backgroundColor: c.streakSoft }]} accessibilityRole="button">
      <Flame size={32} />
      <View style={{ flex: 1 }}>
        <T variant="bodyMedium" color={c.streak}>{atRisk ? `No pierdas tu racha de ${days(streak.current)}` : 'Arrancá tu racha hoy'}</T>
        <T variant="caption" tone="muted">Registrá una comida o un entrenamiento.</T>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={c.streak} />
    </PressableScale>
  );
}

/** Monday-first week with a flame on every day that counted. */
export function StreakWeek({ streak, size = 38 }: { streak: Streak; size?: number }) {
  const c = useColors();
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      {streak.week.map((d) => (
        <View key={d.date} style={{ alignItems: 'center', gap: 6 }}>
          <T variant="caption" tone={d.isToday ? 'default' : 'dim'}>{DAY_LETTER[weekday(d.date)]}</T>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: d.done ? c.streak : c.surfaceAlt,
              borderWidth: d.isToday && !d.done ? 2 : 0,
              borderColor: c.streak,
              opacity: d.future ? 0.45 : 1,
            }}
          >
            {d.done ? <MaterialCommunityIcons name="fire" size={size * 0.55} color="#1A0F02" /> : null}
          </View>
        </View>
      ))}
    </Row>
  );
}

/**
 * Celebrates once a day, the moment today first counts (any screen): flame, number, a short
 * line, haptic and the reward sound. Bigger words on milestones (3, 7, 14, 30 days…).
 */
export function StreakCelebration({ enabled }: { enabled: boolean }) {
  const c = useColors();
  const db = useDb();
  const today = todayKey();
  const { data } = useQuery(async (d) => ({ streak: await getStreak(d, today), seen: await getMeta(d, 'streak_celebrated') }), [today]);
  const [closedOn, setClosedOn] = useState<string | null>(null);
  // Marked as seen when closed, so a celebration interrupted by closing the app shows again.
  const visible = enabled && !!data && data.streak.doneToday && data.seen !== today && closedOn !== today;

  useEffect(() => {
    if (!visible) return;
    haptic('heavy');
    void playReward();
  }, [visible]);

  if (!visible || !data) return null;
  const shown = data.streak;
  const close = () => {
    setClosedOn(today);
    void setMeta(db, 'streak_celebrated', today);
  };
  const n = shown.current;
  const milestone = milestoneAt(n);
  return (
    <Modal transparent animationType="fade" visible onRequestClose={close} statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: c.overlay }]}>
        <Animated.View entering={FadeIn.duration(220)} style={[styles.card, { backgroundColor: c.surface }]}>
          <Animated.View entering={ZoomIn.duration(420).delay(80).easing(Easing.out(Easing.cubic))} style={[styles.flame, { backgroundColor: c.streakSoft }]}>
            <Flame size={96} embers />
          </Animated.View>
          <T variant="hero" color={c.streak} style={{ fontSize: 64, lineHeight: 70, textAlign: 'center' }}>{n}</T>
          <T variant="title" style={{ textAlign: 'center' }}>{n === 1 ? '¡Empezaste tu racha!' : milestone ? `¡${days(n)} seguidos!` : `¡Racha de ${days(n)}!`}</T>
          <T variant="label" tone="muted" style={{ textAlign: 'center', marginTop: space.xs }}>
            {milestone && n > 1 ? 'Eso es constancia de verdad. Seguí así.' : 'Volvé mañana para que siga creciendo.'}
          </T>
          <View style={{ alignSelf: 'stretch', marginTop: space.xl }}>
            <StreakWeek streak={shown} size={32} />
          </View>
          <Button label="¡Vamos!" size="lg" full style={{ marginTop: space.xl }} onPress={close} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, padding: space.lg },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: { width: '100%', maxWidth: 380, borderRadius: radius.xl, padding: space.xl, alignItems: 'center' },
  flame: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
});
