import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WeekStrip } from '@/components/calendar';
import { DateChip } from '@/components/DatePicker';
import { Foki } from '@/components/mascot/Foki';
import { RoutinePicker } from '@/components/RoutinePicker';
import { Sheet } from '@/components/ui/form';
import { ListRow, Loading, Screen, TabHeader } from '@/components/ui/layout';
import { Reveal } from '@/components/ui/Reveal';
import { Badge, Button, Card, Chip, Divider, IconButton, Row, Segmented, T } from '@/components/ui/primitives';
import { activityLabel, listActivities } from '@/data/activities';
import { getAttendance, getAttendanceStats, listAttendance, markAttendance, removeAttendance } from '@/data/attendance';
import { exercisesForWeekday, getRoutine, listRoutines, type RoutineSummary } from '@/data/routines';
import { getProfile } from '@/data/settings';
import { estimateMinutes, getActiveSession, listSessions, listTrainedExercises, startSession } from '@/data/workouts';
import { DAY_LONG, daysLabel, formatDuration, formatMinutes, formatShort, startOfWeek, todayKey, weekday } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { openWorkout } from '@/lib/nav';
import { playReward } from '@/lib/sound';
import { useMutation, useQuery } from '@/state/db';
import { haptic } from '@/state/toast';
import { space } from '@/theme/tokens';

type Section = 'hoy' | 'rutinas' | 'historial';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'rutinas', label: 'Rutinas' },
  { key: 'historial', label: 'Historial' },
];

/**
 * One question per section. Hoy: what do I do today (one big button). Rutinas: my plans.
 * Historial: what I already did and how I'm progressing.
 */
export default function TrainScreen() {
  const run = useMutation();
  const today = todayKey();
  const [section, setSection] = useState<Section>('hoy');
  const [picking, setPicking] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);

  const { data } = useQuery(async (db) => {
    const [routines, active, stats, attendance, week, sessions, trained, activities, profile] = await Promise.all([
      listRoutines(db),
      getActiveSession(db),
      getAttendanceStats(db, today),
      getAttendance(db, today),
      listAttendance(db, startOfWeek(today), today),
      listSessions(db, null, today),
      listTrainedExercises(db),
      listActivities(db, undefined, today, 20),
      getProfile(db),
    ]);
    const plan = planFor(routines, today);
    const full = plan ? await getRoutine(db, plan.routine.id) : null;
    const exercises = full && plan ? exercisesForWeekday(full.exercises, plan.weekday) : [];
    // Workouts and other activities together, newest first.
    const history = [
      ...sessions.slice(0, 20).map((s) => ({ kind: 'session' as const, date: s.date, key: s.id, item: s })),
      ...activities.map((a) => ({ kind: 'activity' as const, date: a.date, key: a.id, item: a })),
    ]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 20);
    return { routines, active, stats, attendance, week, trained, plan, exercises, history, rest: profile.defaultRestSeconds };
  }, [today]);

  if (!data) return <Screen tab><Loading variant="train" /></Screen>;

  const start = async (routineId: string | null, date = today, onWeekday: number | null = weekday(date)) => {
    const id = await run((db) => startSession(db, date, routineId, onWeekday));
    if (id) openWorkout();
  };
  const startPicked = (r: RoutineSummary | null) => start(r?.id ?? null, today, r ? (r.weekdays.includes(weekday(today)) ? weekday(today) : r.weekdays[0] ?? null) : null);

  return (
    <Screen tab>
      <TabHeader title="Entrenar" right={<IconButton icon="book-open" label="Guía de ejercicios" onPress={() => router.push('/ejercicios/explorar')} />} />
      <Segmented options={SECTIONS} value={section} onChange={setSection} />
      <View style={{ height: space.lg }} />

      {section === 'hoy' ? (
        <Today data={data} today={today} onStart={start} onPick={() => setPicking(true)} />
      ) : section === 'rutinas' ? (
        <Routines routines={data.routines} active={!!data.active} today={today} onStart={startPicked} />
      ) : (
        <History history={data.history} trained={data.trained} onPast={() => setPastOpen(true)} />
      )}

      <RoutinePicker visible={picking} onClose={() => setPicking(false)} routines={data.routines} onStart={startPicked} />
      <PastWorkoutSheet
        visible={pastOpen}
        onClose={() => setPastOpen(false)}
        routines={data.routines}
        onStart={async (date, routineId) => {
          setPastOpen(false);
          await start(routineId, date);
        }}
      />
    </Screen>
  );
}

type TrainData = {
  routines: RoutineSummary[];
  active: Awaited<ReturnType<typeof getActiveSession>>;
  stats: Awaited<ReturnType<typeof getAttendanceStats>>;
  attendance: Awaited<ReturnType<typeof getAttendance>>;
  week: { date: string }[];
  plan: Plan | null;
  exercises: { id: string; name: string; sets: number }[];
  rest: number;
};

function Today({ data, today, onStart, onPick }: {
  data: TrainData;
  today: string;
  onStart: (routineId: string | null, date?: string, onWeekday?: number | null) => void;
  onPick: () => void;
}) {
  const run = useMutation();
  const { plan, active, attendance, exercises } = data;
  const sets = exercises.reduce((n, e) => n + e.sets, 0);
  const goal = data.stats.scheduledDays.length;
  const done = data.week.length;

  return (
    <View style={{ gap: space.md }}>
      <Reveal>
        {active ? (
          <Card tone="accent" style={{ padding: space.xl }}>
            <Row gap={space.lg}>
              <Foki mood="strong" size={64} />
              <View style={{ flex: 1 }}>
                <T variant="overline" tone="accent">En curso</T>
                <T variant="title" style={{ marginTop: 2 }}>{active.routineName ?? 'Entrenamiento libre'}</T>
                <T variant="caption" tone="muted">Empezó hace {formatMinutes((Date.now() - new Date(active.startedAt).getTime()) / 1000)}</T>
              </View>
            </Row>
            <Button label="Seguir entrenando" icon="play" size="lg" style={{ marginTop: space.lg }} onPress={() => openWorkout()} />
          </Card>
        ) : attendance ? (
          <Card style={{ padding: space.xl, alignItems: 'center' }}>
            <Foki mood="proud" size={96} />
            <T variant="title" style={{ marginTop: space.md }}>Hoy ya entrenaste</T>
            <T variant="label" tone="muted" style={{ marginTop: 2, textAlign: 'center' }}>Bien ahí. Lo que queda es comer bien y descansar.</T>
            <Button label="Entrenar de nuevo" icon="play" variant="secondary" full style={{ marginTop: space.lg }} onPress={onPick} />
          </Card>
        ) : !plan ? (
          <Card style={{ padding: space.xl, alignItems: 'center' }}>
            <Foki mood="strong" size={110} />
            <T variant="title" style={{ marginTop: space.md, textAlign: 'center' }}>Armá tu plan en un minuto</T>
            <T variant="label" tone="muted" style={{ marginTop: 2, textAlign: 'center' }}>Elegí uno listo o creá el tuyo. Después solo tocás Empezar.</T>
            <Button label="Elegir mi plan" icon="arrow-right" size="lg" full style={{ marginTop: space.lg }} onPress={() => router.push('/rutina/nueva')} />
          </Card>
        ) : plan.when === 'today' ? (
          <Card style={{ padding: space.xl }}>
            <T variant="overline" tone="accent">Hoy te toca</T>
            <T variant="display" style={{ marginTop: 4 }}>{plan.routine.name}</T>
            <T variant="label" tone="muted" style={{ marginTop: 2 }}>
              {exercises.length} ejercicios · {sets} series · unos {estimateMinutes(sets, data.rest)} min
            </T>
            {exercises.length ? (
              <T variant="label" tone="dim" numberOfLines={2} style={{ marginTop: space.md }}>{exercises.map((e) => e.name).join(' · ')}</T>
            ) : null}
            <Button label="Empezar" icon="play" size="lg" style={{ marginTop: space.lg }} onPress={() => onStart(plan.routine.id, today, plan.weekday)} />
            <Button label="Hoy hago otra cosa" variant="ghost" size="sm" style={{ marginTop: 4 }} onPress={onPick} />
          </Card>
        ) : (
          <Card style={{ padding: space.xl, alignItems: 'center' }}>
            <Foki mood="sleepy" size={96} />
            <T variant="title" style={{ marginTop: space.md }}>Hoy descansás</T>
            <T variant="label" tone="muted" style={{ marginTop: 2, textAlign: 'center' }}>
              {plan.weekday !== null ? `Lo próximo es ${plan.routine.name}, el ${DAY_LONG[plan.weekday]}.` : 'Descansar también es parte del progreso.'}
            </T>
            <Button label="Entrenar igual" icon="play" variant="secondary" full style={{ marginTop: space.lg }} onPress={onPick} />
          </Card>
        )}
      </Reveal>

      <Reveal index={1}>
        <Card onPress={() => router.push('/asistencia')}>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
            <T variant="h3">Esta semana</T>
            <T variant="label" tone="muted">{goal ? `${done} de ${goal} días` : `${done} ${done === 1 ? 'día' : 'días'}`}</T>
          </Row>
          <WeekStrip attended={new Set(data.week.map((a) => a.date))} planned={data.stats.scheduledDays} today={today} />
        </Card>
      </Reveal>

      <Reveal index={2}>
        <T variant="label" tone="dim" style={[styles.groupTitle, { marginTop: space.sm }]}>¿Hiciste otra cosa?</T>
        <Card padded={false} style={{ paddingVertical: space.xs }}>
          <ListRow
            icon={attendance ? 'check-circle' : 'check'}
            iconTone={attendance ? 'accent' : 'muted'}
            title={attendance ? 'Fuiste al gym hoy' : 'Fui al gym'}
            subtitle={attendance ? 'Tocá para desmarcarlo' : 'Suma el día sin cargar series ni pesos'}
            chevron={false}
            onPress={() => {
              if (!attendance) {
                haptic('success');
                void playReward();
              }
              void run((db) => (attendance ? removeAttendance(db, today) : markAttendance(db, today)), { success: attendance ? 'Listo, lo desmarqué' : '¡Bien ahí! Hoy cuenta como día de gym' });
            }}
          />
          <Divider style={styles.inset} />
          <ListRow icon="activity" iconTone="protein" title="Aeróbico" subtitle="Caminar, correr, bici, natación" onPress={() => router.push('/actividad/nueva')} />
          <Divider style={styles.inset} />
          <ListRow icon="zap" iconTone="weight" title="Entrenamiento libre" subtitle="Sin rutina: sumás ejercicios sobre la marcha" onPress={() => (active ? openWorkout() : onStart(null, today, null))} />
        </Card>
      </Reveal>
    </View>
  );
}

function Routines({ routines, active, today, onStart }: { routines: RoutineSummary[]; active: boolean; today: string; onStart: (r: RoutineSummary) => void }) {
  return (
    <View style={{ gap: space.md }}>
      {routines.length ? (
        <Card padded={false} style={{ paddingVertical: space.xs }}>
          {routines.map((r, i) => (
            <View key={r.id}>
              {i > 0 ? <Divider style={styles.inset} /> : null}
              <ListRow
                title={r.name}
                subtitle={`${r.exerciseCount} ejercicios · ${r.weekdays.length ? daysLabel(r.weekdays) : 'sin día fijo'}`}
                right={r.weekdays.includes(weekday(today)) ? <Badge label="Hoy" /> : undefined}
                action={!active ? <IconButton icon="play" label={`Empezar ${r.name}`} tone="accent" size={36} onPress={() => onStart(r)} /> : undefined}
                chevron={active}
                onPress={() => router.push({ pathname: '/rutina/[id]', params: { id: r.id } })}
              />
            </View>
          ))}
        </Card>
      ) : (
        <Card style={{ alignItems: 'center', padding: space.xl }}>
          <Foki mood="happy" size={88} />
          <T variant="h3" style={{ marginTop: space.md }}>Todavía no tenés rutinas</T>
        </Card>
      )}
      <Button label="Nueva rutina" icon="plus" onPress={() => router.push('/rutina/nueva')} />

      <T variant="label" tone="dim" style={[styles.groupTitle, { marginTop: space.md }]}>Ejercicios</T>
      <Card padded={false} style={{ paddingVertical: space.xs }}>
        <ListRow icon="image" iconTone="accent" title="Guía con fotos" subtitle="Más de 800 ejercicios y cómo se hacen" onPress={() => router.push('/ejercicios/explorar')} />
        <Divider style={styles.inset} />
        <ListRow icon="book" iconTone="muted" title="Mis ejercicios" subtitle="Los que usás en tus rutinas" onPress={() => router.push('/ejercicios')} />
      </Card>
    </View>
  );
}

type HistoryItem =
  | { kind: 'session'; date: string; key: string; item: Awaited<ReturnType<typeof listSessions>>[number] }
  | { kind: 'activity'; date: string; key: string; item: Awaited<ReturnType<typeof listActivities>>[number] };

function History({ history, trained, onPast }: {
  history: HistoryItem[];
  trained: Awaited<ReturnType<typeof listTrainedExercises>>;
  onPast: () => void;
}) {
  return (
    <View style={{ gap: space.md }}>
      {history.length === 0 ? (
        <Card style={{ alignItems: 'center', padding: space.xl }}>
          <Foki mood="sleepy" size={88} />
          <T variant="h3" style={{ marginTop: space.md }}>Acá va a aparecer lo que hagas</T>
          <T variant="label" tone="muted" style={{ marginTop: 2, textAlign: 'center' }}>Cada entrenamiento se puede corregir después.</T>
        </Card>
      ) : (
        <Card padded={false} style={{ paddingVertical: space.xs }}>
          {history.map((h, i) => (
            <View key={h.key}>
              {i > 0 ? <Divider style={styles.inset} /> : null}
              {h.kind === 'session' ? (
                <ListRow
                  icon="check-circle"
                  iconTone="accent"
                  title={h.item.routineName ?? 'Entrenamiento libre'}
                  subtitle={`${formatShort(h.date)} · ${h.item.setCount} series · ${formatNumber(h.item.volume)} kg${h.item.durationSeconds ? ' · ' + formatDuration(h.item.durationSeconds) : ''}`}
                  onPress={() => router.push({ pathname: '/sesion/[id]', params: { id: h.item.id } })}
                />
              ) : (
                <ListRow
                  icon="activity"
                  iconTone="protein"
                  title={activityLabel(h.item.type)}
                  subtitle={`${formatShort(h.date)} · ${h.item.minutes} min${h.item.distanceKm ? ' · ' + formatNumber(h.item.distanceKm) + ' km' : ''}`}
                  onPress={() => router.push({ pathname: '/actividad/nueva', params: { id: h.item.id } })}
                />
              )}
            </View>
          ))}
        </Card>
      )}
      <Button label="Cargar uno que me olvidé" icon="calendar" variant="secondary" onPress={onPast} />

      {trained.length > 0 ? (
        <>
          <T variant="label" tone="dim" style={[styles.groupTitle, { marginTop: space.md }]}>Tu progreso por ejercicio</T>
          <Card padded={false} style={{ paddingVertical: space.xs }}>
            {trained.slice(0, 8).map((e, i) => (
              <View key={e.exerciseId}>
                {i > 0 ? <Divider style={styles.inset} /> : null}
                <ListRow
                  icon="trending-up"
                  iconTone="protein"
                  title={e.name}
                  subtitle={`${e.sessions} ${e.sessions === 1 ? 'vez' : 'veces'}${e.muscleGroup ? ' · ' + e.muscleGroup : ''}`}
                  onPress={() => router.push({ pathname: '/ejercicio-progreso/[id]', params: { id: e.exerciseId } })}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </View>
  );
}

type Plan = { routine: RoutineSummary; when: 'today' | 'next' | 'any'; weekday: number | null };

/** What's on: today's routine, else the next scheduled one (today is rest), else any routine without a day. */
function planFor(routines: RoutineSummary[], today: string): Plan | null {
  const wd = weekday(today);
  const todays = routines.find((r) => r.weekdays.includes(wd));
  if (todays) return { routine: todays, when: 'today', weekday: wd };
  for (let d = 1; d <= 7; d++) {
    const next = routines.find((r) => r.weekdays.includes((wd + d) % 7));
    if (next) return { routine: next, when: 'next', weekday: (wd + d) % 7 };
  }
  // No routine has a day yet: treat the first one as today's, so there is always something to start.
  return routines[0] ? { routine: routines[0], when: 'today', weekday: null } : null;
}

/** Log a workout you forgot: pick the day and the routine, then tick the sets. */
function PastWorkoutSheet({ visible, onClose, routines, onStart }: {
  visible: boolean;
  onClose: () => void;
  routines: { id: string; name: string }[];
  onStart: (date: string, routineId: string | null) => void;
}) {
  const [date, setDate] = useState(todayKey());
  const [routine, setRoutine] = useState<string | null>(null);
  return (
    <Sheet visible={visible} onClose={onClose} title="Cargar un entrenamiento pasado">
      <View style={{ gap: space.lg }}>
        <View style={{ gap: 6 }}>
          <T variant="label" tone="muted">¿Qué día fue?</T>
          <Row><DateChip value={date} onChange={setDate} /></Row>
        </View>
        <View style={{ gap: 6 }}>
          <T variant="label" tone="muted">¿Qué hiciste?</T>
          <Row style={{ flexWrap: 'wrap' }} gap={6}>
            <Chip label="Libre" selected={routine === null} onPress={() => setRoutine(null)} />
            {routines.map((r) => (
              <Chip key={r.id} label={r.name} selected={routine === r.id} onPress={() => setRoutine(r.id)} />
            ))}
          </Row>
        </View>
        <T variant="caption" tone="dim">Se abre el entrenamiento para que marques las series. Al terminar, ese día cuenta para tu racha.</T>
        <Button label="Cargar" icon="arrow-right" onPress={() => onStart(date, routine)} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  groupTitle: { marginBottom: space.sm, marginLeft: space.xs },
  inset: { marginLeft: space.lg },
});
