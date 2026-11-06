import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, ZoomIn } from 'react-native-reanimated';
import { getMeta, setMeta } from '@/backup/snapshot';
import { getStreak, settleVault } from '@/data/streak';
import { milestoneAt, type Streak, type StreakEvent } from '@/domain/streak';
import { DAY_LETTER, todayKey, weekday } from '@/lib/dates';
import { playReward } from '@/lib/sound';
import { notifyDataChanged } from '@/state/dataBus';
import { useDataVersion, useDb, useQuery } from '@/state/db';
import { haptic, useToast } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Flame } from './Flame';
import { Foki } from './mascot/Foki';
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
              backgroundColor: d.done ? c.streak : d.frozen ? c.proteinSoft : c.surfaceAlt,
              borderWidth: d.isToday && !d.done ? 2 : 0,
              borderColor: c.streak,
              opacity: d.future ? 0.45 : 1,
            }}
          >
            {d.done ? <MaterialCommunityIcons name="fire" size={size * 0.55} color="#1A0F02" /> : d.frozen ? <MaterialCommunityIcons name="shield-check" size={size * 0.55} color={c.protein} /> : null}
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

/**
 * Tells what happened to the streak while the app was closed: a shield covered the missed days, or
 * the streak went out. A new shield earned is just a toast.
 */
export function StreakNotice({ enabled }: { enabled: boolean }) {
  const c = useColors();
  const db = useDb();
  const toast = useToast();
  const version = useDataVersion();
  const today = todayKey();
  const [event, setEvent] = useState<StreakEvent | null>(null);

  useEffect(() => {
    if (!enabled) return;
    void settleVault(db, today).then((e) => {
      if (!e) return;
      notifyDataChanged();
      if (e.kind === 'earned') toast.show('¡Ganaste un protector de racha!');
      else setEvent(e);
    });
  }, [enabled, db, today, version, toast]);

  if (!event || event.kind === 'earned') return null;
  const saved = event.kind === 'saved';
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setEvent(null)} statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: c.overlay }]}>
        <Animated.View entering={FadeIn.duration(220)} style={[styles.card, { backgroundColor: c.surface }]}>
          <Foki mood={saved ? 'proud' : 'sad'} lit={saved} size={120} />
          <T variant="title" style={{ textAlign: 'center', marginTop: space.lg }}>{saved ? 'Te salvé la racha' : `Se apagó tu racha de ${days(event.streak)}`}</T>
          <T variant="label" tone="muted" style={{ textAlign: 'center', marginTop: space.xs }}>
            {saved
              ? `Usé ${event.days === 1 ? 'un protector' : `${event.days} protectores`} para cubrir ${event.days === 1 ? 'el día que faltaste' : 'los días que faltaste'}. Seguís con ${days(event.streak)}.`
              : 'Pasa. Lo que importa es volver: registrá algo hoy y prendemos una nueva.'}
          </T>
          <Button label={saved ? '¡Gracias, Foki!' : 'Empezar de nuevo'} size="lg" full style={{ marginTop: space.xl }} onPress={() => setEvent(null)} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: { width: '100%', maxWidth: 380, borderRadius: radius.xl, padding: space.xl, alignItems: 'center' },
  flame: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
});
