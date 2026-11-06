import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSyncState } from '@/backup/service';
import { FokDayMark } from '@/components/brand/FokDayMark';
import { WeekStrip } from '@/components/calendar';
import { ExtraTotals } from '@/components/ExtraTotals';
import { HabitsCard } from '@/components/HabitsCard';
import { RoutinePicker } from '@/components/RoutinePicker';
import { useCancelWorkout } from '@/components/useCancelWorkout';
import { StreakChip } from '@/components/streak';
import { TodayCard } from '@/components/TodayCard';
import { TodoCard } from '@/components/TodoCard';
import { TourCard } from '@/components/TourCard';
import { ProTeaser } from '@/components/ProTeaser';
import { WeeklySummaryCard } from '@/components/WeeklySummaryCard';
import { usePlan, usePro } from '@/billing/pro';
import { left } from '@/components/QuotaCard';
import { NutritionRings } from '@/components/nutrition';
import { Loading, Screen } from '@/components/ui/layout';
import { Reveal } from '@/components/ui/Reveal';
import { Badge, Button, Card, IconButton, PressableScale, Row, T } from '@/components/ui/primitives';
import { WeightGoalCard } from '@/components/weight';
import { getAttendanceStats, listAttendance } from '@/data/attendance';
import { getDailyTotals } from '@/data/meals';
import { getHabits } from '@/data/habits';
import { getRoutineForWeekday, listRoutines, type RoutineSummary } from '@/data/routines';
import { getGoalForDate, getProfile } from '@/data/settings';
import { getStreak } from '@/data/streak';
import { listWeights } from '@/data/weight';
import { getActiveSession, startSession } from '@/data/workouts';
import { latestEntry, weightProgress } from '@/domain/weight';
import { capitalize, formatLong, greeting, startOfWeek, todayKey, weekday } from '@/lib/dates';
import { openWorkout } from '@/lib/nav';
import { goToTab } from '@/lib/tabs';
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
  const outOfPhotos = left(usePlan().ai) === 0;
  const sync = useSyncState();
  const run = useMutation();
  const cancelWorkout = useCancelWorkout();
  const today = todayKey();
  const [picking, setPicking] = useState(false);
  const { data } = useQuery(async (db) => {
    const [profile, weights, totals, goal, stats, routine, active, week, streak, routines, habits] = await Promise.all([
      getProfile(db),
      listWeights(db),
      getDailyTotals(db, today),
      getGoalForDate(db, today),
      getAttendanceStats(db, today),
      getRoutineForWeekday(db, weekday(today)),
      getActiveSession(db),
      listAttendance(db, startOfWeek(today), today),
      getStreak(db, today),
      listRoutines(db),
      getHabits(db, today),
    ]);
    return { profile, weights, totals, goal, stats, routine, active, week, streak, routines, habits };
  }, [today]);

  if (!data) return <Screen tab><Loading variant="home" /></Screen>;

  const { profile, weights, totals, goal, stats, routine, active, week, streak, routines, habits } = data;
  const progress = weightProgress(profile.startWeight, profile.targetWeight, weights);
  const last = latestEntry(weights);
  const attendedSet = new Set(week.map((a) => a.date));
  const trainedToday = attendedSet.has(today);
  const isTrainingDay = stats.scheduledDays.includes(weekday(today));

  const start = async (routineId: string, onWeekday: number | null = weekday(today)) => {
    const id = await run((db) => startSession(db, today, routineId, onWeekday));
    if (id) openWorkout();
  };
  const startPicked = (r: RoutineSummary) => start(r.id, r.weekdays.includes(weekday(today)) ? weekday(today) : r.weekdays[0] ?? null);
  // Always ends somewhere: a running workout, today's routine, the list of routines, or making the first one.
  const train = () => {
    if (active) return openWorkout();
    if (routine && !trainedToday) return void start(routine.id);
    if (routines.length) return setPicking(true);
    router.push('/rutina/nueva');
  };

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

      <TourCard />

      <Reveal style={{ marginBottom: space.lg }}>
        <TodayCard
          today={today}
          longest={streak.longest}
          onTrain={train}
          state={{
            name: profile.name,
            hour: new Date().getHours(),
            meals: totals.entries,
            protein: totals.protein,
            proteinTarget: goal.protein,
            routineName: routine?.name ?? null,
            trainingDay: isTrainingDay,
            trained: trainedToday,
            waterMl: habits.waterMl,
            waterGoalMl: profile.waterGoalMl,
            tracksWater: profile.features.includes('water'),
            creatine: habits.creatine,
            tracksCreatine: profile.features.includes('creatine'),
            streak: streak.current,
            streakDoneToday: streak.doneToday,
          }}
        />
      </Reveal>

      {/* 1. Calories and protein, with the photo right there */}
      <Reveal index={1}>
        <Card style={{ paddingVertical: space.xl }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
            <T variant="h2">Nutrición de hoy</T>
            <T variant="caption" tone="dim">{totals.entries === 0 ? 'Nada registrado aún' : `${totals.entries} ${totals.entries === 1 ? 'registro' : 'registros'}`}</T>
          </Row>
          <PressableScale onPress={() => goToTab('comidas')} accessibilityRole="button" accessibilityLabel="Ver comidas de hoy">
            <NutritionRings calories={totals.calories} protein={totals.protein} calorieTarget={goal.calories} proteinTarget={goal.protein} />
          </PressableScale>
          <ExtraTotals extras={totals.extras} calories={goal.calories} protein={goal.protein} />
          <PressableScale
            onPress={() => router.push({ pathname: '/comida/foto', params: { date: today } })}
            hapticFeedback
            accessibilityRole="button"
            accessibilityLabel={outOfPhotos ? 'Foto con IA, sin fotos por hoy' : 'Foto con IA'}
            style={[styles.photo, { backgroundColor: outOfPhotos ? c.surfaceAlt : c.accent }]}
          >
            <View style={[styles.photoIcon, { backgroundColor: outOfPhotos ? c.surface : 'rgba(0,0,0,0.12)' }]}>
              <Feather name={outOfPhotos ? 'lock' : 'camera'} size={22} color={outOfPhotos ? c.textMuted : c.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="h3" color={outOfPhotos ? c.text : c.accentText}>Foto con IA</T>
              <T variant="caption" color={outOfPhotos ? c.textMuted : c.accentText} style={{ opacity: outOfPhotos ? 1 : 0.75 }}>
                {outOfPhotos ? 'Sin fotos por hoy · ganá otra con un video' : 'Sacale una foto al plato y listo'}
              </T>
            </View>
            <Feather name="arrow-right" size={20} color={outOfPhotos ? c.textDim : c.accentText} />
          </PressableScale>
        </Card>
      </Reveal>

      {/* 2. Weight goal */}
      <Reveal index={2} style={{ marginTop: space.lg }}>
        <WeightGoalCard tone="outline" progress={progress} lastDate={last?.date ?? null} onPress={() => router.push('/peso')} onLog={() => router.push('/peso/registrar')} />
      </Reveal>

      {/* 3. Habits and tasks */}
      <Reveal index={3} style={{ marginTop: space.lg }}>
        <HabitsCard date={today} />
      </Reveal>
      <Reveal index={4} style={{ marginTop: space.lg }}>
        <TodoCard date={today} />
      </Reveal>

      {/* 4. Training of the day */}
      <Reveal index={5} style={{ marginTop: space.lg }}>
        <Card tone="alt">
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="overline" tone="dim">Entrenamiento de hoy</T>
            {trainedToday ? <Badge label="Entrenaste hoy" /> : isTrainingDay ? <Badge label="Día de gym" tone="protein" /> : <Badge label="Descanso" tone="muted" />}
          </Row>
          <T variant="title" style={{ marginTop: space.sm }}>
            {active ? active.routineName ?? 'Entrenamiento' : routine ? routine.name : isTrainingDay ? 'Elegí qué entrenar' : 'Día de descanso'}
          </T>
          <T variant="label" tone="muted" style={{ marginTop: 2 }}>
            {active
              ? 'Tenés un entrenamiento en curso.'
              : routine
                ? `${routine.exerciseCount} ejercicios · ${routine.totalSets} series`
                : isTrainingDay
                  ? 'Hoy no tiene una rutina asignada.'
                  : 'Descansar también es parte del progreso.'}
          </T>
          <Button
            label={active ? 'Seguir entrenando' : trainedToday ? 'Entrenar de nuevo' : routine ? 'Empezar' : !routines.length ? 'Elegir mi plan' : isTrainingDay ? 'Elegir rutina' : 'Entrenar igual'}
            icon="play"
            size="xl"
            style={{ marginTop: space.lg }}
            onPress={train}
          />
          {active ? <Button label="Cancelar entrenamiento" variant="ghost" size="sm" style={{ marginTop: space.xs }} onPress={() => void cancelWorkout(active.id)} /> : null}
          <View style={{ marginTop: space.lg }}>
            <WeekStrip attended={attendedSet} planned={stats.scheduledDays} today={today} />
          </View>
        </Card>
      </Reveal>

      <Reveal index={6} style={{ marginTop: space.lg }}>
        {pro ? <WeeklySummaryCard /> : <ProTeaser />}
      </Reveal>

      <Row gap={space.sm} style={{ marginTop: space.lg }}>
        <QuickLink icon="scale-bathroom" label="Registrar peso" onPress={() => router.push('/peso/registrar')} />
        <QuickLink icon="barcode-scan" label="Escanear" onPress={() => router.push({ pathname: '/comida/escanear', params: { date: today } })} />
      </Row>

      <RoutinePicker visible={picking} onClose={() => setPicking(false)} routines={routines} onStart={startPicked} />
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
