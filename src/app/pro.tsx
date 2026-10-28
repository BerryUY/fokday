import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAccount } from '@/auth/account';
import { buy, loadPlanOptions, manageSubscription, restore, storeReady, usePlan, type PlanOption } from '@/billing/pro';
import { Screen } from '@/components/ui/layout';
import { Button, Card, PressableScale, Row, T, type IconName } from '@/components/ui/primitives';
import { useToast } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** What each plan includes; mirrors the server limits (QUOTA_DEFAULTS) and the Play listing. */
const BENEFITS: { icon: IconName; title: string; free: string; pro: string }[] = [
  { icon: 'camera', title: 'Foto con IA', free: '2 por día + extras con videos', pro: '20 por día, sin videos' },
  { icon: 'maximize', title: 'Escáner de códigos de barras', free: '1 por día + hasta 5 con videos', pro: 'Ilimitado' },
  { icon: 'message-circle', title: 'Resumen semanal con IA', free: '—', pro: 'Cómo te fue y un consejo, cada semana' },
  { icon: 'trending-up', title: 'Estadísticas avanzadas', free: '7 y 30 días', pro: '90 días, todo el historial y progresión por ejercicio' },
  { icon: 'droplet', title: 'Temas de color', free: '—', pro: '6 colores para la app' },
  { icon: 'slash', title: 'Sin videos', free: 'Videos opcionales para ganar extras', pro: 'Nunca' },
];

export default function ProScreen() {
  const c = useColors();
  const toast = useToast();
  const { account } = useAccount();
  const plan = usePlan();
  const [options, setOptions] = useState<PlanOption[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!storeReady() || !account) return;
    loadPlanOptions()
      .then((o) => {
        setOptions(o);
        setSelected(o.find((x) => x.kind === 'annual')?.id ?? o[0]?.id ?? null);
      })
      .catch(() => setOptions([]));
  }, [account]);

  const choice = options?.find((o) => o.id === selected) ?? null;

  const purchase = async () => {
    if (!choice) return;
    setBusy('buy');
    try {
      if (await buy(choice)) {
        toast.show('¡Bienvenido a FokDay Pro!');
        router.back();
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo completar la compra.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="FokDay Pro">
      <Animated.View entering={FadeInDown.duration(260)}>
        <Card style={{ gap: space.sm, alignItems: 'center', paddingVertical: space.xl }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="zap" size={30} color={c.accent} />
          </View>
          <T variant="title" style={{ textAlign: 'center' }}>{plan.pro ? 'Ya tenés Pro' : 'Más foco, menos fricción'}</T>
          <T variant="label" tone="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
            {plan.pro ? 'Gracias por bancar FokDay. Todo lo de abajo está activado.' : 'Todo lo básico es gratis para siempre. Pro suma lo que te ahorra tiempo.'}
          </T>
        </Card>
      </Animated.View>

      <View style={{ gap: space.sm, marginTop: space.lg }}>
        {BENEFITS.map((b, i) => (
          <Animated.View key={b.title} entering={FadeInDown.delay(60 + i * 40).duration(240)}>
            <Card style={{ paddingVertical: space.md }}>
              <Row gap={space.md} align="flex-start">
                <Feather name={b.icon} size={20} color={c.accent} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="bodyMedium">{b.title}</T>
                  <T variant="caption" tone="dim">Gratis: {b.free}</T>
                  <T variant="caption" tone="accent">Pro: {b.pro}</T>
                </View>
              </Row>
            </Card>
          </Animated.View>
        ))}
      </View>

      <View style={{ gap: space.sm, marginTop: space.xl }}>
        {plan.pro ? (
          <Button label="Administrar suscripción" icon="settings" variant="secondary" onPress={manageSubscription} />
        ) : !account ? (
          <>
            <T variant="caption" tone="dim" style={{ textAlign: 'center' }}>Pro queda en tu cuenta, así lo tenés en cualquier teléfono.</T>
            <Button label="Entrá con tu cuenta para suscribirte" icon="log-in" size="lg" onPress={() => router.push('/cuenta/entrar')} />
          </>
        ) : !storeReady() ? (
          <Card tone="alt">
            <T variant="label" tone="muted">Las suscripciones se activan con la publicación en Google Play. Mientras tanto, si estás en la beta, te activamos Pro gratis.</T>
          </Card>
        ) : options === null ? (
          <Button label="Cargando planes…" loading disabled onPress={() => {}} />
        ) : options.length === 0 ? (
          <Card tone="alt">
            <T variant="label" tone="muted">No pudimos cargar los planes. Revisá tu conexión y volvé a abrir esta pantalla.</T>
          </Card>
        ) : (
          <>
            {options.map((o) => {
              const on = o.id === selected;
              return (
                <PressableScale
                  key={o.id}
                  onPress={() => setSelected(o.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={{ borderRadius: radius.lg, borderWidth: 2, borderColor: on ? c.accent : c.border, backgroundColor: c.surface, padding: space.lg }}
                >
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View>
                      <T variant="h3">{o.kind === 'annual' ? 'Anual' : 'Mensual'}</T>
                      <T variant="caption" tone="dim">{o.kind === 'annual' ? `${o.perMonth ? `${o.perMonth} por mes · ` : ''}el mejor precio` : 'Cancelás cuando quieras'}</T>
                    </View>
                    <T variant="number">{o.price}</T>
                  </Row>
                </PressableScale>
              );
            })}
            <Button label="Suscribirme" icon="zap" size="lg" loading={busy === 'buy'} disabled={!choice} onPress={purchase} />
            <T variant="caption" tone="dim" style={{ textAlign: 'center' }}>
              Se cobra con tu cuenta de Google Play y se renueva sola. Cancelás cuando quieras desde Google Play, sin perder tus datos.
            </T>
          </>
        )}
        {account && storeReady() && !plan.pro ? (
          <Button
            label="Restaurar compras"
            variant="ghost"
            size="sm"
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
      </View>
    </Screen>
  );
}
