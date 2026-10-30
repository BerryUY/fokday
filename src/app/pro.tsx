import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAccount } from '@/auth/account';
import { buy, loadPlanOptions, manageSubscription, PRO_LIST_PRICES, restore, storeReady, usePlan, type PlanOption } from '@/billing/pro';
import { Screen } from '@/components/ui/layout';
import { Badge, Button, Card, PressableScale, Row, T, type IconName } from '@/components/ui/primitives';
import { useToast } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** What each plan includes; mirrors the server limits (QUOTA_DEFAULTS) and the Play listing. */
const BENEFITS: { icon: IconName; title: string; free: string; pro: string }[] = [
  { icon: 'camera', title: 'Foto con IA', free: '1 por día + 1 más mirando un video', pro: '20 por día, con prioridad y el modelo más preciso' },
  { icon: 'maximize', title: 'Escáner de códigos de barras', free: '1 por día + hasta 5 con videos', pro: 'Ilimitado' },
  { icon: 'message-circle', title: 'Resumen semanal con IA', free: '—', pro: 'Tu semana, tu progreso y un plan concreto' },
  { icon: 'trending-up', title: 'Estadísticas avanzadas', free: '7 y 30 días', pro: '90 días, todo el historial y progresión por ejercicio' },
  { icon: 'droplet', title: 'Temas de color', free: '—', pro: '6 colores para la app' },
  { icon: 'slash', title: 'Sin publicidad', free: 'Videos opcionales para ganar extras', pro: 'Ningún anuncio' },
];

/** The plans with list prices, until the store's local prices load. */
type Shown = { id: string; kind: 'monthly' | 'annual'; price: string; perMonth: string | null; option: PlanOption | null };
const LIST: Shown[] = [
  { id: 'annual', kind: 'annual', price: PRO_LIST_PRICES.annual, perMonth: PRO_LIST_PRICES.annualPerMonth, option: null },
  { id: 'monthly', kind: 'monthly', price: PRO_LIST_PRICES.monthly, perMonth: null, option: null },
];

export default function ProScreen() {
  const c = useColors();
  const toast = useToast();
  const { account } = useAccount();
  const plan = usePlan();
  const [options, setOptions] = useState<PlanOption[] | null>(null);
  const [selected, setSelected] = useState<string>('annual');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!storeReady() || !account) return;
    loadPlanOptions()
      .then((o) => {
        setOptions(o);
        setSelected(o.find((x) => x.kind === 'annual')?.id ?? o[0]?.id ?? 'annual');
      })
      .catch(() => setOptions([]));
  }, [account]);

  const shown: Shown[] = options?.length
    ? [...options].sort((a) => (a.kind === 'annual' ? -1 : 1)).map((o) => ({ id: o.id, kind: o.kind, price: o.price, perMonth: o.perMonth, option: o }))
    : LIST;
  const choice = shown.find((o) => o.id === selected) ?? shown[0];
  const canBuy = !!account && storeReady() && !!choice.option;

  const purchase = async () => {
    if (!choice.option) return;
    setBusy('buy');
    try {
      if (await buy(choice.option)) {
        toast.show('¡Bienvenido a FokDay Pro!');
        router.back();
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo completar la compra.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const footer = plan.pro ? (
    <Button label="Administrar suscripción" icon="settings" variant="secondary" onPress={manageSubscription} />
  ) : !account ? (
    <Button label="Iniciá sesión para suscribirte" icon="log-in" size="lg" onPress={() => router.push('/cuenta/entrar')} />
  ) : canBuy ? (
    <Button label={`Suscribirme · ${choice.price}`} icon="zap" size="lg" loading={busy === 'buy'} onPress={purchase} />
  ) : (
    <Button label={options === null && storeReady() ? 'Cargando planes…' : 'Muy pronto en Google Play'} icon="zap" size="lg" disabled loading={options === null && storeReady()} onPress={() => {}} />
  );

  return (
    <Screen title="FokDay Pro" footer={footer}>
      <Animated.View entering={FadeInDown.duration(260)}>
        <Card tone="accent" style={{ gap: space.sm, alignItems: 'center', paddingVertical: space.xl }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="zap" size={30} color={c.accentText} />
          </View>
          <T variant="title" style={{ textAlign: 'center' }}>{plan.pro ? 'Ya tenés Pro' : 'Más foco, menos fricción'}</T>
          <T variant="label" tone="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
            {plan.pro ? 'Gracias por bancar FokDay. Todo lo de abajo está activado.' : 'Todo lo básico es gratis para siempre. Pro suma lo que te ahorra tiempo y te hace avanzar más rápido.'}
          </T>
          {!plan.pro ? (
            <T variant="h2" tone="accent" style={{ marginTop: space.xs }}>{PRO_LIST_PRICES.monthly} por mes</T>
          ) : null}
        </Card>
      </Animated.View>

      {!plan.pro ? (
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {shown.map((o) => {
            const on = o.id === choice.id;
            return (
              <PressableScale
                key={o.id}
                onPress={() => setSelected(o.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={{ borderRadius: radius.lg, borderWidth: 2, borderColor: on ? c.accent : c.border, backgroundColor: c.surface, padding: space.lg }}
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row gap={space.sm}>
                      <T variant="h3">{o.kind === 'annual' ? 'Anual' : 'Mensual'}</T>
                      {o.kind === 'annual' ? <Badge label="3 meses gratis" /> : null}
                    </Row>
                    <T variant="caption" tone="dim">{o.kind === 'annual' ? `${o.perMonth ? `${o.perMonth} por mes · ` : ''}se cobra una vez al año` : 'Cancelás cuando quieras'}</T>
                  </View>
                  <T variant="number">{o.price}</T>
                </Row>
              </PressableScale>
            );
          })}
          <T variant="caption" tone="dim" style={{ textAlign: 'center' }}>
            {canBuy
              ? 'Se cobra con tu cuenta de Google Play y se renueva sola. Cancelás cuando quieras desde Google Play, sin perder tus datos.'
              : account && !storeReady()
                ? 'Las suscripciones se activan con la publicación en Google Play. Si estás en la beta, te activamos Pro gratis.'
                : 'Pro queda en tu cuenta, así lo tenés en cualquier teléfono.'}
          </T>
        </View>
      ) : null}

      <T variant="overline" tone="dim" style={{ marginTop: space.xl, marginBottom: space.sm }}>Qué incluye</T>
      <View style={{ gap: space.sm }}>
        {BENEFITS.map((b, i) => (
          <Animated.View key={b.title} entering={FadeInDown.delay(60 + i * 40).duration(240)}>
            <Card style={{ paddingVertical: space.md }}>
              <Row gap={space.md} align="flex-start">
                <Feather name={b.icon} size={20} color={c.accent} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="bodyMedium">{b.title}</T>
                  <T variant="caption" tone="accent">Pro: {b.pro}</T>
                  <T variant="caption" tone="dim">Gratis: {b.free}</T>
                </View>
              </Row>
            </Card>
          </Animated.View>
        ))}
      </View>

      {account && storeReady() && !plan.pro ? (
        <Button
          label="Restaurar compras"
          variant="ghost"
          size="sm"
          style={{ marginTop: space.md }}
          loading={busy === 'restore'}
          onPress={async () => {
            setBusy('restore');
            try {
              toast.show((await restore()) ? 'Pro restaurado' : 'No encontramos compras en esta cuenta de Google', 'info');
            } finally {
              setBusy(null);
            }
          }}
        />
      ) : null}
    </Screen>
  );
}
