import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { DateChip } from '@/components/DatePicker';
import { Field, Sheet } from '@/components/ui/form';
import { ListRow, Loading, Screen, TabHeader } from '@/components/ui/layout';
import { Badge, Button, Card, Chip, Divider, IconButton, PressableScale, Row, SectionHeader, T } from '@/components/ui/primitives';
import { activityLabel, listActivities } from '@/data/activities';
import { getAttendance, getAttendanceStats, markAttendance, removeAttendance } from '@/data/attendance';
import { exercisesForWeekday, getRoutine, getRoutineForWeekday, listRoutines, saveRoutine } from '@/data/routines';
import { getActiveSession, listSessions, listTrainedExercises, startSession } from '@/data/workouts';
import { DAY_SHORT, formatDuration, formatMinutes, formatShort, todayKey, weekday, WEEK_ORDER } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { useMutation, useQuery } from '@/state/db';
import { playReward } from '@/lib/sound';
import { haptic } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * One clear path: today's workout first (one big button), then the quick "it happened"
 * actions, your routines, and everything you did (all of it editable).
 */
export default function TrainScreen() {
  const c = useColors();
  const run = useMutation();
  const today = todayKey();
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [pastOpen, setPastOpen] = useState(false);

  const { data } = useQuery(async (db) => {
    const [routines, active, stats, attendance, sessions, trained, todayRoutine, activities] = await Promise.all([
      listRoutines(db),
      getActiveSession(db),
      getAttendanceStats(db, today),
      getAttendance(db, today),
      listSessions(db, null, today),
      listTrainedExercises(db),
      getRoutineForWeekday(db, weekday(today)),
      listActivities(db, undefined, today, 6),
    ]);
    const full = todayRoutine ? await getRoutine(db, todayRoutine.id) : null;
    const todayExercises = full ? exercisesForWeekday(full.exercises, weekday(today)) : [];
    // Workouts and other activities together, newest first.
    const history = [
      ...sessions.slice(0, 8).map((s) => ({ kind: 'session' as const, date: s.date, key: s.id, item: s })),
      ...activities.map((a) => ({ kind: 'activity' as const, date: a.date, key: a.id, item: a })),
    ]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 6);
    return { routines, active, stats, attendance, trained: trained.slice(0, 5), todayRoutine, todayExercises, history };
  }, [today]);

  if (!data) return <Screen tab><Loading /></Screen>;

  const start = async (routineId: string | null, date = today) => {
    const id = await run((db) => startSession(db, date, routineId));
    if (id) router.push('/sesion/activa');
  };
  const createRoutine = async () => {
    const id = await run((db) => saveRoutine(db, { name: newName }));
    if (id) {
      setNewOpen(false);
      setNewName('');
      router.push({ pathname: '/rutina/[id]', params: { id } });
    }
  };
  const isTrainingDay = data.stats.scheduledDays.includes(weekday(today));

  return (
    <Screen tab>
      <TabHeader title="Entrenar" subtitle={`Hoy · ${DAY_SHORT[weekday(today)]}`} right={<IconButton icon="book-open" label="Guía de ejercicios" onPress={() => router.push('/ejercicios/explorar')} />} />

      {data.active ? (
        <Animated.View entering={FadeInDown.duration(260)}>
          <Card tone="accent" onPress={() => router.push('/sesion/activa')} style={{ marginBottom: space.lg }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T variant="overline" tone="accent">En curso</T>
                <T variant="h2" style={{ marginTop: 4 }}>{data.active.routineName ?? 'Entrenamiento libre'}</T>
                <T variant="caption" tone="muted">Empezó hace {formatMinutes((Date.now() - new Date(data.active.startedAt).getTime()) / 1000)}</T>
              </View>
              <Button label="Seguir" icon="play" onPress={() => router.push('/sesion/activa')} />
            </Row>
          </Card>
        </Animated.View>
      ) : null}

      {/* 1. Today */}
      {!data.active ? (
        <Card style={{ padding: space.xl }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="overline" tone="dim">{data.todayRoutine ? 'Te toca' : isTrainingDay ? 'Día de gym' : 'Hoy'}</T>
            {data.attendance ? <Badge label="Hoy fuiste ✓" /> : null}
          </Row>
          {data.todayRoutine && data.todayExercises.length ? (
            <>
              <T variant="title" style={{ marginTop: space.sm }}>{data.todayRoutine.name}</T>
              <T variant="label" tone="muted" style={{ marginTop: 2 }}>
                {data.todayExercises.length} ejercicios · {data.todayExercises.reduce((n, e) => n + e.sets, 0)} series
              </T>
              <View style={styles.preview}>
                {data.todayExercises.slice(0, 5).map((e) => (
                  <Row key={e.id} gap={space.sm}>
                    <View style={[styles.dot, { backgroundColor: c.accent }]} />
                    <T variant="label" style={{ flex: 1 }} numberOfLines={1}>{e.name}</T>
                    <T variant="caption" tone="dim">{e.sets}×</T>
                  </Row>
                ))}
                {data.todayExercises.length > 5 ? <T variant="caption" tone="dim">y {data.todayExercises.length - 5} más</T> : null}
              </View>
              <Button label="Empezar" icon="play" size="lg" style={{ marginTop: space.lg }} onPress={() => start(data.todayRoutine!.id)} />
              <Button label="Ver o editar la rutina" variant="ghost" size="sm" onPress={() => router.push({ pathname: '/rutina/[id]', params: { id: data.todayRoutine!.id } })} />
            </>
          ) : data.routines.length ? (
            <>
              <T variant="title" style={{ marginTop: space.sm }}>{isTrainingDay ? '¿Qué entrenás hoy?' : 'Hoy es descanso'}</T>
              <T variant="label" tone="muted" style={{ marginTop: 2 }}>
                {isTrainingDay ? 'Elegí una rutina para empezar.' : 'Si igual vas, elegí una rutina.'}
              </T>
              <Row style={{ flexWrap: 'wrap', marginTop: space.md }} gap={6}>
                {data.routines.map((r) => (
                  <Chip key={r.id} label={r.name} onPress={() => start(r.id)} />
                ))}
              </Row>
            </>
          ) : (
            <>
              <T variant="title" style={{ marginTop: space.sm }}>Armá tu primera rutina</T>
              <T variant="label" tone="muted" style={{ marginTop: 2 }}>Elegí ejercicios de la guía con fotos y asignalos a tus días de gym.</T>
              <Button label="Crear rutina" icon="plus" size="lg" style={{ marginTop: space.lg }} onPress={() => setNewOpen(true)} />
            </>
          )}
        </Card>
      ) : null}

      {/* 2. Quick: it happened */}
      <View style={styles.tiles}>
        <Tile
          icon={data.attendance ? 'check-circle' : 'check-circle-outline'}
          label={data.attendance ? 'Fuiste' : 'Ya fui'}
          active={!!data.attendance}
          onPress={() => {
            if (!data.attendance) {
              haptic('success');
              void playReward();
            }
            void run((db) => (data.attendance ? removeAttendance(db, today) : markAttendance(db, today)), {
              success: data.attendance ? 'Listo, lo desmarqué' : '¡Bien ahí! Hoy cuenta como día de gym',
            });
          }}
        />
        <Tile icon="lightning-bolt-outline" label="Entreno libre" onPress={() => start(null)} disabled={!!data.active} />
        <Tile icon="walk" label="Caminata o bici" onPress={() => router.push('/actividad/nueva')} />
      </View>

      {/* 3. Streak */}
      <Card onPress={() => router.push('/asistencia')} style={{ marginTop: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Stat label="Racha" value={String(data.stats.currentStreak)} icon />
          <Stat label="Semana" value={data.stats.scheduledDays.length ? `${data.stats.thisWeek}/${data.stats.scheduledDays.length}` : String(data.stats.thisWeek)} />
          <Stat label="Mes" value={String(data.stats.thisMonth)} />
          <Stat label="Total" value={String(data.stats.total)} />
          <MaterialCommunityIcons name="chevron-right" size={18} color={c.textDim} />
        </Row>
      </Card>

      {/* 4. Routines */}
      <View style={{ marginTop: space.xl }}>
        <SectionHeader title="Mis rutinas" action="Nueva" onAction={() => setNewOpen(true)} />
        {data.routines.length === 0 ? (
          <Card>
            <T variant="label" tone="muted">Todavía no tenés rutinas. Tocá “Nueva” para crear una.</T>
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            {data.routines.map((r) => (
              <Card key={r.id} onPress={() => router.push({ pathname: '/rutina/[id]', params: { id: r.id } })} style={{ paddingVertical: space.md }}>
                <Row gap={space.md}>
                  <View style={{ flex: 1 }}>
                    <T variant="h3" numberOfLines={1}>{r.name}</T>
                    <T variant="caption" tone="dim">{r.exerciseCount} ejercicios · {r.totalSets} series</T>
                    <Row gap={4} style={{ marginTop: 6, flexWrap: 'wrap' }}>
                      {WEEK_ORDER.map((d) => (
                        <View key={d} style={[styles.day, { backgroundColor: r.weekdays.includes(d) ? c.accentSoft : 'transparent' }]}>
                          <T variant="caption" tone={r.weekdays.includes(d) ? 'accent' : 'dim'} style={{ fontSize: 10 }}>{DAY_SHORT[d].slice(0, 2)}</T>
                        </View>
                      ))}
                    </Row>
                  </View>
                  {!data.active ? <IconButton icon="play" label={`Empezar ${r.name}`} tone="accent" onPress={() => start(r.id)} /> : null}
                </Row>
              </Card>
            ))}
          </View>
        )}
      </View>

      {/* 5. History */}
      <View style={{ marginTop: space.xl }}>
        <SectionHeader title="Lo que hiciste" action="Cargar uno pasado" onAction={() => setPastOpen(true)} />
        {data.history.length === 0 ? (
          <Card>
            <T variant="label" tone="muted">Tus entrenamientos y actividades aparecen acá. Tocá cualquiera para corregirlo.</T>
          </Card>
        ) : (
          <Card padded={false} style={{ paddingVertical: space.xs }}>
            {data.history.map((h, i) => (
              <View key={h.key}>
                {i > 0 ? <Divider style={{ marginHorizontal: space.lg }} /> : null}
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
      </View>

      {/* 6. Progress + guide */}
      {data.trained.length > 0 ? (
        <View style={{ marginTop: space.xl }}>
          <SectionHeader title="Tu progreso" />
          <Card padded={false} style={{ paddingVertical: space.xs }}>
            {data.trained.map((e, i) => (
              <View key={e.exerciseId}>
                {i > 0 ? <Divider style={{ marginHorizontal: space.lg }} /> : null}
                <ListRow
                  icon="trending-up"
                  iconTone="protein"
                  title={e.name}
                  subtitle={`${e.sessions} ${e.sessions === 1 ? 'sesión' : 'sesiones'}${e.muscleGroup ? ' · ' + e.muscleGroup : ''}`}
                  onPress={() => router.push({ pathname: '/ejercicio-progreso/[id]', params: { id: e.exerciseId } })}
                />
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <Card tone="accent" onPress={() => router.push('/ejercicios/explorar')} style={{ marginTop: space.xl }}>
        <Row gap={space.md}>
          <Feather name="image" size={22} color={c.accent} />
          <View style={{ flex: 1 }}>
            <T variant="bodyMedium">Guía de ejercicios con fotos</T>
            <T variant="caption" tone="muted">¿No sabés qué hacer o cómo? Más de 800 ejercicios</T>
          </View>
          <Feather name="chevron-right" size={18} color={c.textDim} />
        </Row>
      </Card>
      <Button label="Mi biblioteca de ejercicios" icon="book" variant="ghost" size="sm" style={{ marginTop: space.sm }} onPress={() => router.push('/ejercicios')} />

      <Sheet visible={newOpen} onClose={() => setNewOpen(false)} title="Nueva rutina">
        <View style={{ gap: space.lg }}>
          <Field label="Nombre" value={newName} onChangeText={setNewName} placeholder="Ej.: Piernas, Pecho y tríceps, Full body" autoFocus onSubmitEditing={createRoutine} />
          <Button label="Crear y agregar ejercicios" icon="arrow-right" onPress={createRoutine} disabled={!newName.trim()} />
        </View>
      </Sheet>

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

/** Square, icon-first tiles: same size, label never cut. */
function Tile({ icon, label, onPress, active, disabled }: { icon: IconName; label: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  const c = useColors();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      hapticFeedback
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.tile, { backgroundColor: active ? c.accent : c.surface, opacity: disabled ? 0.45 : 1 }]}
    >
      <MaterialCommunityIcons name={icon} size={26} color={active ? c.accentText : c.accent} />
      <T variant="label" color={active ? c.accentText : c.text} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2} style={{ fontWeight: '600' }}>
        {label}
      </T>
    </PressableScale>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Row gap={2}>
        {icon ? <MaterialCommunityIcons name="fire" size={16} color={Number(value) > 0 ? c.weight : c.textDim} /> : null}
        <T variant="number">{value}</T>
      </Row>
      <T variant="caption" tone="dim">{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { marginTop: space.md, gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  tiles: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  tile: { flex: 1, minHeight: 86, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  day: { width: 24, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
