import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { usePro } from '@/billing/pro';
import { ProLock } from '@/components/ProGate';
import { Button, Card, Row, T } from '@/components/ui/primitives';
import { getSetting } from '@/data/settings';
import { parseWeekSummary, weekKey, type WeekSummary } from '@/domain/weeklySummary';
import { todayKey } from '@/lib/dates';
import { formatDecimal } from '@/lib/format';
import { useCloudConfig } from '@/state/cloud';
import { useDb, useQuery } from '@/state/db';
import { startWeeklySummary, useSummaryJob } from '@/state/summaryJob';
import { useToast } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/**
 * Pro: an AI read of the last 7 days (comida, gym y progreso por ejercicio, actividad, peso,
 * hábitos, tareas, racha): the week's key numbers, wins, what to improve, a 3-step plan, one tip
 * and next week's focus. Folds like an accordion once made. Made on request in the background and
 * kept for the week, so it never runs on its own.
 */
export function WeeklySummaryCard({ showLock = false }: { showLock?: boolean }) {
  const c = useColors();
  const db = useDb();
  const toast = useToast();
  const pro = usePro();
  const job = useSummaryJob();
  const { config } = useCloudConfig();
  const [open, setOpen] = useState(false);
  const week = weekKey(todayKey());
  const { data } = useQuery(async (d) => {
    const [savedWeek, json, text, input] = await Promise.all(['summary.week', 'summary.json', 'summary.text', 'summary.input'].map((k) => getSetting(d, k)));
    if (savedWeek !== week) return { summary: null, stats: [] };
    const old: WeekSummary | null = text ? { title: 'Tu semana', wins: [], improve: [], plan: [], tip: text, focus: '' } : null;
    return { summary: parseWeekSummary(json) ?? old, stats: weekStats(input) };
  }, [week]);

  if (!pro) {
    return showLock ? (
      <ProLock title="Resumen semanal con IA" message="Cada semana: lo que salió bien, cuánto progresaste en cada ejercicio, qué mejorar y un consejo concreto para la próxima." />
    ) : null;
  }

  const make = () => {
    if (!config) {
      toast.show('Entrá con tu cuenta para armar el resumen.', 'info');
      return;
    }
    void startWeeklySummary(db, config);
  };

  const running = job.status === 'running';
  const summary = data?.summary ?? null;

  return (
    <Card style={{ gap: space.md }}>
      <Row gap={space.sm}>
        <Feather name="message-circle" size={18} color={c.accent} />
        <T variant="h3" style={{ flex: 1 }}>Tu semana</T>
        {summary && !running && (
          <Pressable onPress={make} hitSlop={10} accessibilityRole="button" accessibilityLabel="Rehacer el resumen">
            <T variant="caption" tone="muted">Rehacer</T>
          </Pressable>
        )}
      </Row>
      {running ? (
        <Making attempt={job.attempt} />
      ) : summary ? (
        <Animated.View entering={FadeIn.duration(300)} style={{ gap: space.md }}>
          <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ gap: space.md }}>
            <Row gap={space.sm} align="flex-start">
              <T variant="h2" style={{ flex: 1 }}>{summary.title}</T>
              <Chevron open={open} />
            </Row>
            {data?.stats.length ? (
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                {data.stats.map((st) => (
                  <View key={st} style={[styles.stat, { backgroundColor: c.surfaceAlt }]}>
                    <T variant="caption">{st}</T>
                  </View>
                ))}
              </Row>
            ) : null}
            {!open ? <T variant="caption" tone="accent">Ver lo bueno, qué mejorar y tu plan</T> : null}
          </Pressable>
          {open ? (
            <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(150)} style={{ gap: space.md }}>
              <SummaryBody summary={summary} />
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : (
        <>
          <T variant="label" tone="muted">
            Lo bueno, lo que podés mejorar y tu progreso en cada ejercicio de los últimos 7 días, con un consejo para la semana que viene.
          </T>
          <Button label="Armar mi resumen" icon="zap" size="sm" onPress={make} />
        </>
      )}
    </Card>
  );
}

function SummaryBody({ summary }: { summary: WeekSummary }) {
  const c = useColors();
  return (
    <>
      {summary.wins.length ? <T variant="overline" tone="dim">Lo bueno</T> : null}
      {summary.wins.map((w) => (
        <Line key={w} icon="check-circle" color={c.accent} text={w} />
      ))}
      {summary.improve.length ? <T variant="overline" tone="dim">Para mejorar</T> : null}
      {summary.improve.map((w) => (
        <Line key={w} icon="trending-up" color={c.weight} text={w} />
      ))}
      {summary.plan.length ? (
        <View style={[styles.plan, { borderColor: c.border }]}>
          <T variant="overline" tone="dim">Tu plan para esta semana</T>
          {summary.plan.map((step, i) => (
            <Row key={step} gap={space.sm} align="flex-start">
              <View style={[styles.step, { backgroundColor: c.accent }]}>
                <T variant="caption" color={c.accentText}>{i + 1}</T>
              </View>
              <T variant="body" style={{ flex: 1 }}>{step}</T>
            </Row>
          ))}
        </View>
      ) : null}
      {!!summary.tip && (
        <View style={[styles.tip, { backgroundColor: c.accentSoft }]}>
          <T variant="overline" color={c.accent}>Consejo</T>
          <T variant="body">{summary.tip}</T>
        </View>
      )}
      {!!summary.focus && (
        <Row gap={space.xs}>
          <Feather name="target" size={14} color={c.textMuted} />
          <T variant="caption" tone="muted" style={{ flex: 1 }}>
            Foco de la próxima semana: <T variant="caption">{summary.focus}</T>
          </T>
        </Row>
      )}
    </>
  );
}

/** The chevron turns smoothly when the card opens or closes. */
function Chevron({ open }: { open: boolean }) {
  const c = useColors();
  const turn = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    turn.set(withTiming(open ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [open, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 180}deg` }] }));
  return (
    <Animated.View style={[{ marginTop: 4 }, style]}>
      <Feather name="chevron-down" size={22} color={c.textMuted} />
    </Animated.View>
  );
}

/** The week's key numbers, from what the phone sent (no AI): kcal, protein, gym, weight, tasks. */
export function weekStats(input: string | null): string[] {
  let w: Record<string, unknown>;
  try {
    w = JSON.parse(input ?? '') as Record<string, unknown>;
  } catch {
    return [];
  }
  const n = (k: string) => (typeof w[k] === 'number' ? (w[k] as number) : null);
  const out: string[] = [];
  const kcal = n('kcal_promedio');
  if (kcal !== null && n('meta_kcal')) out.push(`${formatDecimal(kcal, 0)} / ${formatDecimal(n('meta_kcal')!, 0)} kcal`);
  if (n('dias_que_llego_a_la_proteina') !== null) out.push(`Proteína ${n('dias_que_llego_a_la_proteina')}/7 días`);
  if (n('dias_de_gym') !== null) out.push(`Gym ${n('dias_de_gym')}${n('dias_de_gym_planeados') ? `/${n('dias_de_gym_planeados')}` : ''} días`);
  const kg = n('peso_cambio_kg');
  if (kg !== null) out.push(`Peso ${kg > 0 ? '+' : ''}${formatDecimal(kg, 1)} kg`);
  const todos = w.tareas as { hechas?: number; total?: number } | undefined;
  if (todos?.total) out.push(`Tareas ${todos.hechas ?? 0}/${todos.total}`);
  return out;
}

function Line({ icon, color, text }: { icon: 'check-circle' | 'trending-up'; color: string; text: string }) {
  return (
    <Row gap={space.sm} align="flex-start">
      <Feather name={icon} size={16} color={color} style={{ marginTop: 2 }} />
      <T variant="body" style={{ flex: 1 }}>{text}</T>
    </Row>
  );
}

/** The "haciéndose" state: the person can leave, it keeps going and a toast says when it's ready. */
function Making({ attempt }: { attempt: number }) {
  const c = useColors();
  return (
    <Animated.View entering={FadeIn.duration(250)} style={[styles.making, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
      <Row gap={space.sm}>
        <Dot delay={0} />
        <Dot delay={160} />
        <Dot delay={320} />
        <T variant="bodyMedium" style={{ flex: 1, marginLeft: space.xs }}>Armando tu resumen…</T>
      </Row>
      <T variant="caption" tone="muted">
        {attempt > 1
          ? 'La IA está con mucha demanda, lo reintentamos solos. Seguí usando la app.'
          : 'Estamos leyendo tu semana: comidas, entrenamientos, peso, hábitos y tareas. Seguí usando la app, te avisamos cuando esté.'}
      </T>
    </Animated.View>
  );
}

function Dot({ delay }: { delay: number }) {
  const c = useColors();
  const o = useSharedValue(0.25);
  useEffect(() => {
    o.set(withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0.25, { duration: 420 })), -1)));
  }, [o, delay]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[styles.dot, { backgroundColor: c.accent }, style]} />;
}

const styles = StyleSheet.create({
  tip: { borderRadius: radius.md, padding: space.md, gap: space.xs },
  stat: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  plan: { borderRadius: radius.md, borderWidth: 1, padding: space.md, gap: space.sm },
  step: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  making: { borderRadius: radius.md, borderWidth: 1, padding: space.md, gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
