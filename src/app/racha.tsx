import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { StreakWeek } from '@/components/streak';
import { Loading, Screen } from '@/components/ui/layout';
import { Button, Card, Row, T } from '@/components/ui/primitives';
import { getStreak } from '@/data/streak';
import { todayKey } from '@/lib/dates';
import { useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** The streak up close: today's state, this week, the record and how to keep it going. */
export default function StreakScreen() {
  const c = useColors();
  const today = todayKey();
  const { data: s } = useQuery((db) => getStreak(db, today), [today]);
  if (!s) return <Screen title="Tu racha"><Loading /></Screen>;
  const lit = s.doneToday;
  return (
    <Screen title="Tu racha">
      <View style={{ alignItems: 'center', paddingVertical: space.xl }}>
        <Animated.View entering={ZoomIn.springify().damping(12)} style={{ width: 148, height: 148, borderRadius: 74, alignItems: 'center', justifyContent: 'center', backgroundColor: lit ? c.streakSoft : c.surface }}>
          <MaterialCommunityIcons name="fire" size={96} color={lit ? c.streak : c.textDim} />
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
          <T variant="caption" tone="dim">Racha actual</T>
          <T variant="number">{s.current}</T>
        </Card>
        <Card tone="outline" style={{ flex: 1 }}>
          <T variant="caption" tone="dim">Tu récord</T>
          <T variant="number" color={c.streak}>{s.longest}</T>
        </Card>
      </Row>

      <Card tone="alt" style={{ marginTop: space.xl, gap: space.sm }}>
        <T variant="h3">¿Cómo suma un día?</T>
        <T variant="label" tone="muted">Alcanza con registrar una comida, tu peso, un entrenamiento o una caminata. Si pasa un día entero sin nada, la racha vuelve a cero.</T>
      </Card>

      {!lit ? (
        <View style={{ gap: space.sm, marginTop: space.xl }}>
          <Button label="Foto con IA" icon="camera" size="lg" onPress={() => router.push('/comida/foto')} />
          <Button label="Registrar mi peso" icon="trending-down" variant="secondary" onPress={() => router.push('/peso/registrar')} />
        </View>
      ) : null}
    </Screen>
  );
}
