import { router } from 'expo-router';
import { View } from 'react-native';
import Animated, { Easing, ZoomIn } from 'react-native-reanimated';
import { Flame } from '@/components/Flame';
import { Foki, FOKI_GEAR, gearFor } from '@/components/mascot/Foki';
import { StreakWeek } from '@/components/streak';
import { ProgressBar } from '@/components/ui/progress';
import { Loading, Screen } from '@/components/ui/layout';
import { Button, Card, Row, T } from '@/components/ui/primitives';
import { getStreak, listPerfectDays } from '@/data/streak';
import { MAX_SHIELDS } from '@/domain/streak';
import { startOfWeek, todayKey } from '@/lib/dates';
import { useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** The streak up close: today's state, this week, the record and how to keep it going. */
export default function StreakScreen() {
  const c = useColors();
  const today = todayKey();
  const { data } = useQuery(async (db) => ({ streak: await getStreak(db, today), perfect: await listPerfectDays(db) }), [today]);
  if (!data) return <Screen title="Tu racha"><Loading /></Screen>;
  const s = data.streak;
  const lit = s.doneToday;
  const perfectThisWeek = data.perfect.filter((d) => d >= startOfWeek(today)).length;
  const nextGear = FOKI_GEAR.find((g) => s.longest < g.days);
  return (
    <Screen title="Tu racha">
      <View style={{ alignItems: 'center', paddingVertical: space.xl }}>
        <Animated.View entering={ZoomIn.duration(420).easing(Easing.out(Easing.cubic))} style={{ width: 148, height: 148, borderRadius: 74, alignItems: 'center', justifyContent: 'center', backgroundColor: lit ? c.streakSoft : c.surface }}>
          <Flame size={112} lit={lit} embers />
        </Animated.View>
        <T variant="hero" color={lit ? c.streak : c.text} style={{ fontSize: 72, lineHeight: 78, marginTop: space.md }}>{s.current}</T>
        <T variant="title">{s.current === 1 ? 'día de racha' : 'días de racha'}</T>
        <T variant="label" tone="muted" style={{ textAlign: 'center', marginTop: space.sm, maxWidth: 300 }}>
          {lit
            ? '¡Hoy ya sumaste! Volvé mañana para que siga creciendo.'
            : s.current > 0
              ? 'Todavía no sumaste hoy. Registrá algo antes de que termine el día para no perderla.'
              : 'Registrá algo hoy y arrancá una racha nueva.'}
        </T>
      </View>

      <Card>
        <T variant="overline" tone="dim" style={{ marginBottom: space.md }}>Esta semana</T>
        <StreakWeek streak={s} />
      </Card>

      <Row gap={space.md} style={{ marginTop: space.md }}>
        <Card tone="outline" style={{ flex: 1 }}>
          <T variant="caption" tone="dim">Tu récord</T>
          <T variant="number" color={c.streak}>{s.longest}</T>
        </Card>
        <Card tone="outline" style={{ flex: 1 }}>
          <T variant="caption" tone="dim">Protectores</T>
          <T variant="number" tone="protein">{s.shields} / {MAX_SHIELDS}</T>
        </Card>
        <Card tone="outline" style={{ flex: 1 }}>
          <T variant="caption" tone="dim">Días perfectos</T>
          <T variant="number" tone="accent">{perfectThisWeek}</T>
        </Card>
      </Row>

      <Card style={{ marginTop: space.md }}>
        <Row gap={space.lg}>
          <Foki mood={lit ? 'proud' : 'happy'} lit={lit} gear={gearFor(s.longest)} size={76} />
          <View style={{ flex: 1, gap: 6 }}>
            {nextGear ? (
              <>
                <T variant="h3">Próximo logro: {nextGear.label}</T>
                <T variant="caption" tone="muted">Foki la gana a los {nextGear.days} días de racha.</T>
                <ProgressBar progress={s.longest / nextGear.days} color={c.streak} height={6} />
              </>
            ) : (
              <>
                <T variant="h3">Foki tiene todo</T>
                <T variant="caption" tone="muted">Ganaste la vincha, la medalla y la corona.</T>
              </>
            )}
          </View>
        </Row>
      </Card>

      <Card tone="alt" style={{ marginTop: space.xl, gap: space.sm }}>
        <T variant="h3">¿Cómo suma un día?</T>
        <T variant="label" tone="muted">Alcanza con registrar una comida o un entrenamiento (gym o aeróbico). Si faltás un día, un protector te cubre; sin protectores, la racha vuelve a cero. Ganás uno cada 7 días de racha.</T>
      </Card>

      {!lit ? (
        <View style={{ gap: space.sm, marginTop: space.xl }}>
          <Button label="Foto con IA" icon="camera" size="lg" onPress={() => router.push('/comida/foto')} />
          <Button label="Entrenar" icon="activity" variant="secondary" onPress={() => router.push('/entrenar')} />
        </View>
      ) : null}
    </Screen>
  );
}
