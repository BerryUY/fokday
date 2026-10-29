import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSyncState } from '@/backup/service';
import { FokDayMark } from '@/components/brand/FokDayMark';
import { WeekStrip } from '@/components/calendar';
import { ExtraTotals } from '@/components/ExtraTotals';
import { HabitsCard } from '@/components/HabitsCard';
import { StreakBanner, StreakChip } from '@/components/streak';
import { TodoCard } from '@/components/TodoCard';
import { WeeklySummaryCard } from '@/components/WeeklySummaryCard';
import { usePro } from '@/billing/pro';
import { NutritionRings } from '@/components/nutrition';
import { Loading, Screen } from '@/components/ui/layout';
import { Badge, Button, Card, IconButton, PressableScale, Row, T } from '@/components/ui/primitives';
import { WeightGoalCard } from '@/components/weight';
import { getAttendanceStats, listAttendance } from '@/data/attendance';
import { getDailyTotals } from '@/data/meals';
import { getRoutineForWeekday } from '@/data/routines';
import { getGoalForDate, getProfile } from '@/data/settings';
import { getStreak } from '@/data/streak';
import { listWeights } from '@/data/weight';
import { getActiveSession, startSession } from '@/data/workouts';
import { latestEntry, weightProgress } from '@/domain/weight';
import { capitalize, formatLong, greeting, startOfWeek, todayKey, weekday } from '@/lib/dates';
import { useMutation, useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';

/**
 * What matters first: today's calories and protein (with the photo button right there), then
 * the weight goal, habits and tasks, and the training of the day. The streak sits in the header.
 */
export default function HomeScreen() {
  const c = useColors();
  const pro = usePro();
  const sync = useSyncState();
  const run = useMutation();
  const today = todayKey();
  const { data } = useQuery(async (db) => {
    const [profile, weights, totals, goal, stats, routine, active, week, streak] = await Promise.all([
      getProfile(db),
      listWeights(db),
      getDailyTotals(db, today),
      getGoalForDate(db, today),
      getAttendanceStats(db, today),
      getRoutineForWeekday(db, weekday(today)),
      getActiveSession(db),
      listAttendance(db, startOfWeek(today), today),
      getStreak(db, today),
    ]);
    return { profile, weights, totals, goal, stats, routine, active, week, streak };
  }, [today]);

  if (!data) return <Screen tab><Loading /></Screen>;

  const { profile, weights, totals, goal, stats, routine, active, week, streak } = data;
  const progress = weightProgress(profile.startWeight, profile.targetWeight, weights);
  const last = latestEntry(weights);
  const attendedSet = new Set(week.map((a) => a.date));
  const trainedToday = attendedSet.has(today);
  const isTrainingDay = stats.scheduledDays.includes(weekday(today));
  const enter = (i: number) => FadeInDown.delay(40 * i).duration(320);

  return (
    <Screen tab>
      <Row style={styles.brand}>
        <Row gap={8} style={{ flex: 1 }}>
          <FokDayMark size={30} glow={false} />
          <T style={styles.wordmark}>FokDay</T>
        </Row>
        {sync.info?.pendingChanges && sync.configured ? (
          <View style={[styles.syncDot, { backgroundColor: sync.running ? c.protein : c.warning }]} />
        ) : null}
        <StreakChip streak={streak} />
        <IconButton icon="settings" label="Ajustes" onPress={() => router.push('/ajustes')} />
      </Row>

      <View style={styles.header}>
        <T variant="label" tone="dim">{capitalize(formatLong(today))}</T>
        <T variant="title" style={{ marginTop: 2 }}>{greeting()}{profile.name ? `, ${profile.name}` : ''}</T>
      </View>

      {!streak.doneToday ? (
        <Animated.View entering={enter(0)} style={{ marginBottom: space.lg }}>
          <StreakBanner streak={streak} />
        </Animated.View>
      ) : null}

      {/* 1. Calories and protein, with the photo right there */}
      <Animated.View entering={enter(1)}>
        <Card style={{ paddingVertical: space.xl }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
            <T variant="h2">Nutrición de hoy</T>
            <T variant="caption" tone="dim">{totals.entries === 0 ? 'Nada registrado aún' : `${totals.entries} ${totals.entries === 1 ? 'registro' : 'registros'}`}</T>
          </Row>
          <PressableScale onPress={() => router.push('/comidas')} accessibilityRole="button" accessibilityLabel="Ver comidas de hoy">
            <NutritionRings calories={totals.calories} protein={totals.protein} calorieTarget={goal.calories} proteinTarget={goal.protein} />
          </PressableScale>
          <ExtraTotals extras={totals.extras} />
          <PressableScale
            onPress={() => router.push({ pathname: '/comida/foto', params: { date: today } })}
            hapticFeedback
            accessibilityRole="button"
            accessibilityLabel="Foto con IA"
            style={[styles.photo, { backgroundColor: c.accent }]}
          >
            <View style={[styles.photoIcon, { backgroundColor: 'rgba(0,0,0,0.12)' }]}>
              <Feather name="camera" size={22} color={c.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="h3" color={c.accentText}>Foto con IA</T>
              <T variant="caption" color={c.accentText} style={{ opacity: 0.75 }}>Sacale una foto al plato y listo</T>
            </View>
            <Feather name="arrow-right" size={20} color={c.accentText} />
          </PressableScale>
          <Button label="Registrar de otra forma" icon="plus" variant="ghost" size="sm" style={{ marginTop: space.xs }} onPress={() => router.push('/comidas')} />
        </Card>
      </Animated.View>

      {/* 2. Weight goal */}
      <Animated.View entering={enter(2)} style={{ marginTop: space.lg }}>
        <WeightGoalCard tone="outline" progress={progress} lastDate={last?.date ?? null} onPress={() => router.push('/peso')} onLog={() => router.push('/peso/registrar')} />
      </Animated.View>

      {/* 3. Habits and tasks */}
      <Animated.View entering={enter(3)} style={{ marginTop: space.lg }}>
        <HabitsCard date={today} />
      </Animated.View>
      <Animated.View entering={enter(4)} style={{ marginTop: space.lg }}>
        <TodoCard date={today} />
      </Animated.View>

      {/* 4. Training of the day */}
      <Animated.View entering={enter(5)} style={{ marginTop: space.lg }}>
        <Card tone="alt">
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
                label={trainedToday ? 'Entrenar de nuevo' : routine ? 'Iniciar entrenamiento' : 'Ver mis rutinas'}
                icon="play"
                variant={trainedToday || !routine ? 'secondary' : 'primary'}
                onPress={async () => {
                  if (!routine) return router.push('/entrenar');
                  const id = await run((db) => startSession(db, today, routine.id));
                  if (id) router.push('/sesion/activa');
                }}
              />
            )}
          </View>
          <View style={{ marginTop: space.lg }}>
            <WeekStrip attended={attendedSet} planned={stats.scheduledDays} today={today} />
          </View>
        </Card>
      </Animated.View>

      {pro ? (
        <Animated.View entering={enter(6)} style={{ marginTop: space.lg }}>
          <WeeklySummaryCard />
        </Animated.View>
      ) : null}

      <Row gap={space.sm} style={{ marginTop: space.lg }}>
        <QuickLink icon="scale-bathroom" label="Registrar peso" onPress={() => router.push('/peso/registrar')} />
        <QuickLink icon="barcode-scan" label="Escanear" onPress={() => router.push({ pathname: '/comida/escanear', params: { date: today } })} />
      </Row>
    </Screen>
  );
}

function QuickLink({ icon, label, onPress }: { icon: 'scale-bathroom' | 'barcode-scan'; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <PressableScale onPress={onPress} style={[styles.quick, { borderColor: c.border }]} accessibilityRole="button" accessibilityLabel={label}>
      <MaterialCommunityIcons name={icon} size={20} color={c.accent} />
      <T variant="bodyMedium">{label}</T>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginBottom: space.lg },
  wordmark: { fontFamily: font.bold, fontSize: 22, letterSpacing: -0.6 },
  header: { marginBottom: space.lg },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  photo: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, padding: space.md, paddingRight: space.lg, marginTop: space.xl },
  photoIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.lg, borderWidth: 1, paddingVertical: space.md, paddingHorizontal: space.lg },
});
