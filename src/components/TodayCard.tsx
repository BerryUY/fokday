import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { FokiSays, gearFor } from '@/components/mascot/Foki';
import { Card, Divider, PressableScale, Row, T } from '@/components/ui/primitives';
import { markPerfectDay } from '@/data/streak';
import { buildMissions, fokiLine, type DayState, type Mission } from '@/domain/dayPlan';
import { goToTab } from '@/lib/tabs';
import { playReward } from '@/lib/sound';
import { useDb } from '@/state/db';
import { haptic, useToast } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** The top of Inicio: Foki says how the day is going and the missions show what's left. */
export function TodayCard({ state, today, longest, onTrain }: { state: DayState; today: string; longest: number; onTrain: () => void }) {
  const c = useColors();
  const db = useDb();
  const toast = useToast();
  const missions = buildMissions(state);
  const line = fokiLine(state, missions);
  const done = missions.filter((m) => m.done).length;
  const perfect = done === missions.length;

  useEffect(() => {
    if (!perfect) return;
    void markPerfectDay(db, today).then((first) => {
      if (!first) return;
      haptic('success');
      void playReward();
      toast.show('¡Día perfecto! Completaste todo');
    });
  }, [perfect, db, today, toast]);

  const open = (m: Mission) => {
    if (m.key === 'train') return onTrain();
    if (m.key === 'meals' || m.key === 'protein') return goToTab('comidas');
    router.push('/racha');
  };

  return (
    <Card style={{ paddingVertical: space.lg }}>
      <FokiSays mood={line.mood} lit={state.streakDoneToday} gear={gearFor(longest)} bubble={c.surfaceAlt} size={70}>
        <T variant="bodyMedium">{line.text}</T>
      </FokiSays>
      <Row style={{ justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.xs }}>
        <T variant="overline" tone="dim">Tu día</T>
        <T variant="label" tone={perfect ? 'accent' : 'muted'}>{done} de {missions.length}</T>
      </Row>
      {missions.map((m, i) => (
        <View key={m.key}>
          {i > 0 ? <Divider style={{ marginLeft: 34 }} /> : null}
          <PressableScale accessibilityRole="button" accessibilityLabel={`${m.title}, ${m.detail}`} scaleTo={0.985} onPress={() => open(m)} style={styles.row}>
            <View style={[styles.check, m.done ? { backgroundColor: c.accent, borderColor: c.accent } : { borderColor: c.textDim }]}>
              {m.done ? <Feather name="check" size={14} color={c.accentText} /> : null}
            </View>
            <T variant="bodyMedium" numberOfLines={1} tone={m.done ? 'dim' : 'default'} style={{ flex: 1 }}>{m.title}</T>
            <T variant="label" tone="dim">{m.detail}</T>
          </PressableScale>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 11 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
