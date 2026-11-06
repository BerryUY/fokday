import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { LineChart } from '@/components/charts/LineChart';
import { Field, Sheet, confirm } from '@/components/ui/form';
import { EmptyState, Loading, Screen } from '@/components/ui/layout';
import { Button, Card, Chip, Divider, IconButton, PressableScale, Row, SectionHeader, Segmented, T } from '@/components/ui/primitives';
import { WeightGoalCard } from '@/components/weight';
import { getProfile } from '@/data/settings';
import { addMilestone, deleteMilestone, listMilestones, listWeights } from '@/data/weight';
import { changeFromPrevious, changeOverDays, latestEntry, milestoneStatus, rollingAverage, weightDirection, weightProgress } from '@/domain/weight';
import { addDays, capitalize, formatLong, formatShortWithYear, todayKey } from '@/lib/dates';
import { formatKg, formatSigned, parsePositive } from '@/lib/format';
import { useMutation, useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

type Range = '30' | '90' | 'all';

export default function WeightScreen() {
  const c = useColors();
  const run = useMutation();
  const [range, setRange] = useState<Range>('90');
  const [smooth, setSmooth] = useState(true);
  const [milestoneOpen, setMilestoneOpen] = useState(false);

  const { data } = useQuery(async (db) => {
    const [profile, weights, milestones] = await Promise.all([getProfile(db), listWeights(db), listMilestones(db)]);
    return { profile, weights, milestones };
  }, []);

  if (!data) return <Screen title="Peso"><Loading variant="detail" /></Screen>;
  const { profile, weights, milestones } = data;
  const progress = weightProgress(profile.startWeight, profile.targetWeight, weights);
  const last = latestEntry(weights);
  const from = range === 'all' ? null : addDays(todayKey(), -Number(range));
  const points = weights.filter((w) => !from || w.date >= from).map((w) => ({ date: w.date, value: w.weight }));
  const avg = rollingAverage(weights).filter((w) => !from || w.date >= from).map((w) => ({ date: w.date, value: w.weight }));
  const statuses = milestoneStatus(milestones.map((m) => m.weight), weights, weightDirection(profile.startWeight, profile.targetWeight));
  const prev = changeFromPrevious(weights);
  const week = changeOverDays(weights, 7);
  const month = changeOverDays(weights, 30);

  return (
    <Screen title="Peso" footer={<Button label="Registrar peso" icon="plus" size="lg" onPress={() => router.push('/peso/registrar')} />}>
      <WeightGoalCard progress={progress} lastDate={last?.date ?? null} />

      {weights.length > 0 ? (
        <Row gap={space.sm} style={{ marginTop: space.md }}>
          <Change label="Último cambio" value={prev} />
          <Change label="7 días" value={week?.change ?? null} />
          <Change label="30 días" value={month?.change ?? null} />
        </Row>
      ) : null}

      <Card style={{ marginTop: space.lg }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
          <T variant="h3">Evolución</T>
          <Chip label="Promedio 7 días" compact selected={smooth} onPress={() => setSmooth(!smooth)} tone="weight" />
        </Row>
        <LineChart
          data={points}
          secondary={smooth ? avg : undefined}
          target={profile.targetWeight}
          color={c.accent}
          height={200}
          formatValue={(v) => formatKg(v)}
          unit="kg"
          emptyLabel="Registrá tu peso para ver la curva"
        />
        <View style={{ marginTop: space.md }}>
          <Segmented<Range> options={[{ key: '30', label: '30 días' }, { key: '90', label: '90 días' }, { key: 'all', label: 'Todo' }]} value={range} onChange={setRange} />
        </View>
        <T variant="caption" tone="dim" style={{ marginTop: space.sm }}>
          Línea punteada: promedio de 7 días. Los cambios de un día a otro suelen ser agua y comida; mirá la tendencia.
        </T>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <SectionHeader title="Hitos" action="Agregar" onAction={() => setMilestoneOpen(true)} />
        <Card padded={milestones.length === 0}>
          {milestones.length === 0 ? (
            <T variant="label" tone="muted">Poné metas intermedias (por ejemplo 60 kg) para celebrar el camino hacia {formatKg(profile.targetWeight)} kg.</T>
          ) : (
            statuses.map((s, i) => {
              const m = milestones.find((x) => x.weight === s.weight)!;
              return (
                <View key={m.id}>
                  {i > 0 ? <Divider style={{ marginHorizontal: space.lg }} /> : null}
                  <Row style={{ padding: space.lg }} gap={space.md}>
                    <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: s.achievedOn ? c.accent : c.surfaceAlt }}>
                      <Feather name={s.achievedOn ? 'check' : 'flag'} size={14} color={s.achievedOn ? c.accentText : c.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T variant="bodyMedium">{formatKg(s.weight)} kg{m.label ? ` · ${m.label}` : ''}</T>
                      <T variant="caption" tone="dim">
                        {s.achievedOn ? `Alcanzado el ${formatShortWithYear(s.achievedOn)}` : progress.current !== null ? `Faltan ${formatKg(Math.max(0, s.weight - progress.current))} kg` : 'Pendiente'}
                      </T>
                    </View>
                    <IconButton
                      icon="x"
                      label="Eliminar hito"
                      size={30}
                      filled={false}
                      tone="dim"
                      onPress={async () => {
                        if (await confirm('Eliminar hito', `¿Eliminar el hito de ${formatKg(s.weight)} kg?`, 'Eliminar', true)) run((db) => deleteMilestone(db, m.id));
                      }}
                    />
                  </Row>
                </View>
              );
            })
          )}
        </Card>
      </View>

      <View style={{ marginTop: space.xl }}>
        <SectionHeader title="Registros" />
        {weights.length === 0 ? (
          <Card>
            <EmptyState icon="activity" title="Sin mediciones" message="Pesate en condiciones parecidas (por ejemplo, de mañana) para que la tendencia sea confiable." />
          </Card>
        ) : (
          <Card padded={false} style={{ paddingVertical: space.xs }}>
            {[...weights].reverse().map((w, i, arr) => {
              const older = arr[i + 1];
              const diff = older ? Math.round((w.weight - older.weight) * 10) / 10 : null;
              return (
                <View key={w.id}>
                  {i > 0 ? <Divider style={{ marginHorizontal: space.lg }} /> : null}
                  <PressableScale onPress={() => router.push({ pathname: '/peso/registrar', params: { id: w.id } })} scaleTo={0.99}>
                    <Row style={{ paddingHorizontal: space.lg, paddingVertical: 12 }}>
                      <View style={{ flex: 1 }}>
                        <T variant="bodyMedium">{capitalize(formatLong(w.date))}</T>
                      </View>
                      {diff !== null ? <T variant="caption" tone="dim" style={{ marginRight: space.md }}>{formatSigned(diff)}</T> : null}
                      <T variant="h3">{formatKg(w.weight)} kg</T>
                    </Row>
                  </PressableScale>
                </View>
              );
            })}
          </Card>
        )}
      </View>

      <MilestoneSheet visible={milestoneOpen} onClose={() => setMilestoneOpen(false)} current={progress.current} target={profile.targetWeight} existing={milestones.map((m) => m.weight)} />
    </Screen>
  );
}

function Change({ label, value }: { label: string; value: number | null }) {
  return (
    <Card style={{ flex: 1, padding: space.md }}>
      <T variant="caption" tone="dim">{label}</T>
      <T variant="h3" style={{ marginTop: 2 }}>{value === null ? '—' : `${formatSigned(value)} kg`}</T>
    </Card>
  );
}

function MilestoneSheet({ visible, onClose, current, target, existing }: { visible: boolean; onClose: () => void; current: number | null; target: number; existing: number[] }) {
  const run = useMutation();
  const [weight, setWeight] = useState('');
  const [label, setLabel] = useState('');
  const value = parsePositive(weight);
  const base = Math.ceil(current ?? target - 6);
  const suggestions = [base + 1, base + 3, base + 5].filter((w) => w < target && !existing.includes(w));
  const save = async () => {
    if (!value) return;
    const ok = await run((db) => addMilestone(db, value, label), { success: 'Hito agregado' });
    if (ok !== undefined) {
      setWeight('');
      setLabel('');
      onClose();
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Nuevo hito">
      <View style={{ gap: space.lg }}>
        {suggestions.length ? (
          <Row style={{ flexWrap: 'wrap' }}>
            {suggestions.map((s) => <Chip key={s} label={`${s} kg`} onPress={() => setWeight(String(s))} selected={value === s} />)}
          </Row>
        ) : null}
        <Field label="Peso del hito" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" suffix="kg" />
        <Field label="Nombre (opcional)" value={label} onChangeText={setLabel} placeholder="Ej.: Primeros 3 kg" />
        <Button label="Guardar hito" onPress={save} disabled={!value} />
      </View>
    </Sheet>
  );
}
