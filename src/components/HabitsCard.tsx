import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MOTION } from '@/components/ui/motion';
import { Card, PressableScale, Row, T } from '@/components/ui/primitives';
import { addWater, creatineStreak, getHabits, setCreatine } from '@/data/habits';
import { formatLiters } from '@/lib/format';
import { useMutation, useQuery } from '@/state/db';
import { useFeatures } from '@/state/features';
import { playReward } from '@/lib/sound';
import { haptic } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const GLASS_ML = 250;

/**
 * Water and creatine for the day, every day (training or rest). One tap per glass,
 * one tap for the creatine; each part shows only if the person turned it on.
 */
export function HabitsCard({ date }: { date: string }) {
  const { has, waterGoalMl } = useFeatures();
  const showWater = has('water');
  const showCreatine = has('creatine');
  const { data } = useQuery(async (db) => ({ habits: await getHabits(db, date), streak: await creatineStreak(db, date) }), [date]);
  if (!showWater && !showCreatine) return null;
  const habits = data?.habits ?? { creatine: false, waterMl: 0 };

  return (
    <Card style={{ gap: space.lg }}>
      <T variant="overline" tone="dim">Hábitos de hoy</T>
      {showWater ? <Water date={date} ml={habits.waterMl} goal={waterGoalMl} /> : null}
      {showCreatine ? <Creatine date={date} taken={habits.creatine} streak={data?.streak ?? 0} /> : null}
    </Card>
  );
}

function Water({ date, ml, goal }: { date: string; ml: number; goal: number }) {
  const c = useColors();
  const run = useMutation();
  const glasses = Math.max(1, Math.round(goal / GLASS_ML));
  const filled = Math.min(glasses, Math.floor(ml / GLASS_ML));
  const reached = ml >= goal;

  // Tapping glass n fills up to it; tapping the last filled one empties it.
  const tap = (i: number) => {
    haptic('light');
    const target = i + 1 === filled ? i * GLASS_ML : (i + 1) * GLASS_ML;
    void run((db) => addWater(db, date, target - ml), { silent: true });
  };

  return (
    <View style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={8}>
          <MaterialCommunityIcons name="water" size={20} color={c.protein} />
          <T variant="h3">{formatLiters(ml)} L</T>
          <T variant="label" tone="dim">de {formatLiters(goal)} L</T>
        </Row>
        {reached ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <T variant="label" tone="protein">¡Meta cumplida!</T>
          </Animated.View>
        ) : null}
      </Row>
      {/* Looks like a wrap, but with explicit rows: the height never depends on how a row happens to wrap. */}
      <View style={{ gap: 6 }}>
        {glassRows(glasses).map((row) => (
          <View key={row[0]} style={styles.glasses}>
            {row.map((i) => (
              <Glass key={i} full={i < filled} onPress={() => tap(i)} />
            ))}
            {/* The last row keeps the width of the others. */}
            {glasses > PER_ROW ? Array.from({ length: PER_ROW - row.length }, (_, i) => <View key={i} style={styles.spacer} />) : null}
          </View>
        ))}
      </View>
      <T variant="caption" tone="dim">Cada vaso son 250 ml. Tocá para sumar o quitar.</T>
    </View>
  );
}

const PER_ROW = 8;

/** Rows of eight glasses that fill the width; the last one has whatever is left. */
function glassRows(total: number): number[][] {
  return Array.from({ length: Math.ceil(total / PER_ROW) }, (_, r) => Array.from({ length: Math.min(PER_ROW, total - r * PER_ROW) }, (_, i) => r * PER_ROW + i));
}

function Glass({ full, onPress }: { full: boolean; onPress: () => void }) {
  const c = useColors();
  const level = useSharedValue(full ? 1 : 0);
  useEffect(() => {
    level.value = withTiming(full ? 1 : 0, MOTION.enter);
  }, [full, level]);
  const water = useAnimatedStyle(() => ({ height: `${level.value * 100}%` }));
  return (
    <PressableScale onPress={onPress} scaleTo={0.9} accessibilityRole="button" accessibilityLabel={full ? 'Vaso tomado' : 'Sumar un vaso'} style={[styles.glass, { borderColor: full ? c.protein : c.border }]}>
      <Animated.View style={[styles.water, { backgroundColor: c.proteinSoft }, water]} />
      <MaterialCommunityIcons name={full ? 'cup-water' : 'cup-outline'} size={18} color={full ? c.protein : c.textDim} />
    </PressableScale>
  );
}

function Creatine({ date, taken, streak }: { date: string; taken: boolean; streak: number }) {
  const c = useColors();
  const run = useMutation();
  const fill = useSharedValue(taken ? 1 : 0);
  useEffect(() => {
    fill.value = withTiming(taken ? 1 : 0, MOTION.enter);
  }, [taken, fill]);
  const bg = useAnimatedStyle(() => ({ opacity: fill.value }));
  const check = useAnimatedStyle(() => ({ transform: [{ scale: 0.6 + fill.value * 0.4 }], opacity: fill.value }));

  return (
    <PressableScale
      onPress={() => {
        haptic(taken ? 'light' : 'success');
        if (!taken) void playReward();
        void run((db) => setCreatine(db, date, !taken), { silent: true });
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: taken }}
      accessibilityLabel="Creatina de hoy"
      style={[styles.creatine, { borderColor: taken ? c.accent : c.border }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.accent, borderRadius: radius.lg }, bg]} />
      <View style={[styles.circle, { borderColor: taken ? c.accentText : c.accent }]}>
        <Animated.View style={check}>
          <Feather name="check" size={18} color={c.accentText} />
        </Animated.View>
      </View>
      <View style={{ flex: 1 }}>
        <T variant="bodyMedium" color={taken ? c.accentText : c.text}>{taken ? 'Creatina tomada' : '¿Tomaste la creatina?'}</T>
        <T variant="caption" color={taken ? c.accentText : c.textDim}>
          {streak > 1 ? `${streak} días seguidos` : taken ? '¡Bien!' : 'Tocá cuando la tomes'}
        </T>
      </View>
      {streak > 1 ? <MaterialCommunityIcons name="fire" size={22} color={taken ? c.accentText : c.weight} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  glasses: { flexDirection: 'row', gap: 6 },
  glass: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  // Same border as a glass, so the glasses of the last row measure the same.
  spacer: { flex: 1, borderWidth: 1.5, borderColor: 'transparent' },
  water: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  creatine: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5, overflow: 'hidden' },
  circle: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
