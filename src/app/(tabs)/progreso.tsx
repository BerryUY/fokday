import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { usePro } from '@/billing/pro';
import { ProLock } from '@/components/ProGate';
import { WeeklySummaryCard } from '@/components/WeeklySummaryCard';
import { BarChart, type Bar } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import { MonthCalendar } from '@/components/calendar';
import { ListRow, Loading, Screen, TabHeader } from '@/components/ui/layout';
import { ProgressBar } from '@/components/ui/progress';
import { Button, Card, Divider, Row, SectionHeader, Segmented, T } from '@/components/ui/primitives';
import { getMonthMarkers } from '@/data/history';
import { getProfile } from '@/data/settings';
import type { DayNutrition } from '@/data/meals';
import { getGymStats, getNutritionStats, RANGES, rangeStart, type RangeKey } from '@/data/stats';
import { listWeights } from '@/data/weight';
import { rollingAverage, weightProgress } from '@/domain/weight';
import { addDays, diffDays, DAY_LETTER, eachDay, formatShort, startOfWeek, todayKey, weekday, type DateKey } from '@/lib/dates';
import { formatKcal, formatKg, formatNumber, formatPercent, formatProtein, formatSigned } from '@/lib/format';
import { useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export default function ProgressScreen() {
  const c = useColors();
  const [range, setRange] = useState<RangeKey>('30d');
  const today = todayKey();
  const pro = usePro();
  // 90 días and the whole history are Pro; 7 and 30 days stay free.
  const locked = !pro && (range === '90d' || range === 'all');

  const { data } = useQuery(async (db) => {
    const [profile, weights, nutrition, gym] = await Promise.all([
      getProfile(db),
      listWeights(db),
      getNutritionStats(db, range, today),
      getGymStats(db, range, today),
    ]);
    return { profile, weights, nutrition, gym };
  }, [range, today]);

  return (
    <Screen tab>
      <TabHeader title="Progreso" subtitle="Tus datos reales" />
      <View style={{ marginBottom: space.lg }}>
        <WeeklySummaryCard showLock />
      </View>
      <Segmented<RangeKey> options={RANGES.map((r) => ({ key: r.key, label: !pro && (r.key === '90d' || r.key === 'all') ? `${r.label} 🔒` : r.label }))} value={range} onChange={setRange} />

      {locked ? (
        <View style={{ marginTop: space.lg }}>
          <ProLock title="Estadísticas avanzadas" message="Mirá 90 días o todo tu historial: peso, nutrición y gimnasio, para ver el camino completo." />
        </View>
      ) : !data ? (
        <Loading />
      ) : (
        <Animated.View key={range} entering={FadeIn.duration(250)}>
          {WeightSection({ data, range, today })}
          {NutritionSection({ data, range, today })}
          {GymSection({ data, range })}
        </Animated.View>
      )}

      <CalendarSection today={today} />
    </Screen>
  );

  type Data = NonNullable<typeof data>;

  // Plain render helpers (not components), so charts keep their state across re-renders.

  function WeightSection({ data, range, today }: { data: Data; range: RangeKey; today: DateKey }) {
    const { profile, weights } = data;
    const from = rangeStart(range, today);
    const inRange = weights.filter((w) => !from || w.date >= from);
    const progress = weightProgress(profile.startWeight, profile.targetWeight, weights);
    const first = inRange[0];
    const last = inRange[inRange.length - 1];
    const span = first && last ? diffDays(first.date, last.date) : 0;
    const change = first && last && inRange.length > 1 ? last.weight - first.weight : null;
    const perWeek = change !== null && span >= 7 ? (change / span) * 7 : null;
    return (
      <View style={{ marginTop: space.xl }}>
        <SectionHeader title="Peso" action="Ver todo" onAction={() => router.push('/peso')} />
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Mini label="Inicio" value={`${formatKg(profile.startWeight)} kg`} />
            <Mini label="Actual" value={progress.current !== null ? `${formatKg(progress.current)} kg` : '—'} color={c.text} />
            <Mini label="Meta" value={`${formatKg(profile.targetWeight)} kg`} color={c.accent} />
            <Mini label="Ganado" value={progress.gained !== null ? `${formatSigned(progress.gained)} kg` : '—'} />
          </Row>
          <ProgressBar progress={progress.progress ?? 0} color={c.accent} style={{ marginVertical: space.lg }} />
          <LineChart
            data={inRange.map((w) => ({ date: w.date, value: w.weight }))}
            secondary={rollingAverage(weights).filter((w) => !from || w.date >= from).map((w) => ({ date: w.date, value: w.weight }))}
            target={profile.targetWeight}
            color={c.accent}
            formatValue={(v) => formatKg(v)}
            unit="kg"
            emptyLabel="Sin mediciones en este período"
          />
          {change !== null ? (
            <T variant="label" tone="muted" style={{ marginTop: space.md }}>
              {formatSigned(change)} kg en el período{perWeek !== null ? ` · ${formatSigned(perWeek, 2)} kg por semana en promedio` : ''}
            </T>
          ) : null}
        </Card>
      </View>
    );
  }

  function NutritionSection({ data, range, today }: { data: Data; range: RangeKey; today: DateKey }) {
    const n = data.nutrition;
    const bars = nutritionBars(n.days, range, today);
    // Today's goal draws the line; each day is colored against the goal it had.
    const lastGoal = n.days[n.days.length - 1];
    const kcalGoal = lastGoal?.calorieGoal ?? null;
    const protGoal = lastGoal?.proteinGoal ?? null;
    const kcalColor = (b: Bar & { value: number }) => {
      const g = b.goal ?? kcalGoal;
      if (!g) return c.accent;
      return b.value > g * 1.1 ? c.warning : b.value >= g * 0.9 ? c.accent : c.textDim;
    };
    const protColor = (b: Bar & { value: number }) => {
      const g = b.goal ?? protGoal;
      return !g || b.value >= g * 0.95 ? c.protein : c.textDim;
    };
    const unit = bars.weekly ? 'Cada barra es el promedio de una semana.' : 'Cada barra es un día.';
    return (
      <View style={{ marginTop: space.xl }}>
        <SectionHeader title="Nutrición" />
        <Row gap={space.md}>
          <Card style={{ flex: 1 }}>
            <T variant="caption" tone="dim">Promedio diario</T>
            <T variant="number" tone="accent">{n.avgCalories !== null ? formatKcal(n.avgCalories) : '—'}</T>
            <T variant="caption" tone="dim">kcal{kcalGoal ? ` · meta ${formatKcal(kcalGoal)}` : ''}</T>
          </Card>
          <Card style={{ flex: 1 }}>
            <T variant="caption" tone="dim">Promedio diario</T>
            <T variant="number" tone="protein">{n.avgProtein !== null ? formatProtein(n.avgProtein) : '—'}</T>
            <T variant="caption" tone="dim">g de proteína{protGoal ? ` · meta ${formatProtein(protGoal)}` : ''}</T>
          </Card>
        </Row>
        <Card style={{ marginTop: space.md }}>
          <T variant="caption" tone="dim">
            {n.daysLogged === 0
              ? 'No hay comidas registradas en este período.'
              : `Promedios sobre ${n.daysLogged} ${n.daysLogged === 1 ? 'día' : 'días'} con registros (de ${n.daysInRange}). Los días sin registrar no cuentan como cero.`}
          </T>
          {n.daysLogged > 0 ? (
            <View style={{ gap: space.md, marginTop: space.md }}>
              <Frequency label="Llegaste a las calorías" done={n.calorieGoalDays} total={n.daysLogged} color={c.accent} />
              <Frequency label="Llegaste a la proteína" done={n.proteinGoalDays} total={n.daysLogged} color={c.protein} />
            </View>
          ) : null}
        </Card>
        <Card style={{ marginTop: space.md }}>
          <T variant="h3">Calorías</T>
          <T variant="caption" tone="dim" style={{ marginBottom: space.md }}>{unit} La línea punteada es tu meta.</T>
          <BarChart
            data={bars.calories}
            color={c.accent}
            colorFor={kcalColor}
            goalLine={kcalGoal}
            goalLabel={kcalGoal ? `Meta ${formatKcal(kcalGoal)}` : undefined}
            formatValue={(v) => `${formatKcal(v)} kcal`}
            showEveryLabel={bars.every}
          />
          <Row gap={space.lg} style={{ marginTop: space.md, flexWrap: 'wrap' }}>
            <Legend color={c.accent} label="En la meta" />
            <Legend color={c.textDim} label="Te faltó" />
            <Legend color={c.warning} label="Te pasaste" />
          </Row>
        </Card>
        <Card style={{ marginTop: space.md }}>
          <T variant="h3">Proteína</T>
          <T variant="caption" tone="dim" style={{ marginBottom: space.md }}>{unit} La línea punteada es tu meta.</T>
          <BarChart
            data={bars.protein}
            color={c.protein}
            colorFor={protColor}
            goalLine={protGoal}
            goalLabel={protGoal ? `Meta ${formatProtein(protGoal)} g` : undefined}
            formatValue={(v) => `${formatProtein(v)} g`}
            showEveryLabel={bars.every}
          />
          <Row gap={space.lg} style={{ marginTop: space.md }}>
            <Legend color={c.protein} label="Llegaste" />
            <Legend color={c.textDim} label="Te faltó" />
          </Row>
        </Card>
        {n.topMeals.length > 0 ? (
          <Card padded={false} style={{ marginTop: space.md, paddingVertical: space.xs }}>
            <T variant="h3" style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs }}>Lo que más comiste</T>
            {n.topMeals.map((m, i) => (
              <View key={`${m.name}-${i}`}>
                {i > 0 ? <Divider style={{ marginHorizontal: space.lg }} /> : null}
                <ListRow
                  title={m.name}
                  subtitle={`${m.count} ${m.count === 1 ? 'vez' : 'veces'}`}
                  right={<T variant="label" tone="dim">{formatKcal(m.calories)} kcal</T>}
                  onPress={m.mealId ? () => router.push({ pathname: '/comida/[id]', params: { id: m.mealId! } }) : undefined}
                />
              </View>
            ))}
          </Card>
        ) : null}
      </View>
    );
  }

  function GymSection({ data, range }: { data: Data; range: RangeKey }) {
    const g = data.gym;
    return (
      <View style={{ marginTop: space.xl }}>
        <SectionHeader title="Gimnasio" action="Calendario" onAction={() => router.push('/asistencia')} />
        <View style={styles.grid}>
          <Tile label={range === 'all' ? 'Sesiones en total' : 'Días de gym'} value={String(g.attendanceInRange)} />
          <Tile label="Por semana" value={g.perWeek !== null ? formatNumber(g.perWeek, 1) : '—'} />
          <Tile label="Por mes" value={g.perMonth !== null ? formatNumber(g.perMonth, 1) : '—'} />
          <Tile label="Constancia" value={g.consistency !== null ? formatPercent(g.consistency) : '—'} />
        </View>
        <Card style={{ marginTop: space.md }}>
          <T variant="h3" style={{ marginBottom: space.md }}>Días de gym por semana</T>
          <BarChart
            data={g.weekly.map((w) => ({ key: w.weekStart, label: formatShort(w.weekStart), value: w.count, goal: g.scheduledDays.length || null, detail: `${w.count} ${w.count === 1 ? 'día' : 'días'}` }))}
            color={c.accent}
            formatValue={(v) => String(v)}
            showEveryLabel={g.weekly.length > 8 ? 3 : g.weekly.length > 5 ? 2 : 1}
            emptyLabel="Sin asistencias registradas"
          />
        </Card>
        {g.sessions.length >= 2 && g.totalVolume > 0 ? (
          <Card style={{ marginTop: space.md }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
              <T variant="h3">Volumen por entrenamiento</T>
              <T variant="caption" tone="dim">{formatNumber(g.totalVolume)} kg en total</T>
            </Row>
            <BarChart
              data={[...g.sessions].reverse().slice(-14).map((s) => ({ key: s.id, label: formatShort(s.date), value: s.volume, detail: `${formatNumber(s.volume)} kg · ${s.setCount} series` }))}
              color={c.protein}
              formatValue={(v) => `${formatNumber(v)} kg`}
              showEveryLabel={g.sessions.length > 7 ? 2 : 1}
            />
            <T variant="caption" tone="dim" style={{ marginTop: space.sm }}>Volumen = repeticiones × kg de las series completadas.</T>
          </Card>
        ) : null}
        <Button label="Progresión por ejercicio" icon="trending-up" variant="secondary" style={{ marginTop: space.md }} onPress={() => router.push('/entrenar')} />
      </View>
    );
  }
}

/** Daily bars for short ranges; weekly averages (of logged days only) for long ones. */
function nutritionBars(days: (DayNutrition & { calorieGoal: number; proteinGoal: number })[], range: RangeKey, today: DateKey) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  if (range === '7d' || range === '30d') {
    const from = rangeStart(range, today)!;
    const list = eachDay(from, today);
    const label = (d: DateKey) => (range === '7d' ? DAY_LETTER[weekday(d)] : String(Number(d.slice(8))));
    const calories: Bar[] = list.map((d) => ({ key: d, label: label(d), value: byDate.get(d)?.calories ?? null, goal: byDate.get(d)?.calorieGoal, detail: byDate.get(d) ? `${formatShort(d)} · ${formatKcal(byDate.get(d)!.calories)} kcal` : undefined }));
    const protein: Bar[] = list.map((d) => ({ key: d, label: label(d), value: byDate.get(d)?.protein ?? null, goal: byDate.get(d)?.proteinGoal, detail: byDate.get(d) ? `${formatShort(d)} · ${formatProtein(byDate.get(d)!.protein)} g` : undefined }));
    return { calories, protein, weekly: false, every: range === '7d' ? 1 : 5 };
  }
  const start = startOfWeek(rangeStart(range, today) ?? days[0]?.date ?? today);
  const weeks: Bar[] = [];
  const proteinWeeks: Bar[] = [];
  for (let w = start; w <= today; w = addDays(w, 7)) {
    const inWeek = days.filter((d) => d.date >= w && d.date <= addDays(w, 6));
    const avg = (f: (d: DayNutrition) => number) => (inWeek.length ? inWeek.reduce((s, d) => s + f(d), 0) / inWeek.length : null);
    const goalC = inWeek[0]?.calorieGoal;
    const goalP = inWeek[0]?.proteinGoal;
    weeks.push({ key: w, label: formatShort(w), value: avg((d) => d.calories), goal: goalC, detail: inWeek.length ? `Semana del ${formatShort(w)} · ${inWeek.length} días registrados` : undefined });
    proteinWeeks.push({ key: w, label: formatShort(w), value: avg((d) => d.protein), goal: goalP, detail: inWeek.length ? `Semana del ${formatShort(w)} · ${inWeek.length} días registrados` : undefined });
  }
  const trimmed = weeks.slice(-26);
  return { calories: trimmed, protein: proteinWeeks.slice(-26), weekly: true, every: trimmed.length > 13 ? 4 : 2 };
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View>
      <T variant="caption" tone="dim">{label}</T>
      <T variant="h3" color={color}>{value}</T>
    </View>
  );
}

function Frequency({ label, done, total, color }: { label: string; done: number; total: number; color: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="label">{label}</T>
        <T variant="label" color={color}>{done} de {total} días</T>
      </Row>
      <ProgressBar progress={total ? done / total : 0} color={color} height={6} />
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={[styles.tile, { backgroundColor: c.surface }]}>
      <T variant="number">{value}</T>
      <T variant="caption" tone="dim">{label}</T>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Row gap={6}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <T variant="caption" tone="dim">{label}</T>
    </Row>
  );
}

/** Every day at a glance (what used to be the Historial tab): tap a day to open it. */
function CalendarSection({ today }: { today: DateKey }) {
  const c = useColors();
  const [month, setMonth] = useState<DateKey>(today);
  const { data: markers } = useQuery((db) => getMonthMarkers(db, month), [month]);
  return (
    <View style={{ marginTop: space.xl }}>
      <SectionHeader title="Calendario" />
      <Card>
        <MonthCalendar
          month={month}
          onChangeMonth={setMonth}
          selected={today}
          onSelect={(d) => router.push({ pathname: '/dia/[date]', params: { date: d } })}
          maxDate={today}
          marks={(d) => {
            const m = markers?.[d];
            if (!m) return undefined;
            return { dots: [m.meals ? c.accent : null, m.gym ? c.protein : null, m.weight ? c.weight : null].filter(Boolean) as string[] };
          }}
        />
        <Row gap={space.lg} style={{ justifyContent: 'center', marginTop: space.sm }}>
          <Legend color={c.accent} label="Comidas" />
          <Legend color={c.protein} label="Gym" />
          <Legend color={c.weight} label="Peso" />
        </Row>
        <T variant="caption" tone="dim" style={{ textAlign: 'center', marginTop: space.sm }}>Tocá un día para ver todo lo que registraste.</T>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '47%', flexGrow: 1, borderRadius: radius.md, padding: space.md },
});
