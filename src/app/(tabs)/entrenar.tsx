import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Field, Sheet } from '@/components/ui/form';
import { EmptyState, ListRow, Loading, Screen, TabHeader } from '@/components/ui/layout';
import { Badge, Button, Card, Divider, IconButton, Row, SectionHeader, T } from '@/components/ui/primitives';
import { getAttendance, getAttendanceStats, markAttendance, removeAttendance } from '@/data/attendance';
import { activityLabel, listActivities } from '@/data/activities';
import { getRoutineForWeekday, listExercises, listRoutines, saveRoutine } from '@/data/routines';
import { getActiveSession, listSessions, listTrainedExercises, startSession } from '@/data/workouts';
import { DAY_SHORT, formatDuration, formatMinutes, formatShort, todayKey, weekday, WEEK_ORDER } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { useMutation, useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function TrainScreen() {
  const c = useColors();
  const run = useMutation();
  const today = todayKey();
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const { data } = useQuery(async (db) => {
    const [routines, active, stats, attendance, sessions, exercises, trained, todayRoutine, activities] = await Promise.all([
      listRoutines(db),
      getActiveSession(db),
      getAttendanceStats(db, today),
      getAttendance(db, today),
      listSessions(db, null, today),
      listExercises(db),
      listTrainedExercises(db),
      getRoutineForWeekday(db, weekday(today)),
      listActivities(db, undefined, today, 5),
    ]);
    return { routines, active, stats, attendance, sessions: sessions.slice(0, 5), exerciseCount: exercises.length, trained: trained.slice(0, 6), todayRoutine, activities };
  }, [today]);

  if (!data) return <Screen tab><Loading /></Screen>;

  // Counts here are for today's weekday only (exercises tagged for other days are left out).
  const todayRoutine = data.todayRoutine;
  const start = async (routineId: string | null) => {
    const id = await run((db) => startSession(db, today, routineId));
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

  return (
    <Screen tab>
      <TabHeader title="Entrenar" subtitle="Rutinas y gimnasio" right={<IconButton icon="list" label="Ejercicios" onPress={() => router.push('/ejercicios')} />} />

      {data.active ? (
        <Animated.View entering={FadeInDown.duration(300)}>
          <Card tone="accent" onPress={() => router.push('/sesion/activa')} style={{ marginBottom: space.lg }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T variant="overline" tone="accent">En curso</T>
                <T variant="h2" style={{ marginTop: 4 }}>{data.active.routineName ?? 'Entrenamiento libre'}</T>
                <T variant="caption" tone="muted">Empezó hace {formatMinutes((Date.now() - new Date(data.active.startedAt).getTime()) / 1000)}</T>
              </View>
              <Button label="Continuar" icon="play" size="sm" onPress={() => router.push('/sesion/activa')} />
            </Row>
          </Card>
        </Animated.View>
      ) : null}

      <Card style={{ padding: space.xl }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="overline" tone="dim">Hoy · {DAY_SHORT[weekday(today)]}</T>
          {data.attendance ? <Badge label="Hoy fuiste" /> : null}
        </Row>
        <T variant="title" style={{ marginTop: space.sm }}>{todayRoutine ? todayRoutine.name : 'Sin rutina para hoy'}</T>
        <T variant="label" tone="muted" style={{ marginTop: 2 }}>
          {todayRoutine
            ? `${todayRoutine.exerciseCount} ejercicios · ${todayRoutine.totalSets} series`
            : data.routines.length
              ? 'Podés hacer un entrenamiento libre o elegir una rutina abajo.'
              : 'Creá tu primera rutina para tenerla a mano en el gym.'}
        </T>
        {!data.active ? (
          <View style={{ gap: space.sm, marginTop: space.lg }}>
            {todayRoutine ? <Button label="Iniciar entrenamiento" icon="play" size="lg" onPress={() => start(todayRoutine.id)} /> : null}
            {todayRoutine ? (
              <Button
                label="Ver o editar la rutina"
                icon="edit-2"
                variant="ghost"
                size="sm"
                onPress={() => router.push({ pathname: '/rutina/[id]', params: { id: todayRoutine.id } })}
              />
            ) : null}
            <Button label="Caminata, bici u otra actividad" icon="activity" variant="secondary" onPress={() => router.push('/actividad/nueva')} />
            <Row gap={space.sm}>
              <Button label="Entreno libre" variant="secondary" style={{ flex: 1 }} onPress={() => start(null)} />
              <Button
                label={data.attendance ? 'Desmarcar' : 'Ya fui'}
                icon={data.attendance ? 'x' : 'check'}
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() =>
                  run((db) => (data.attendance ? removeAttendance(db, today) : markAttendance(db, today)), {
                    success: data.attendance ? 'Listo, lo desmarqué' : '¡Bien ahí! Hoy cuenta como día de gym',
                  })
                }
              />
            </Row>
          </View>
        ) : null}
      </Card>

      <Card onPress={() => router.push('/asistencia')} style={{ marginTop: space.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Stat label="Semana" value={String(data.stats.thisWeek)} />
          <Stat label="Mes" value={String(data.stats.thisMonth)} />
          <Stat label="Racha" value={String(data.stats.currentStreak)} icon />
          <Stat label="Total" value={String(data.stats.total)} />
        </Row>
        <Divider style={{ marginVertical: space.md }} />
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="label" tone="muted">Calendario de asistencia</T>
          <MaterialCommunityIcons name="chevron-right" size={18} color={c.textDim} />
        </Row>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <SectionHeader title="Rutinas" action="Nueva" onAction={() => setNewOpen(true)} />
        {data.routines.length === 0 ? (
          <Card>
            <EmptyState
              icon="clipboard"
              title="Todavía no tenés rutinas"
              message="Armala con tus ejercicios, series y repeticiones, y asignala a los días que entrenás."
              action={<Button label="Crear rutina" icon="plus" onPress={() => setNewOpen(true)} />}
            />
          </Card>
        ) : (
          <Card padded={false} style={{ paddingVertical: space.xs }}>
            {data.routines.map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <Divider style={{ marginHorizontal: space.lg }} /> : null}
                <ListRow
                  icon="clipboard"
                  iconTone={r.weekdays.includes(weekday(today)) ? 'accent' : 'muted'}
                  title={r.name}
                  subtitle={`${r.exerciseCount} ejercicios · ${r.totalSets} series${r.weekdays.length ? ' · ' + WEEK_ORDER.filter((d) => r.weekdays.includes(d)).map((d) => DAY_SHORT[d]).join(', ') : ''}`}
                  onPress={() => router.push({ pathname: '/rutina/[id]', params: { id: r.id } })}
                />
              </View>
            ))}
          </Card>
        )}
      </View>

      {data.routines.length > 0 ? (
        <Card style={{ marginTop: space.lg }}>
          <T variant="overline" tone="dim" style={{ marginBottom: space.md }}>Semana</T>
          <Row style={{ justifyContent: 'space-between' }}>
            {WEEK_ORDER.map((d) => {
              const r = data.routines.find((x) => x.weekdays.includes(d));
              const isToday = d === weekday(today);
              return (
                <View key={d} style={{ alignItems: 'center', flex: 1 }}>
                  <T variant="caption" tone={isToday ? 'accent' : 'dim'}>{DAY_SHORT[d]}</T>
                  <View style={{ height: 6, width: 6, borderRadius: 3, marginVertical: 6, backgroundColor: r ? c.accent : c.track }} />
                  <T variant="caption" tone={r ? 'default' : 'dim'} numberOfLines={1} style={{ fontSize: 10 }}>{r ? r.name.slice(0, 7) : '—'}</T>
                </View>
              );
            })}
          </Row>
        </Card>
      ) : null}

      {data.activities.length > 0 ? (
        <View style={{ marginTop: space.xl }}>
          <SectionHeader title="Otras actividades" action="Registrar" onAction={() => router.push('/actividad/nueva')} />
          <Card padded={false} style={{ paddingVertical: space.xs }}>
            {data.activities.map((a, i) => (
              <View key={a.id}>
                {i > 0 ? <Divider style={{ marginHorizontal: space.lg }} /> : null}
                <ListRow
                  icon="activity"
                  iconTone="protein"
                  title={activityLabel(a.type)}
                  subtitle={`${formatShort(a.date)} · ${a.minutes} min${a.distanceKm ? ' · ' + formatNumber(a.distanceKm) + ' km' : ''}`}
                  onPress={() => router.push({ pathname: '/actividad/nueva', params: { id: a.id } })}
                />
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <View style={{ marginTop: space.xl }}>
        <SectionHeader title="Últimos entrenamientos" />
        {data.sessions.length === 0 ? (
          <Card>
            <T variant="label" tone="muted">Cuando termines un entrenamiento lo vas a ver acá, con series, pesos y duración.</T>
          </Card>
        ) : (
          <Card padded={false} style={{ paddingVertical: space.xs }}>
            {data.sessions.map((s, i) => (
              <View key={s.id}>
                {i > 0 ? <Divider style={{ marginHorizontal: space.lg }} /> : null}
                <ListRow
                  icon="check-circle"
                  iconTone="accent"
                  title={s.routineName ?? 'Entrenamiento libre'}
                  subtitle={`${formatShort(s.date)} · ${s.setCount} series · ${formatNumber(s.volume)} kg${s.durationSeconds ? ' · ' + formatDuration(s.durationSeconds) : ''}`}
                  onPress={() => router.push({ pathname: '/sesion/[id]', params: { id: s.id } })}
                />
              </View>
            ))}
          </Card>
        )}
      </View>

      {data.trained.length > 0 ? (
        <View style={{ marginTop: space.xl }}>
          <SectionHeader title="Progresión por ejercicio" />
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

      <Button
        label={`Biblioteca de ejercicios (${data.exerciseCount})`}
        icon="book"
        variant="ghost"
        style={{ marginTop: space.lg }}
        onPress={() => router.push('/ejercicios')}
      />

      <Sheet visible={newOpen} onClose={() => setNewOpen(false)} title="Nueva rutina">
        <View style={{ gap: space.lg }}>
          <Field label="Nombre" value={newName} onChangeText={setNewName} placeholder="Ej.: Empuje, Piernas, Torso A" autoFocus onSubmitEditing={createRoutine} />
          <Button label="Crear y agregar ejercicios" icon="arrow-right" onPress={createRoutine} disabled={!newName.trim()} />
        </View>
      </Sheet>
    </Screen>
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
