import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSyncState } from '@/backup/service';
import { WeekStrip } from '@/components/calendar';
import { NutritionRings } from '@/components/nutrition';
import { Loading, Screen } from '@/components/ui/layout';
import { Badge, Button, Card, IconButton, PressableScale, Row, SectionHeader, T } from '@/components/ui/primitives';
import { WeightGoalCard } from '@/components/weight';
import { getAttendanceStats, listAttendance } from '@/data/attendance';
import { getDailyTotals } from '@/data/meals';
import { getRoutineForWeekday } from '@/data/routines';
import { getGoalForDate, getProfile } from '@/data/settings';
import { listWeights } from '@/data/weight';
import { getActiveSession, startSession } from '@/data/workouts';
import { latestEntry, weightProgress } from '@/domain/weight';
import { capitalize, formatLong, greeting, startOfWeek, todayKey, weekday } from '@/lib/dates';
import { useMutation, useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export default function HomeScreen() {
  const c = useColors();
  const sync = useSyncState();
  const run = useMutation();
  const today = todayKey();
  const { data } = useQuery(async (db) => {
    const [profile, weights, totals, goal, stats, routine, active, week] = await Promise.all([
      getProfile(db),
      listWeights(db),
      getDailyTotals(db, today),
      getGoalForDate(db, today),
      getAttendanceStats(db, today),
      getRoutineForWeekday(db, weekday(today)),
      getActiveSession(db),
      listAttendance(db, startOfWeek(today), today),
    ]);
    return { profile, weights, totals, goal, stats, routine, active, week };
  }, [today]);

  if (!data) return <Screen tab><Loading /></Screen>;

  const { profile, weights, totals, goal, stats, routine, active, week } = data;
  const progress = weightProgress(profile.startWeight, profile.targetWeight, weights);
  const last = latestEntry(weights);
  const attendedSet = new Set(week.map((a) => a.date));
  const trainedToday = attendedSet.has(today);
  const isTrainingDay = stats.scheduledDays.includes(weekday(today));

  return (
    <Screen tab>
      <Row style={styles.header}>
        <View style={{ flex: 1 }}>
          <T variant="label" tone="dim">{capitalize(formatLong(today))}</T>
          <T variant="title" style={{ marginTop: 2 }}>{greeting()}{profile.name ? `, ${profile.name}` : ''}</T>
        </View>
        {sync.info?.pendingChanges && sync.configured ? (
          <View style={[styles.syncDot, { backgroundColor: sync.running ? c.protein : c.warning }]} />
        ) : null}
        <IconButton icon="settings" label="Ajustes" onPress={() => router.push('/ajustes')} />
      </Row>

      <Animated.View entering={FadeInDown.duration(380)}>
        <WeightGoalCard progress={progress} lastDate={last?.date ?? null} onPress={() => router.push('/peso')} onLog={() => router.push('/peso/registrar')} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(70).duration(380)} style={{ marginTop: space.lg }}>
        <Card onPress={() => router.push('/comidas')} style={{ paddingVertical: space.xl }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
            <T variant="h2">Nutrición de hoy</T>
            <T variant="caption" tone="dim">{totals.entries === 0 ? 'Nada registrado aún' : `${totals.entries} ${totals.entries === 1 ? 'registro' : 'registros'}`}</T>
          </Row>
          <NutritionRings calories={totals.calories} protein={totals.protein} calorieTarget={goal.calories} proteinTarget={goal.protein} />
          <Button label="Registrar comida" icon="plus" onPress={() => router.push('/comidas')} style={{ marginTop: space.xl }} />
        </Card>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(140).duration(380)} style={{ marginTop: space.lg }}>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="overline" tone="dim">Entrenamiento de hoy</T>
            {trainedToday ? <Badge label="Entrenaste hoy" /> : isTrainingDay ? <Badge label="Día de gym" tone="protein" /> : <Badge label="Descanso" tone="muted" />}
          </Row>
          <T variant="title" style={{ marginTop: space.sm }}>
            {active ? active.routineName ?? 'Entrenamiento libre' : routine ? routine.name : isTrainingDay ? 'Sin rutina asignada' : 'Día de descanso'}
          </T>
          <T variant="label" tone="muted" style={{ marginTop: 2 }}>
            {active
              ? 'Tenés un entrenamiento en curso.'
              : routine
                ? `${routine.exerciseCount} ejercicios · ${routine.totalSets} series`
                : isTrainingDay
                  ? 'Asigná una rutina a este día en Entrenar.'
                  : 'Descansar también es parte del progreso.'}
          </T>
          <View style={{ marginTop: space.lg }}>
            {active ? (
              <Button label="Continuar entrenamiento" icon="play" onPress={() => router.push('/sesion/activa')} />
            ) : trainedToday && !routine ? null : (
              <Button
                label={trainedToday ? 'Entrenar de nuevo' : 'Iniciar entrenamiento'}
                icon="play"
                variant={trainedToday ? 'secondary' : 'primary'}
                onPress={async () => {
                  if (!routine) return router.push('/entrenar');
                  const id = await run((db) => startSession(db, today, routine.id));
                  if (id) router.push('/sesion/activa');
                }}
              />
            )}
          </View>
        </Card>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(210).duration(380)} style={{ marginTop: space.lg }}>
        <Card onPress={() => router.push('/asistencia')}>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
            <View>
              <T variant="overline" tone="dim">Esta semana</T>
              <T variant="h2" style={{ marginTop: 4 }}>
                {stats.thisWeek} {stats.thisWeek === 1 ? 'entrenamiento' : 'entrenamientos'}
                {stats.scheduledDays.length ? <T variant="h2" tone="dim">{` de ${stats.scheduledDays.length}`}</T> : null}
              </T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T variant="overline" tone="dim">Racha</T>
              <Row gap={4} style={{ marginTop: 4 }}>
                <MaterialCommunityIcons name="fire" size={18} color={stats.currentStreak > 0 ? c.weight : c.textDim} />
                <T variant="h2">{stats.currentStreak}</T>
              </Row>
            </View>
          </Row>
          <WeekStrip attended={attendedSet} planned={stats.scheduledDays} today={today} />
        </Card>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(280).duration(380)} style={{ marginTop: space.xl }}>
        <SectionHeader title="Accesos rápidos" />
        <View style={styles.grid}>
          <QuickAction icon="silverware-fork-knife" label="Registrar comida" onPress={() => router.push('/comidas')} />
          <QuickAction icon="scale-bathroom" label="Registrar peso" onPress={() => router.push('/peso/registrar')} />
          <QuickAction icon="dumbbell" label="Entrenar" onPress={() => router.push(active ? '/sesion/activa' : '/entrenar')} />
          <QuickAction
            icon="clipboard-list-outline"
            label="Ver rutina"
            onPress={() => router.push(routine ? `/rutina/${routine.id}` : '/entrenar')}
          />
        </View>
      </Animated.View>
    </Screen>
  );
}

function QuickAction({ icon, label, onPress }: { icon: ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <PressableScale onPress={onPress} style={[styles.quick, { backgroundColor: c.surface }]} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.quickIcon, { backgroundColor: c.surfaceAlt }]}>
        <MaterialCommunityIcons name={icon} size={20} color={c.accent} />
      </View>
      <T variant="bodyMedium">{label}</T>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: space.xl, alignItems: 'center' },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  quick: { width: '47.8%', flexGrow: 1, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  quickIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
