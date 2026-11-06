import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { DateChip } from '@/components/DatePicker';
import { approx } from '@/components/nutrition';
import { PortionPicker } from '@/components/PortionPicker';
import { EmptyState, Loading, Screen } from '@/components/ui/layout';
import { ProgressBar } from '@/components/ui/progress';
import { Badge, Button, Card, Chip, IconButton, Row, SectionHeader, T } from '@/components/ui/primitives';
import { getMeal, logMeal, setFavorite } from '@/data/meals';
import { getGoalForDate } from '@/data/settings';
import { guessCategory, MEAL_CATEGORIES, scaleNutrition, type MealCategory } from '@/domain/nutrition';
import { todayKey } from '@/lib/dates';
import { formatDecimal, formatKcal, formatPercent, formatProtein } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useMutation, useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function MealDetailScreen() {
  const c = useColors();
  const params = useParams();
  const id = params.string('id') ?? '';
  const run = useMutation();
  const [date, setDate] = useState(params.date());
  const [portion, setPortion] = useState(1);
  const [category, setCategory] = useState<MealCategory | undefined>(params.category());
  const [saving, setSaving] = useState(false);

  const { data, loading } = useQuery(async (db) => ({ meal: await getMeal(db, id), goal: await getGoalForDate(db, date) }), [id, date]);
  const meal = data?.meal;

  if (loading && !data) return <Screen title=""><Loading variant="cards" /></Screen>;
  if (!meal) return <Screen title="Comida"><EmptyState icon="alert-circle" title="Esta comida ya no existe" /></Screen>;

  // Opened without a moment (favorites, search): today it defaults to the current moment of the day.
  const target = category ?? (date === todayKey() ? guessCategory() : meal.category);
  const scaled = scaleNutrition(meal, portion);

  const register = async () => {
    setSaving(true);
    const log = await run((db) => logMeal(db, { date, category: target, meal, portion }), {
      success: `${meal.name} registrado · ${formatKcal(scaled.calories)} kcal`,
    });
    setSaving(false);
    if (log) goBack();
  };

  return (
    <Screen
      title={meal.code ? `Opción ${meal.code}` : 'Comida'}
      right={
        <Row gap={6}>
          <IconButton
            icon="star"
            label={meal.isFavorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
            tone={meal.isFavorite ? 'weight' : 'muted'}
            onPress={() => run((db) => setFavorite(db, meal.id, !meal.isFavorite), { success: meal.isFavorite ? 'Quitada de favoritas' : 'Agregada a favoritas' })}
          />
          <IconButton icon="edit-2" label="Editar comida" onPress={() => router.push({ pathname: '/comida/editar', params: { id: meal.id } })} />
        </Row>
      }
      footer={<Button label="Registrar comida" icon="check" size="lg" loading={saving} onPress={register} />}
    >
      <Animated.View entering={FadeIn.duration(250)}>
        <Row gap={8} style={{ marginBottom: space.sm, flexWrap: 'wrap' }}>
          {meal.tag ? <Badge label={meal.tag} /> : null}
          {meal.isEstimate ? <Badge label="Valores estimados" tone="weight" /> : null}
          {meal.isCustom ? <Badge label="Personalizada" tone="muted" /> : null}
        </Row>
        <T variant="display">{meal.name}</T>
        {meal.prepMinutes !== null || meal.prepLabel ? (
          <Row gap={6} style={{ marginTop: space.sm }}>
            <Feather name="clock" size={14} color={c.textMuted} />
            <T variant="label" tone="muted">
              {[meal.prepMinutes ? `${meal.prepMinutes} min` : null, meal.prepLabel].filter(Boolean).join(' · ')}
            </T>
          </Row>
        ) : null}

        <Row style={{ marginTop: space.xl, gap: space.md }}>
          <Card style={{ flex: 1 }}>
            <T variant="caption" tone="dim">Calorías</T>
            <T variant="numberLg" tone="accent">{approx(meal.isEstimate)}{formatKcal(scaled.calories)}</T>
            <T variant="caption" tone="dim">kcal · {formatPercent(scaled.calories / (data?.goal.calories ?? 1))} del día</T>
            <ProgressBar progress={scaled.calories / (data?.goal.calories ?? 1)} color={c.accent} height={4} style={{ marginTop: space.sm }} />
          </Card>
          <Card style={{ flex: 1 }}>
            <T variant="caption" tone="dim">Proteína</T>
            <T variant="numberLg" tone="protein">{approx(meal.isEstimate)}{formatProtein(scaled.protein)}</T>
            <T variant="caption" tone="dim">g · {formatPercent(scaled.protein / (data?.goal.protein ?? 1))} del día</T>
            <ProgressBar progress={scaled.protein / (data?.goal.protein ?? 1)} color={c.protein} height={4} style={{ marginTop: space.sm }} />
          </Card>
        </Row>

        <Card style={{ marginTop: space.lg }}>
          <PortionPicker value={portion} onChange={setPortion} />
          {portion !== 1 ? (
            <T variant="caption" tone="dim" style={{ marginTop: space.sm }}>
              1× = {formatKcal(meal.calories)} kcal · {formatDecimal(meal.protein)} g de proteína
            </T>
          ) : null}
        </Card>

        <Card style={{ marginTop: space.lg }}>
          <SectionHeader title="Cuándo" />
          <Row style={{ flexWrap: 'wrap' }}>
            <DateChip value={date} onChange={setDate} />
          </Row>
          <Row style={{ flexWrap: 'wrap', marginTop: space.md }}>
            {MEAL_CATEGORIES.map((cat) => (
              <Chip key={cat.key} label={cat.short} compact selected={target === cat.key} onPress={() => setCategory(cat.key)} />
            ))}
          </Row>
        </Card>

        {meal.ingredients.length > 0 ? (
          <Card style={{ marginTop: space.lg }}>
            <SectionHeader title="Ingredientes" />
            <View style={{ gap: 10 }}>
              {meal.ingredients.map((ing, i) => (
                <Row key={i} gap={10} align="flex-start">
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent, marginTop: 7 }} />
                  <T variant="body" style={{ flex: 1 }}>{ing}</T>
                </Row>
              ))}
            </View>
          </Card>
        ) : null}

        {meal.notes ? (
          <Card style={{ marginTop: space.lg }} tone="alt">
            <Row gap={10} align="flex-start">
              <Feather name="message-circle" size={16} color={c.weight} style={{ marginTop: 2 }} />
              <T variant="label" tone="muted" style={{ flex: 1 }}>{meal.notes}</T>
            </Row>
          </Card>
        ) : null}

        <T variant="caption" tone="dim" style={{ marginTop: space.lg, textAlign: 'center' }}>
          Los valores son aproximados. Editar esta comida no cambia lo que ya registraste.
        </T>
      </Animated.View>
    </Screen>
  );
}
