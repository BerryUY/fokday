import { Feather } from '@expo/vector-icons';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ApiError, cloudApi, type FoodAnalysis } from '@/backup/api';
import { refreshPlan, setQuota, usePlan } from '@/billing/pro';
import { left, QuotaCard } from '@/components/QuotaCard';
import { MomentPicker } from '@/components/MomentPicker';
import { Field } from '@/components/ui/form';
import { Screen } from '@/components/ui/layout';
import { Badge, Button, Card, Chip, Row, T } from '@/components/ui/primitives';
import { logMeal, saveMeal } from '@/data/meals';
import { guessCategory, type Extras, type MealCategory } from '@/domain/nutrition';
import { formatKcal, parseNonNegative, toInput } from '@/lib/format';
import { goBack } from '@/lib/nav';
import { useParams } from '@/lib/params';
import { useCloudConfig } from '@/state/cloud';
import { useMutation } from '@/state/db';
import { useToast } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type Phase = { kind: 'pick' } | { kind: 'analyzing'; uri: string } | { kind: 'result'; uri: string; food: FoodAnalysis; remaining: number };

/** A small JPEG is enough for the AI and keeps the upload fast (~100 KB). */
async function toSmallJpeg(uri: string): Promise<string> {
  const image = await ImageManipulator.manipulate(uri).resize({ width: 768 }).renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
  if (!saved.base64) throw new Error('No pudimos preparar la foto.');
  return saved.base64;
}

/** Photo → AI estimate → every value editable → log. */
export default function FoodPhotoScreen() {
  const c = useColors();
  const toast = useToast();
  const run = useMutation();
  const date = useParams().date();
  const { config, loading } = useCloudConfig();
  const plan = usePlan();
  const outOfPhotos = left(plan.ai) === 0;
  useEffect(() => {
    if (config) void refreshPlan();
  }, [config]);
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [prot, setProt] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [moment, setMoment] = useState<MealCategory>(guessCategory());
  const [keep, setKeep] = useState(false);
  const [saving, setSaving] = useState(false);

  const pick = async (source: 'camera' | 'library') => {
    if (!config) return;
    const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.show(source === 'camera' ? 'Necesitamos permiso para usar la cámara.' : 'Necesitamos permiso para ver tus fotos.', 'error');
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    setPhase({ kind: 'analyzing', uri });
    try {
      const { food, remaining, ai } = await cloudApi.analyzeFood(config, await toSmallJpeg(uri));
      setQuota('ai', ai);
      setName(food.name);
      setKcal(toInput(food.calories, 0));
      setProt(toInput(food.protein, 1));
      setCarbs(toInput(food.carbs, 1));
      setFat(toInput(food.fat, 1));
      setFiber(toInput(food.fiber, 1));
      setPhase({ kind: 'result', uri, food, remaining });
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) void refreshPlan();
      toast.show(e instanceof Error ? e.message : 'No pudimos analizar la foto.', 'error');
      setPhase({ kind: 'pick' });
    }
  };

  const calories = parseNonNegative(kcal);
  const protein = parseNonNegative(prot);
  const valid = name.trim().length > 0 && calories !== null && protein !== null;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const extras: Extras = { carbs: parseNonNegative(carbs) ?? 0, fat: parseNonNegative(fat) ?? 0, fiber: parseNonNegative(fiber) ?? 0 };
    const ok = await run(
      async (db) => {
        if (keep) await saveMeal(db, { name, category: moment, calories: calories!, protein: protein!, isEstimate: true, ingredients: [], extras });
        return logMeal(db, { date, category: moment, manual: { name, calories: calories!, protein: protein!, extras } });
      },
      { success: `${name.trim()} registrado · ${formatKcal(calories!)} kcal` },
    );
    setSaving(false);
    if (ok) goBack();
  };

  if (!loading && !config) {
    return (
      <Screen title="Foto con IA">
        <Card style={{ padding: space.xl, gap: space.md }}>
          <Feather name="camera" size={28} color={c.accent} />
          <T variant="h2">Entrá con tu cuenta</T>
          <T variant="body" tone="muted">
            La foto se analiza en el servidor de FokDay, así que necesitás una cuenta (Google o email, es gratis). Tus fotos no se guardan: solo se usan para estimar.
          </T>
          <Button label="Entrar o crear cuenta" icon="log-in" onPress={() => router.push('/cuenta/entrar')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title="Foto con IA"
      footer={phase.kind === 'result' ? <Button label="Registrar" icon="check" size="lg" onPress={save} disabled={!valid} loading={saving} /> : undefined}
    >
      {phase.kind === 'pick' ? (
        <Animated.View entering={FadeIn.duration(220)} style={{ gap: space.md }}>
          <Card style={{ padding: space.xl, alignItems: 'center', gap: space.sm }}>
            <View style={[styles.hero, { backgroundColor: c.accentSoft }]}>
              <Feather name="camera" size={34} color={c.accent} />
            </View>
            <T variant="h2" style={{ textAlign: 'center', marginTop: space.sm }}>Sacale una foto a tu plato</T>
            <T variant="body" tone="muted" style={{ textAlign: 'center' }}>La IA estima calorías, proteína y más. Después podés corregir todo antes de guardar.</T>
          </Card>
          {outOfPhotos ? <QuotaCard kind="photo" /> : null}
          <Button label="Sacar foto" icon="camera" size="lg" disabled={outOfPhotos} onPress={() => void pick('camera')} />
          <Button label="Elegir de la galería" icon="image" variant="secondary" disabled={outOfPhotos} onPress={() => void pick('library')} />
          {!outOfPhotos ? <QuotaCard kind="photo" /> : null}
          <T variant="caption" tone="dim" style={{ textAlign: 'center' }}>Consejo: que se vea todo el plato y, si podés, un cubierto al lado para la escala.</T>
        </Animated.View>
      ) : null}

      {phase.kind === 'analyzing' ? (
        <View style={{ gap: space.lg }}>
          <Image source={{ uri: phase.uri }} style={[styles.photo, { backgroundColor: c.surfaceAlt }]} />
          <Analyzing />
        </View>
      ) : null}

      {phase.kind === 'result' ? (
        <Animated.View entering={FadeIn.duration(260)} style={{ gap: space.lg }}>
          <Image source={{ uri: phase.uri }} style={[styles.photo, { backgroundColor: c.surfaceAlt, height: 180 }]} />
          <Row style={{ justifyContent: 'space-between' }}>
            <Badge
              label={phase.food.confidence === 'alta' ? 'Estimación confiable' : phase.food.confidence === 'media' ? 'Estimación aproximada' : 'Revisá los valores'}
              tone={phase.food.confidence === 'alta' ? 'accent' : 'weight'}
            />
            <T variant="caption" tone="dim">{phase.remaining} fotos más hoy</T>
          </Row>
          <Field label="Nombre" value={name} onChangeText={setName} />
          <Row gap={space.md} align="flex-start">
            <View style={{ flex: 1 }}><Field label="Calorías" value={kcal} onChangeText={setKcal} keyboardType="numeric" suffix="kcal" error={kcal && calories === null ? 'Inválido' : null} /></View>
            <View style={{ flex: 1 }}><Field label="Proteína" value={prot} onChangeText={setProt} keyboardType="decimal-pad" suffix="g" error={prot && protein === null ? 'Inválido' : null} /></View>
          </Row>
          <Row gap={space.sm} align="flex-start">
            <View style={{ flex: 1 }}><Field label="Carbos" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" suffix="g" /></View>
            <View style={{ flex: 1 }}><Field label="Grasas" value={fat} onChangeText={setFat} keyboardType="decimal-pad" suffix="g" /></View>
            <View style={{ flex: 1 }}><Field label="Fibra" value={fiber} onChangeText={setFiber} keyboardType="decimal-pad" suffix="g" /></View>
          </Row>
          {phase.food.items.length ? (
            <View style={{ gap: 6 }}>
              <T variant="label" tone="muted">Lo que vio la IA</T>
              <Row style={{ flexWrap: 'wrap' }} gap={6}>
                {phase.food.items.map((it, i) => (
                  <Chip key={i} compact label={it.grams ? `${it.name} · ${it.grams} g` : it.name} />
                ))}
              </Row>
            </View>
          ) : null}
          <MomentPicker value={moment} onChange={setMoment} />
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: space.md }}>
              <T variant="bodyMedium">Guardar en mis comidas</T>
              <T variant="caption" tone="dim">Para registrarla con un toque la próxima vez.</T>
            </View>
            <Switch value={keep} onValueChange={setKeep} trackColor={{ true: c.accent, false: c.track }} thumbColor="#FFFFFF" />
          </Row>
          <Button label="Sacar otra foto" icon="refresh-cw" variant="ghost" size="sm" onPress={() => setPhase({ kind: 'pick' })} />
        </Animated.View>
      ) : null}
    </Screen>
  );
}

/** A soft pulsing card while the AI works (usually a few seconds). */
function Analyzing() {
  const c = useColors();
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View style={[styles.analyzing, { backgroundColor: c.surface }, style]}>
      <Feather name="cpu" size={20} color={c.accent} />
      <T variant="bodyMedium">Analizando tu comida…</T>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hero: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: 260, borderRadius: radius.lg },
  analyzing: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg },
});
