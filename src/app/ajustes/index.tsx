import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { adsPrivacyRequired, showAdsPrivacyOptions } from '@/ads/rewarded';
import { useSyncState } from '@/backup/service';
import { usePro } from '@/billing/pro';
import { BodyCard } from '@/components/BodyCard';
import { ProfileHeader } from '@/components/ProfileHeader';
import { ProBadge } from '@/components/ProGate';
import { Field, Stepper } from '@/components/ui/form';
import { ListRow, Loading, Screen } from '@/components/ui/layout';
import { Button, Card, Chip, Divider, Row, SectionHeader, Segmented, T, Toggle } from '@/components/ui/primitives';
import { getBody, getGoalForDate, getProfile, HABIT_FEATURES, setGoalsFrom, updateProfile, type BodyData, type FeatureKey, type Profile, type ThemePreference } from '@/data/settings';
import { EXTRA_NUTRIENTS } from '@/domain/nutrition';
import { useColors } from '@/theme/ThemeProvider';
import { listWeights, saveWeight } from '@/data/weight';
import { isValidWeight, latestEntry, WEIGHT_RANGE } from '@/domain/weight';
import { DAY_SHORT, formatDateTime, formatShort, todayKey, WEEK_ORDER } from '@/lib/dates';
import { formatKg, formatLiters, parsePositive, toInput } from '@/lib/format';
import { useMutation, useQuery } from '@/state/db';
import { ACCENTS, space, withAccent } from '@/theme/tokens';

const validKg = (v: number | null) => (v !== null && isValidWeight(v) ? v : null);

const OPTIONAL_FEATURES: { key: FeatureKey; label: string; description: string }[] = [
  ...HABIT_FEATURES,
  ...EXTRA_NUTRIENTS.map((n) => ({ key: n.key as FeatureKey, label: n.label, description: `Sumar ${n.label.toLowerCase()} (${n.unit}) a cada comida y al día` })),
];

export default function SettingsScreen() {
  const { data } = useQuery(async (db) => {
    const [profile, goal, weights, body] = await Promise.all([getProfile(db), getGoalForDate(db, todayKey()), listWeights(db), getBody(db)]);
    return { profile, goal, latest: latestEntry(weights), body };
  }, []);
  if (!data) return <Screen title="Ajustes"><Loading variant="cards" /></Screen>;
  return <SettingsForm profile={data.profile} calories={data.goal.calories} protein={data.goal.protein} latest={data.latest} body={data.body} />;
}

function SettingsForm({ profile, calories, protein, latest, body }: {
  profile: Profile;
  calories: number;
  protein: number;
  latest: { date: string; weight: number } | null;
  body: BodyData | null;
}) {
  const c = useColors();
  const run = useMutation();
  const sync = useSyncState();
  const pro = usePro();
  // The ads choice only needs a row where the law asks for it (and Pro has no ads at all).
  const { data: adsPrivacy } = useQuery(async () => !pro && (await adsPrivacyRequired()), [pro]);
  const [name, setName] = useState(profile.name);
  const [start, setStart] = useState(toInput(profile.startWeight, 1));
  const [target, setTarget] = useState(toInput(profile.targetWeight, 1));
  const [current, setCurrent] = useState('');
  const [kcal, setKcal] = useState(toInput(calories, 0));
  const [prot, setProt] = useState(toInput(protein, 1));
  const [rest, setRest] = useState(profile.defaultRestSeconds);

  useEffect(() => setRest(profile.defaultRestSeconds), [profile.defaultRestSeconds]);

  const startValue = validKg(parsePositive(start));
  const targetValue = validKg(parsePositive(target));
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
      <ProfileHeader name={profile.name} />

      <SectionHeader title="Perfil y objetivos" />
      <Card>
        <View style={{ gap: space.lg }}>
          <Field label="Tu nombre" value={name} onChangeText={setName} placeholder="Para el saludo" />
          <Row gap={space.md} align="flex-start">
            <View style={{ flex: 1 }}><Field label="Peso de inicio" value={start} onChangeText={setStart} keyboardType="decimal-pad" suffix="kg" error={start && !startValue ? `${WEIGHT_RANGE.min} a ${WEIGHT_RANGE.max} kg` : null} /></View>
            <View style={{ flex: 1 }}><Field label="Peso meta" value={target} onChangeText={setTarget} keyboardType="decimal-pad" suffix="kg" error={target && !targetValue ? `${WEIGHT_RANGE.min} a ${WEIGHT_RANGE.max} kg` : null} /></View>
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

      <SectionHeader title="Tu cuerpo y actividad" style={{ marginTop: space.xl }} />
      <BodyCard
        body={body}
        weightKg={latest?.weight ?? profile.startWeight}
        targetWeightKg={profile.targetWeight}
        onGoals={(k, p) => {
          setKcal(toInput(k, 0));
          setProt(toInput(p, 1));
        }}
      />

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
              <Toggle
                value={profile.features.includes(f.key)}
                onValueChange={(on) =>
                  run((db) => updateProfile(db, { features: on ? [...profile.features, f.key] : profile.features.filter((k) => k !== f.key) }), { silent: true })
                }
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
          Foki te avisa solo lo que falta y a las horas en que solés comer.
        </T>
      </Card>

      <SectionHeader title="Apariencia" style={{ marginTop: space.xl }} />
      <Segmented<ThemePreference>
        options={[{ key: 'dark', label: 'Oscuro' }, { key: 'light', label: 'Claro' }, { key: 'system', label: 'Sistema' }]}
        value={profile.theme}
        onChange={(theme) => run((db) => updateProfile(db, { theme }))}
      />
      <Card style={{ marginTop: space.md }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
          <View style={{ flex: 1, paddingRight: space.md }}>
            <T variant="bodyMedium">Sonidos de recompensa</T>
            <T variant="caption" tone="dim">Un clinc al cumplir una tarea, la creatina o el gym</T>
          </View>
          <Toggle
            value={profile.sounds}
            onValueChange={(sounds) => run((db) => updateProfile(db, { sounds }), { silent: true })}
            accessibilityLabel="Sonidos de recompensa"
          />
        </Row>
        <Divider style={{ marginBottom: space.lg }} />
        <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
          <T variant="bodyMedium">Color de la app</T>
          {pro ? null : <ProBadge />}
        </Row>
        <Row style={{ flexWrap: 'wrap' }} gap={space.md}>
          {ACCENTS.map((a) => {
            const swatch = withAccent(c, a.key).accent;
            const on = pro ? profile.accent === a.key : a.key === 'lima';
            return (
              <Pressable
                key={a.key}
                accessibilityRole="radio"
                accessibilityLabel={a.label}
                accessibilityState={{ selected: on }}
                onPress={() => (pro ? run((db) => updateProfile(db, { accent: a.key }), { silent: true }) : router.push('/pro'))}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: swatch, borderWidth: on ? 3 : 0, borderColor: c.text, opacity: pro || a.key === 'lima' ? 1 : 0.45 }}
              />
            );
          })}
        </Row>
      </Card>

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
              ? 'Respaldo en la nube: entrá con tu cuenta'
              : lastBackup
                ? `Último respaldo: ${formatDateTime(lastBackup)}`
                : 'Todavía no hay respaldos'
          }
          onPress={() => router.push('/ajustes/respaldo')}
        />
        <Divider style={{ marginHorizontal: space.lg }} />
        <ListRow icon="book" title="Biblioteca de ejercicios" onPress={() => router.push('/ejercicios')} />
        <Divider style={{ marginHorizontal: space.lg }} />
        <ListRow icon="bell" iconTone="accent" title="Notificaciones" subtitle="Sobre qué te avisa Foki" onPress={() => router.push('/ajustes/notificaciones')} />
        <Divider />
        <ListRow icon="compass" title="Ver el tour de la app" subtitle="Un repaso de 30 segundos" onPress={() => router.push('/tour')} />
        {adsPrivacy ? (
          <>
            <Divider style={{ marginHorizontal: space.lg }} />
            <ListRow icon="shield" title="Privacidad de anuncios" subtitle="Tu elección sobre los videos opcionales" onPress={() => void showAdsPrivacyOptions()} />
          </>
        ) : null}
      </Card>

      <T variant="caption" tone="dim" style={{ textAlign: 'center', marginTop: space.xl }}>
        FokDay {Constants.expoConfig?.version ?? ''} · Tus datos viven en este teléfono y funcionan sin internet.
      </T>
    </Screen>
  );
}
