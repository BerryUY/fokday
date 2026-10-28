import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';
import { cloudApi } from '@/backup/api';
import { usePro } from '@/billing/pro';
import { ProLock } from '@/components/ProGate';
import { Button, Card, Row, T } from '@/components/ui/primitives';
import { getGoalForDate, getProfile, getSetting, setSetting } from '@/data/settings';
import { getGymStats, getNutritionStats } from '@/data/stats';
import { listWeights } from '@/data/weight';
import { buildWeekInput, weekKey } from '@/domain/weeklySummary';
import { addDays, todayKey } from '@/lib/dates';
import { useCloudConfig } from '@/state/cloud';
import { useDb, useQuery } from '@/state/db';
import { useToast } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/**
 * Pro: a short AI read of the last 7 days and one tip. Made on request and kept for the
 * week (settings 'summary.week' / 'summary.text'), so it never runs on its own.
 */
export function WeeklySummaryCard({ showLock = false }: { showLock?: boolean }) {
  const c = useColors();
  const db = useDb();
  const toast = useToast();
  const pro = usePro();
  const { config } = useCloudConfig();
  const [busy, setBusy] = useState(false);
  const today = todayKey();
  const week = weekKey(today);
  const { data, reload } = useQuery(async (d) => {
    const [savedWeek, text] = await Promise.all([getSetting(d, 'summary.week'), getSetting(d, 'summary.text')]);
    return { text: savedWeek === week ? text : null };
  }, [week]);

  if (!pro) return showLock ? <ProLock title="Resumen semanal con IA" message="Cada semana, cómo te fue con la comida, el gym y el peso, y un consejo concreto para la próxima." /> : null;

  const make = async () => {
    if (!config) {
      toast.show('Entrá con tu cuenta para armar el resumen.', 'info');
      return;
    }
    setBusy(true);
    try {
      const [nutrition, gym, weights, profile, goal] = await Promise.all([
        getNutritionStats(db, '7d', today),
        getGymStats(db, '7d', today),
        listWeights(db),
        getProfile(db),
        getGoalForDate(db, today),
      ]);
      const from = addDays(today, -6);
      const input = buildWeekInput({
        daysLogged: nutrition.daysLogged,
        avgCalories: nutrition.avgCalories,
        avgProtein: nutrition.avgProtein,
        proteinGoalDays: nutrition.proteinGoalDays,
        calorieGoal: goal.calories,
        proteinGoal: goal.protein,
        gymDays: gym.attendanceInRange,
        plannedGymDays: gym.scheduledDays.length,
        weights: weights.filter((w) => w.date >= from && w.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1)),
        startWeight: profile.startWeight,
        targetWeight: profile.targetWeight,
      });
      const { text } = await cloudApi.weeklySummary(config, input);
      await setSetting(db, 'summary.week', week);
      await setSetting(db, 'summary.text', text);
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No pudimos armar el resumen.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: space.md }}>
      <Row gap={space.sm}>
        <Feather name="message-circle" size={18} color={c.accent} />
        <T variant="h3" style={{ flex: 1 }}>Tu semana</T>
      </Row>
      {data?.text ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <T variant="body">{data.text}</T>
        </Animated.View>
      ) : (
        <>
          <T variant="label" tone="muted">Un resumen de tus últimos 7 días con un consejo para la semana que viene.</T>
          <Button label="Armar mi resumen" icon="zap" size="sm" loading={busy} onPress={make} />
        </>
      )}
    </Card>
  );
}
