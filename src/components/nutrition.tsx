import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { ProgressBar, ProgressRing } from '@/components/ui/progress';
import { Badge, IconButton, PressableScale, Row, T } from '@/components/ui/primitives';
import type { Meal, MealLog } from '@/data/meals';
import { goalProgress, type MealCategory } from '@/domain/nutrition';
import { formatTime } from '@/lib/dates';
import { formatDecimal, formatKcal, formatPercent, formatProtein } from '@/lib/format';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import type { IconName } from '@/components/ui/primitives';

export const CATEGORY_ICONS: Record<MealCategory, IconName> = {
  desayuno: 'sunrise',
  almuerzo: 'sun',
  merienda: 'coffee',
  cena: 'moon',
  extra: 'plus-circle',
};

/** Two rings (calories + protein) with the numbers inside. Neutral wording: targets are guides. */
export function NutritionRings({ calories, protein, calorieTarget, proteinTarget, size = 132 }: {
  calories: number;
  protein: number;
  calorieTarget: number;
  proteinTarget: number;
  size?: number;
}) {
  const c = useColors();
  const kcal = goalProgress(calories, calorieTarget);
  const prot = goalProgress(protein, proteinTarget);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
      <RingStat
        progress={kcal.ratio}
        color={c.accent}
        size={size}
        label="Calorías"
        value={formatKcal(calories)}
        target={`de ${formatKcal(calorieTarget)} kcal`}
        foot={kcal.remaining > 0 ? `Faltan ${formatKcal(kcal.remaining)}` : kcal.over > 0 ? `+${formatKcal(kcal.over)} sobre el objetivo` : 'Objetivo cumplido'}
      />
      <RingStat
        progress={prot.ratio}
        color={c.protein}
        size={size}
        label="Proteína"
        value={`${formatProtein(protein)} g`}
        target={`de ${formatProtein(proteinTarget)} g`}
        foot={prot.remaining > 0 ? `Faltan ${formatProtein(prot.remaining)} g` : prot.over > 0 ? `+${formatProtein(prot.over)} g sobre el objetivo` : 'Objetivo cumplido'}
      />
    </View>
  );
}

function RingStat({ progress, color, size, label, value, target, foot }: {
  progress: number; color: string; size: number; label: string; value: string; target: string; foot: string;
}) {
  return (
    <View style={{ alignItems: 'center', gap: space.sm }}>
      <ProgressRing progress={progress} size={size} stroke={11} color={color}>
        <T variant="caption" tone="dim">{label}</T>
        <T variant="number" style={{ marginTop: 2 }}>{value}</T>
        <T variant="caption" tone="dim">{target}</T>
      </ProgressRing>
      <View style={{ alignItems: 'center' }}>
        <T variant="label" color={color}>{formatPercent(progress)}</T>
        <T variant="caption" tone="muted">{foot}</T>
      </View>
    </View>
  );
}

/** Horizontal summary bars, used where rings would be too big. */
export function NutritionBars({ calories, protein, calorieTarget, proteinTarget }: { calories: number; protein: number; calorieTarget: number; proteinTarget: number }) {
  const c = useColors();
  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="label" tone="muted">Calorías</T>
          <T variant="label"><T variant="label" style={{ fontWeight: '700' }}>{formatKcal(calories)}</T> / {formatKcal(calorieTarget)} kcal</T>
        </Row>
        <ProgressBar progress={calories / calorieTarget} color={c.accent} />
      </View>
      <View style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="label" tone="muted">Proteínas</T>
          <T variant="label">{formatProtein(protein)} / {formatProtein(proteinTarget)} g</T>
        </Row>
        <ProgressBar progress={protein / proteinTarget} color={c.protein} />
      </View>
    </View>
  );
}

export function approx(isEstimate: boolean) {
  return isEstimate ? '~' : '';
}

/** Compact catalog card: name, kcal, protein, prep time and an ingredient preview. */
export function MealCard({ meal, onPress, onQuickLog, calorieTarget }: { meal: Meal; onPress: () => void; onQuickLog?: () => void; calorieTarget?: number }) {
  const c = useColors();
  return (
    <PressableScale onPress={onPress} style={[styles.mealCard, { backgroundColor: c.surface }]} scaleTo={0.985}>
      <View style={[styles.code, { backgroundColor: c.surfaceAlt }]}>
        {meal.code ? <T variant="label" style={{ fontWeight: '700' }}>{meal.code}</T> : <Feather name="edit-3" size={14} color={c.textMuted} />}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Row gap={6}>
          <T variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{meal.name}</T>
          {meal.isFavorite ? <Feather name="star" size={13} color={c.weight} /> : null}
        </Row>
        <Row gap={10}>
          <T variant="label" tone="accent">{approx(meal.isEstimate)}{formatKcal(meal.calories)} kcal</T>
          <T variant="label" tone="protein">{approx(meal.isEstimate)}{formatDecimal(meal.protein)} g prot</T>
          {meal.prepMinutes !== null || meal.prepLabel ? (
            <Row gap={3}>
              <Feather name="clock" size={11} color={c.textDim} />
              <T variant="caption" tone="dim">{meal.prepMinutes ? `${meal.prepMinutes} min` : meal.prepLabel}</T>
            </Row>
          ) : null}
        </Row>
        {meal.ingredients.length > 0 ? (
          <T variant="caption" tone="muted" numberOfLines={1}>{meal.ingredients.join(' · ')}</T>
        ) : null}
        {calorieTarget ? <ProgressBar progress={meal.calories / calorieTarget} color={c.accent} height={3} style={{ marginTop: 4, opacity: 0.7 }} /> : null}
      </View>
      {meal.tag ? (
        <View style={{ position: 'absolute', top: 10, right: onQuickLog ? 58 : 12 }}>
          <Badge label={meal.tag} tone="accent" />
        </View>
      ) : null}
      {onQuickLog ? <IconButton icon="plus" label={`Registrar ${meal.name}`} onPress={onQuickLog} size={38} tone="accent" /> : null}
    </PressableScale>
  );
}

/** One logged entry (history/day lists). */
export function LogItem({ log, onPress, showTime = true }: { log: MealLog; onPress?: () => void; showTime?: boolean }) {
  const c = useColors();
  return (
    <PressableScale onPress={onPress} disabled={!onPress} style={styles.logItem} scaleTo={0.985}>
      <View style={{ flex: 1 }}>
        <T variant="bodyMedium" numberOfLines={1}>{log.name}</T>
        <T variant="caption" tone="dim">
          {[log.portion !== 1 ? `${formatDecimal(log.portion)}×` : null, showTime ? formatTime(log.loggedAt) : null, log.notes].filter(Boolean).join(' · ') || 'Porción normal'}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T variant="label">{approx(log.isEstimate)}{formatKcal(log.calories)} kcal</T>
        <T variant="caption" tone="protein">{formatProtein(log.protein)} g</T>
      </View>
      {onPress ? <Feather name="chevron-right" size={16} color={c.textDim} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  mealCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingRight: space.md, borderRadius: radius.lg },
  code: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  logItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10 },
});
