import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { useSyncState } from '@/backup/service';
import { Field, Stepper } from '@/components/ui/form';
import { ListRow, Loading, Screen } from '@/components/ui/layout';
import { Button, Card, Chip, Divider, Row, SectionHeader, Segmented, T } from '@/components/ui/primitives';
import { getGoalForDate, getProfile, HABIT_FEATURES, setGoalsFrom, updateProfile, type FeatureKey, type Profile, type ThemePreference } from '@/data/settings';
import { EXTRA_NUTRIENTS } from '@/domain/nutrition';
import { useColors } from '@/theme/ThemeProvider';
import { listWeights, saveWeight } from '@/data/weight';
import { latestEntry } from '@/domain/weight';
import { DAY_SHORT, formatDateTime, formatShort, todayKey, WEEK_ORDER } from '@/lib/dates';
import { formatKg, formatLiters, parsePositive, toInput } from '@/lib/format';
import { useMutation, useQuery } from '@/state/db';
import { space } from '@/theme/tokens';

const OPTIONAL_FEATURES: { key: FeatureKey; label: string; description: string }[] = [
  ...HABIT_FEATURES,
  ...EXTRA_NUTRIENTS.map((n) => ({ key: n.key as FeatureKey, label: n.label, description: `Sumar ${n.label.toLowerCase()} (${n.unit}) a cada comida y al día` })),
];

export default function SettingsScreen() {
  const { data } = useQuery(async (db) => {
    const [profile, goal, weights] = await Promise.all([getProfile(db), getGoalForDate(db, todayKey()), listWeights(db)]);
    return { profile, goal, latest: latestEntry(weights) };
  }, []);
  if (!data) return <Screen title="Ajustes"><Loading /></Screen>;
  return <SettingsForm profile={data.profile} calories={data.goal.calories} protein={data.goal.protein} latest={data.latest} />;
}

function SettingsForm({ profile, calories, protein, latest }: {
  profile: Profile;
  calories: number;
  protein: number;
  latest: { date: string; weight: number } | null;
}) {
  const c = useColors();
  const run = useMutation();
  const sync = useSyncState();
  const [name, setName] = useState(profile.name);
  const [start, setStart] = useState(toInput(profile.startWeight, 1));
  const [target, setTarget] = useState(toInput(profile.targetWeight, 1));
  const [current, setCurrent] = useState('');
  const [kcal, setKcal] = useState(toInput(calories, 0));
  const [prot, setProt] = useState(toInput(protein, 1));
  const [rest, setRest] = useState(profile.defaultRestSeconds);

  useEffect(() => setRest(profile.defaultRestSeconds), [profile.defaultRestSeconds]);

  const startValue = parsePositive(start);
  const targetValue = parsePositive(target);
  const currentValue = parsePositive(current);
  const kcalValue = parsePositive(kcal);
  const protValue = parsePositive(prot);

  const saveGoals = () =>
    run(
      async (db) => {
        if (!startValue || !targetValue) throw new Error('Revisá el peso de inicio y la meta.');
        await updateProfile(db, { name, startWeight: startValue, targetWeight: targetValue });
        if (kcalValue && protValue && (kcalValue !== calories || protValue !== protein)) await setGoalsFrom(db, todayKey(), kcalValue, protValue);
      },
      { success: 'Ajustes guardados' },
    );

  const toggleDay = (d: number) => {
    const days = profile.trainingDays.includes(d) ? profile.trainingDays.filter((x) => x !== d) : [...profile.trainingDays, d];
    run((db) => updateProfile(db, { trainingDays: days }));
  };

  const lastBackup = sync.info?.lastBackupAt;

  return (
    <Screen title="Ajustes">
      <SectionHeader title="Perfil y objetivos" />
      <Card>
        <View style={{ gap: space.lg }}>
          <Field label="Tu nombre" value={name} onChangeText={setName} placeholder="Para el saludo" />
          <Row gap={space.md} align="flex-start">
            <View style={{ flex: 1 }}><Field label="Peso de inicio" value={start} onChangeText={setStart} keyboardType="decimal-pad" suffix="kg" error={start && !startValue ? 'Inválido' : null} /></View>
            <View style={{ flex: 1 }}><Field label="Peso meta" value={target} onChangeText={setTarget} keyboardType="decimal-pad" suffix="kg" error={target && !targetValue ? 'Inválido' : null} /></View>
          </Row>
          <Row gap={space.md} align="flex-start">
            <View style={{ flex: 1 }}><Field label="Calorías diarias" value={kcal} onChangeText={setKcal} keyboardType="numeric" suffix="kcal" error={kcal && !kcalValue ? 'Inválido' : null} /></View>
            <View style={{ flex: 1 }}><Field label="Proteína diaria" value={prot} onChangeText={setProt} keyboardType="decimal-pad" suffix="g" error={prot && !protValue ? 'Inválido' : null} /></View>
          </Row>
          <T variant="caption" tone="dim">Los objetivos nutricionales nuevos se aplican desde hoy; los días anteriores conservan los que tenían.</T>
          <Button label="Guardar" icon="check" onPress={saveGoals} disabled={!startValue || !targetValue || !kcalValue || !protValue} />
        </View>
      </Card>

      <Card style={{ marginTop: space.md }}>
        <T variant="label" tone="muted">Peso actual</T>
        <T variant="h2" style={{ marginTop: 2 }}>{latest ? `${formatKg(latest.weight)} kg` : 'Sin mediciones'}</T>
        <T variant="caption" tone="dim">{latest ? `Última medición: ${formatShort(latest.date)}. ` : ''}Sale de tus registros reales; actualizalo registrando una medición.</T>
        <Row gap={space.md} style={{ marginTop: space.md }}>
          <View style={{ flex: 1 }}><Field value={current} onChangeText={setCurrent} keyboardType="decimal-pad" suffix="kg" placeholder="Peso de hoy" /></View>
          <Button
            label="Registrar"
            disabled={!currentValue}
            onPress={async () => {
              const ok = await run((db) => saveWeight(db, todayKey(), currentValue!), { success: 'Peso de hoy registrado' });
              if (ok) setCurrent('');
            }}
          />
        </Row>
      </Card>

      <SectionHeader title="Entrenamiento" style={{ marginTop: space.xl }} />
      <Card>
        <T variant="bodyMedium">Días de gym</T>
        <T variant="caption" tone="dim" style={{ marginBottom: space.md }}>La racha y la constancia se calculan sobre estos días. Los demás son descanso.</T>
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {WEEK_ORDER.map((d) => (
            <Chip key={d} label={DAY_SHORT[d]} compact selected={profile.trainingDays.includes(d)} onPress={() => toggleDay(d)} />
          ))}
        </Row>
        <Divider style={{ marginVertical: space.lg }} />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="bodyMedium">Descanso por defecto</T>
            <T variant="caption" tone="dim">Si el ejercicio no tiene uno propio.</T>
          </View>
          <Stepper
            value={rest}
            onChange={(v) => {
              setRest(v);
              run((db) => updateProfile(db, { defaultRestSeconds: v }), { silent: true });
            }}
            min={15}
            max={600}
            step={15}
            format={(v) => `${v} s`}
          />
        </Row>
      </Card>

      <SectionHeader title="Seguimiento opcional" style={{ marginTop: space.xl }} />
      <Card>
        <T variant="caption" tone="dim" style={{ marginBottom: space.md }}>
          Activá solo lo que necesites. Lo que dejes apagado no aparece en la app.
        </T>
        {OPTIONAL_FEATURES.map((f, i) => (
          <View key={f.key}>
            {i > 0 ? <Divider style={{ marginVertical: space.md }} /> : null}
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: space.md }}>
                <T variant="bodyMedium">{f.label}</T>
                <T variant="caption" tone="dim">{f.description}</T>
              </View>
              <Switch
                value={profile.features.includes(f.key)}
                onValueChange={(on) =>
                  run((db) => updateProfile(db, { features: on ? [...profile.features, f.key] : profile.features.filter((k) => k !== f.key) }), { silent: true })
                }
                trackColor={{ true: c.accent, false: c.track }}
                thumbColor="#FFFFFF"
                accessibilityLabel={f.label}
              />
            </Row>
            {f.key === 'water' && profile.features.includes('water') ? (
              <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
                <T variant="label" tone="muted">Meta diaria</T>
                <Stepper
                  value={profile.waterGoalMl}
                  onChange={(v) => run((db) => updateProfile(db, { waterGoalMl: v }), { silent: true })}
                  min={500}
                  max={6000}
                  step={250}
                  format={(v) => `${formatLiters(v)} L`}
                />
              </Row>
            ) : null}
          </View>
        ))}
      </Card>

      <Card tone="alt" style={{ marginTop: space.xl }}>
        <T variant="caption" tone="muted">
          Los recordatorios son automáticos: te avisamos solo lo que falta (gym, comidas, agua, creatina, tareas) y en un buen horario. Podés silenciarlos desde los ajustes de notificaciones del teléfono.
        </T>
      </Card>

      <SectionHeader title="Apariencia" style={{ marginTop: space.xl }} />
      <Segmented<ThemePreference>
        options={[{ key: 'dark', label: 'Oscuro' }, { key: 'light', label: 'Claro' }, { key: 'system', label: 'Sistema' }]}
        value={profile.theme}
        onChange={(theme) => run((db) => updateProfile(db, { theme }))}
      />

      <SectionHeader title="Más" style={{ marginTop: space.xl }} />
      <Card padded={false} style={{ paddingVertical: space.xs }}>
        <ListRow icon="flag" iconTone="weight" title="Hitos de peso" subtitle="Metas intermedias hacia tu objetivo" onPress={() => router.push('/peso')} />
        <Divider style={{ marginHorizontal: space.lg }} />
        <ListRow
          icon="cloud"
          iconTone={sync.info?.lastError ? 'danger' : 'accent'}
          title="Datos y respaldo"
          subtitle={
            !sync.configured
              ? 'Respaldo en la nube sin configurar'
              : lastBackup
                ? `Último respaldo: ${formatDateTime(lastBackup)}`
                : 'Todavía no hay respaldos'
          }
          onPress={() => router.push('/ajustes/respaldo')}
        />
        <Divider style={{ marginHorizontal: space.lg }} />
        <ListRow icon="book" title="Biblioteca de ejercicios" onPress={() => router.push('/ejercicios')} />
      </Card>

      <T variant="caption" tone="dim" style={{ textAlign: 'center', marginTop: space.xl }}>
        Momentum {Constants.expoConfig?.version ?? ''} · Tus datos viven en este teléfono y funcionan sin internet.
      </T>
    </Screen>
  );
}
