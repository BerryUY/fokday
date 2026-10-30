import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ApiError, cloudApi, type BarcodeProduct } from '@/backup/api';
import { refreshPlan, setQuota, usePlan } from '@/billing/pro';
import { MomentPicker } from '@/components/MomentPicker';
import { left, QuotaCard } from '@/components/QuotaCard';
import { Field } from '@/components/ui/form';
import { Screen } from '@/components/ui/layout';
import { Button, Card, Chip, Row, T } from '@/components/ui/primitives';
import { logMeal, saveMeal } from '@/data/meals';
import { guessCategory, type Extras, type MealCategory } from '@/domain/nutrition';
import { formatDecimal, formatKcal, formatNumber, parsePositive } from '@/lib/format';
import { goBack } from '@/lib/nav';
import { useParams } from '@/lib/params';
import { useCloudConfig } from '@/state/cloud';
import { useMutation } from '@/state/db';
import { haptic, useToast } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Values for the amount eaten, from Open Food Facts' per-100 g numbers. */
function scaled(p: BarcodeProduct, grams: number) {
  const f = grams / 100;
  const opt = (v: number | null) => (v === null ? null : round1(v * f));
  return { calories: Math.round(p.per100g.calories * f), protein: round1(p.per100g.protein * f), carbs: opt(p.per100g.carbs), fat: opt(p.per100g.fat), fiber: opt(p.per100g.fiber) };
}

/** Barcode → packaged food (Open Food Facts) → amount eaten → log. */
export default function ScanScreen() {
  const c = useColors();
  const toast = useToast();
  const run = useMutation();
  const date = useParams().date();
  const { config, loading } = useCloudConfig();
  const plan = usePlan();
  const out = left(plan.barcode) === 0;
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [camera, setCamera] = useState(false);
  const [typed, setTyped] = useState('');
  const [grams, setGrams] = useState('100');
  const [moment, setMoment] = useState<MealCategory>(guessCategory());
  const [keep, setKeep] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  useEffect(() => {
    if (config) void refreshPlan();
  }, [config]);

  const lookup = async (code: string) => {
    if (!config || looking) return;
    setCamera(false);
    setLooking(true);
    setNotFound(null);
    try {
      const res = await cloudApi.lookupBarcode(config, code);
      setQuota('barcode', res.barcode);
      haptic('success');
      setProduct(res.product);
      setGrams(String(res.product.servingGrams ?? 100));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(code);
      else {
        if (e instanceof ApiError && e.status === 429) void refreshPlan();
        toast.show(e instanceof Error ? e.message : 'No pudimos buscar el producto.', 'error');
      }
    } finally {
      setLooking(false);
      handled.current = false;
    }
  };

  // The system scanner (Google code scanner) needs no camera screen; results arrive here.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = CameraView.onModernBarcodeScanned((r) => {
      if (handled.current) return;
      handled.current = true;
      void lookup(r.data);
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const scan = async () => {
    setProduct(null);
    setNotFound(null);
    if (Platform.OS !== 'web' && CameraView.isModernBarcodeScannerAvailable) {
      await CameraView.launchScanner({ barcodeTypes: [...BARCODE_TYPES] }).catch(() => setCamera(true));
      return;
    }
    if (!permission?.granted && !(await requestPermission()).granted) {
      toast.show('Necesitamos permiso para usar la cámara. También podés escribir el número.', 'error');
      return;
    }
    setCamera(true);
  };

  const g = parsePositive(grams);
  const values = product && g ? scaled(product, g) : null;

  const save = async () => {
    if (!product || !values) return;
    setSaving(true);
    const name = product.brand ? `${product.name} (${product.brand})` : product.name;
    const extras: Extras = { carbs: values.carbs ?? 0, fat: values.fat ?? 0, fiber: values.fiber ?? 0 };
    const ok = await run(
      async (db) => {
        if (keep) await saveMeal(db, { name, category: moment, calories: values.calories, protein: values.protein, isEstimate: false, ingredients: [`${formatNumber(g!)} g`], extras });
        return logMeal(db, { date, category: moment, manual: { name, calories: values.calories, protein: values.protein, extras } });
      },
      { success: `${product.name} registrado · ${formatKcal(values.calories)} kcal` },
    );
    setSaving(false);
    if (ok) goBack();
  };

  if (!loading && !config) {
    return (
      <Screen title="Escanear código">
        <Card style={{ padding: space.xl, gap: space.md }}>
          <Feather name="maximize" size={28} color={c.accent} />
          <T variant="h2">Iniciá sesión</T>
          <T variant="body" tone="muted">El escáner busca el producto en una base abierta de alimentos desde el servidor de FokDay, así que necesitás una cuenta (Google o email, es gratis).</T>
          <Button label="Iniciar sesión o crear cuenta" icon="log-in" onPress={() => router.push('/cuenta/entrar')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Escanear código" footer={product && values ? <Button label="Registrar" icon="check" size="lg" onPress={save} loading={saving} /> : undefined}>
      {camera ? (
        <View style={{ gap: space.md }}>
          <View style={[styles.camera, { backgroundColor: c.surfaceAlt }]}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={(r) => {
                if (handled.current) return;
                handled.current = true;
                void lookup(r.data);
              }}
            />
          </View>
          <Button label="Cancelar" variant="danger" onPress={() => setCamera(false)} />
        </View>
      ) : null}

      {!camera && !product ? (
        <Animated.View entering={FadeIn.duration(220)} style={{ gap: space.md }}>
          <Card style={{ padding: space.xl, alignItems: 'center', gap: space.sm }}>
            <View style={[styles.hero, { backgroundColor: c.accentSoft }]}>
              <Feather name="maximize" size={34} color={c.accent} />
            </View>
            <T variant="h2" style={{ textAlign: 'center', marginTop: space.sm }}>Escaneá el paquete</T>
            <T variant="body" tone="muted" style={{ textAlign: 'center' }}>Traemos calorías, proteína y más por 100 g. Vos ponés cuánto comiste.</T>
          </Card>
          {out ? <QuotaCard kind="barcode" /> : null}
          <Button label="Escanear código de barras" icon="maximize" size="lg" loading={looking} disabled={out} onPress={() => void scan()} />
          <Row gap={space.sm} align="flex-end">
            <View style={{ flex: 1 }}>
              <Field label="O escribí el número" value={typed} onChangeText={(v) => setTyped(v.replace(/\D/g, '').slice(0, 14))} placeholder="7790310984147" keyboardType="number-pad" />
            </View>
            <Button label="Buscar" variant="secondary" disabled={out || typed.length < 8 || looking} onPress={() => void lookup(typed)} />
          </Row>
          {!out ? <QuotaCard kind="barcode" /> : null}
          {notFound ? (
            <Card tone="alt" style={{ gap: space.sm }}>
              <T variant="label" tone="muted">No encontramos el código {notFound} en la base de alimentos. No se te descontó el escaneo.</T>
              <Button label="Cargarlo a mano" icon="edit-3" variant="secondary" size="sm" onPress={() => router.replace({ pathname: '/comida/manual', params: { date } })} />
            </Card>
          ) : null}
          <T variant="caption" tone="dim" style={{ textAlign: 'center' }}>Datos de Open Food Facts, una base abierta y colaborativa.</T>
        </Animated.View>
      ) : null}

      {product ? (
        <Animated.View entering={FadeIn.duration(260)} style={{ gap: space.lg }}>
          <Card style={{ gap: 4 }}>
            <T variant="h2">{product.name}</T>
            {product.brand ? <T variant="label" tone="muted">{product.brand}</T> : null}
            <T variant="caption" tone="dim">
              Cada 100 g: {formatNumber(product.per100g.calories)} kcal · {formatDecimal(product.per100g.protein)} g de proteína
            </T>
          </Card>
          <View style={{ gap: space.sm }}>
            <Field label="¿Cuánto comiste?" value={grams} onChangeText={setGrams} keyboardType="decimal-pad" suffix="g" error={grams && !g ? 'Inválido' : null} />
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {product.servingGrams ? <Chip label={`1 porción (${product.servingGrams} g)`} compact selected={g === product.servingGrams} onPress={() => setGrams(String(product.servingGrams))} /> : null}
              {[30, 50, 100, 200].map((n) => <Chip key={n} label={`${n} g`} compact selected={g === n} onPress={() => setGrams(String(n))} />)}
            </Row>
          </View>
          {values ? (
            <Card tone="alt" style={{ gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="numberLg" tone="accent">{formatNumber(values.calories)}</T>
                <T variant="label" tone="muted">kcal</T>
              </Row>
              <T variant="label" tone="muted">
                {formatDecimal(values.protein)} g proteína
                {values.carbs !== null ? ` · ${formatDecimal(values.carbs)} g carbos` : ''}
                {values.fat !== null ? ` · ${formatDecimal(values.fat)} g grasa` : ''}
                {values.fiber !== null ? ` · ${formatDecimal(values.fiber)} g fibra` : ''}
              </T>
            </Card>
          ) : null}
          <MomentPicker value={moment} onChange={setMoment} />
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="bodyMedium" style={{ flex: 1 }}>Guardar en mis comidas</T>
            <Switch value={keep} onValueChange={setKeep} trackColor={{ true: c.accent, false: c.track }} thumbColor="#FFFFFF" />
          </Row>
          <Button label="Escanear otro" icon="maximize" variant="ghost" size="sm" disabled={out} onPress={() => void scan()} />
        </Animated.View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  camera: { width: '100%', aspectRatio: 0.9, borderRadius: radius.lg, overflow: 'hidden' },
});
