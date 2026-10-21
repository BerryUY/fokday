import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MonthCalendar, YearHeatmap } from '@/components/calendar';
import { Sheet } from '@/components/ui/form';
import { Loading, Screen } from '@/components/ui/layout';
import { Badge, Button, Card, Chip, Row, SectionHeader, T } from '@/components/ui/primitives';
import { getAttendanceStats, listAttendance, markAttendance, removeAttendance } from '@/data/attendance';
import { listSessions } from '@/data/workouts';
import { isScheduled } from '@/domain/attendance';
import { capitalize, DAY_SHORT, endOfMonth, formatLong, startOfMonth, todayKey, WEEK_ORDER, type DateKey } from '@/lib/dates';
import { formatPercent } from '@/lib/format';
import { useMutation, useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export default function AttendanceScreen() {
  const c = useColors();
  const run = useMutation();
  const today = todayKey();
  const [month, setMonth] = useState(today);
  const [selected, setSelected] = useState<DateKey | null>(null);

  const { data } = useQuery(async (db) => {
    const [stats, all, monthSessions] = await Promise.all([
      getAttendanceStats(db, today),
      listAttendance(db),
      listSessions(db, startOfMonth(month), endOfMonth(month)),
    ]);
    return { stats, all, monthSessions };
  }, [today, month]);

  if (!data) return <Screen title="Asistencia"><Loading /></Screen>;
  const attended = new Set(data.all.map((a) => a.date));
  const { stats } = data;
  const sel = selected ? data.all.find((a) => a.date === selected) ?? null : null;
  const selSessions = selected ? data.monthSessions.filter((s) => s.date === selected) : [];

  return (
    <Screen title="Asistencia al gym">
      <View style={styles.grid}>
        <Tile label="Esta semana" value={String(stats.thisWeek)} suffix={stats.scheduledDays.length ? `/ ${stats.scheduledDays.length}` : undefined} />
        <Tile label="Este mes" value={String(stats.thisMonth)} />
        <Tile label="Racha actual" value={String(stats.currentStreak)} icon />
        <Tile label="Mejor racha" value={String(stats.longestStreak)} />
        <Tile label="Constancia" value={stats.consistency !== null ? formatPercent(stats.consistency) : '—'} />
        <Tile label="Total" value={String(stats.total)} />
      </View>
      <Card tone="alt" style={{ marginTop: space.md }}>
        <T variant="caption" tone="muted">
          {stats.scheduledDays.length
            ? `Tus días de gym: ${WEEK_ORDER.filter((d) => stats.scheduledDays.includes(d)).map((d) => DAY_SHORT[d]).join(', ')}. Los días de descanso no cortan la racha; solo un día de gym sin ir. Ir un día extra suma.`
            : 'No configuraste días de gym, así que la racha cuenta días seguidos. Configuralos en Ajustes para que los descansos no la corten.'}
        </T>
        {!stats.scheduledDays.length ? <Button label="Configurar días" size="sm" variant="secondary" style={{ marginTop: space.md, alignSelf: 'flex-start' }} onPress={() => router.push('/ajustes')} /> : null}
      </Card>

      <Card style={{ marginTop: space.lg }}>
        <MonthCalendar
          month={month}
          onChangeMonth={setMonth}
          selected={selected}
          onSelect={setSelected}
          maxDate={today}
          marks={(d) => ({ filled: attended.has(d), planned: isScheduled(d, stats.scheduledDays) && d >= today })}
        />
        <Row gap={space.lg} style={{ marginTop: space.md, justifyContent: 'center' }}>
          <Legend color={c.accent} label="Fuiste" />
          <Legend dashed label="Día de gym planificado" />
        </Row>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <SectionHeader title="Último año" />
        <Card>
          <YearHeatmap attended={attended} today={today} />
        </Card>
      </View>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected ? capitalize(formatLong(selected)) : ''}>
        {selected ? (
          <View style={{ gap: space.md }}>
            <Row gap={space.sm}>
              {sel ? <Badge label={sel.source === 'workout' ? 'Entrenamiento registrado' : 'Marcado a mano'} /> : <Badge label="Sin asistencia" tone="muted" />}
              {isScheduled(selected, stats.scheduledDays) ? <Badge label="Día de gym" tone="protein" /> : <Badge label="Descanso" tone="muted" />}
            </Row>
            {selSessions.map((s) => (
              <Chip key={s.id} label={`${s.routineName ?? 'Entrenamiento libre'} · ${s.setCount} series`} icon="activity" onPress={() => {
                setSelected(null);
                router.push({ pathname: '/sesion/[id]', params: { id: s.id } });
              }} />
            ))}
            {sel ? (
              <Button
                label="Desmarcar este día"
                icon="x"
                variant="danger"
                onPress={async () => {
                  await run((db) => removeAttendance(db, selected), { success: 'Listo, lo desmarqué' });
                  setSelected(null);
                }}
              />
            ) : (
              <Button
                label="Ese día fui"
                icon="check"
                onPress={async () => {
                  await run((db) => markAttendance(db, selected), { success: '¡Bien ahí! Día marcado' });
                  setSelected(null);
                }}
              />
            )}
            <Button label="Ver el día completo" variant="secondary" onPress={() => {
              const d = selected;
              setSelected(null);
              router.push({ pathname: '/dia/[date]', params: { date: d } });
            }} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function Tile({ label, value, suffix, icon }: { label: string; value: string; suffix?: string; icon?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.tile, { backgroundColor: c.surface }]}>
      <Row gap={4}>
        {icon ? <MaterialCommunityIcons name="fire" size={18} color={Number(value) > 0 ? c.weight : c.textDim} /> : null}
        <T variant="number">{value}</T>
        {suffix ? <T variant="label" tone="dim">{suffix}</T> : null}
      </Row>
      <T variant="caption" tone="dim" style={{ marginTop: 2 }}>{label}</T>
    </View>
  );
}

function Legend({ color, dashed, label }: { color?: string; dashed?: boolean; label: string }) {
  const c = useColors();
  return (
    <Row gap={6}>
      <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: color, borderWidth: dashed ? 1.5 : 0, borderStyle: 'dashed', borderColor: c.textDim }} />
      <T variant="caption" tone="dim">{label}</T>
    </Row>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '31.5%', flexGrow: 1, borderRadius: radius.md, padding: space.md },
});
