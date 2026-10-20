import { router } from 'expo-router';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MealCard } from '@/components/nutrition';
import { EmptyState, Loading, Screen } from '@/components/ui/layout';
import { Button, Card, IconBubble, IconButton, Row, T } from '@/components/ui/primitives';
import { CATEGORY_GUIDANCE, LIGHT_DINNER_GUIDE, PLAN_FOOTNOTE } from '@/data/catalog';
import { getLogsForDate, listMeals, logMeal } from '@/data/meals';
import { getGoalForDate } from '@/data/settings';
import { categoryLabel, sumDailyTotals } from '@/domain/nutrition';
import { formatRelative } from '@/lib/dates';
import { formatKcal, formatProtein } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useMutation, useQuery } from '@/state/db';
import { space } from '@/theme/tokens';

export default function CategoryScreen() {
  const params = useParams();
  const category = params.category() ?? 'desayuno';
  const date = params.date();
  const run = useMutation();

  const { data } = useQuery(async (db) => {
    const [meals, logs, goal] = await Promise.all([listMeals(db, { category }), getLogsForDate(db, date), getGoalForDate(db, date)]);
    return { meals, goal, bucket: sumDailyTotals(logs).byCategory[category] };
  }, [category, date]);

  const guidance = CATEGORY_GUIDANCE[category];

  return (
    <Screen
      title={categoryLabel(category)}
      subtitle={formatRelative(date)}
      right={
        <IconButton
          icon="plus"
          label="Crear comida"
          onPress={() => router.push({ pathname: '/comida/editar', params: { category } })}
        />
      }
    >
      {!data ? (
        <Loading />
      ) : (
        <>
          {data.bucket.entries > 0 ? (
            <Card tone="accent" style={{ marginBottom: space.lg, paddingVertical: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="label">Ya registraste {data.bucket.entries} {data.bucket.entries === 1 ? 'comida' : 'comidas'}</T>
                <T variant="label" tone="accent">{formatKcal(data.bucket.calories)} kcal · {formatProtein(data.bucket.protein)} g</T>
              </Row>
            </Card>
          ) : null}

          {guidance ? (
            <Card style={{ marginBottom: space.lg }}>
              <Row align="flex-start" gap={space.md}>
                <IconBubble icon="info" tone="weight" size={32} />
                <T variant="label" tone="muted" style={{ flex: 1 }}>{guidance}</T>
              </Row>
            </Card>
          ) : null}

          {data.meals.length === 0 ? (
            <EmptyState
              icon="book-open"
              title="No hay comidas en esta categoría"
              message="Creá tus propias opciones para registrarlas con un toque."
              action={<Button label="Crear comida" icon="plus" onPress={() => router.push({ pathname: '/comida/editar', params: { category } })} />}
            />
          ) : (
            <View style={{ gap: space.md }}>
              {data.meals.map((meal, i) => (
                <Animated.View key={meal.id} entering={FadeInDown.delay(30 * i).duration(300)}>
                  <MealCard
                    meal={meal}
                    calorieTarget={data.goal.calories}
                    onPress={() => router.push({ pathname: '/comida/[id]', params: { id: meal.id, date, category } })}
                    onQuickLog={() =>
                      run((db) => logMeal(db, { date, category, meal }), { success: `${meal.name} · ${formatKcal(meal.calories)} kcal registrado` })
                    }
                  />
                </Animated.View>
              ))}
            </View>
          )}

          {category === 'cena' ? (
            <Card style={{ marginTop: space.lg }}>
              <T variant="h3">{LIGHT_DINNER_GUIDE.title}</T>
              <T variant="label" tone="muted" style={{ marginTop: 4 }}>{LIGHT_DINNER_GUIDE.description}</T>
              <T variant="label" tone="weight" style={{ marginTop: space.sm }}>{LIGHT_DINNER_GUIDE.tip}</T>
              <Button
                label="Registrar una cena distinta"
                icon="edit-3"
                variant="secondary"
                style={{ marginTop: space.lg }}
                onPress={() => router.push({ pathname: '/comida/manual', params: { date, category: 'cena' } })}
              />
            </Card>
          ) : (
            <Button
              label="Registrar algo distinto"
              icon="edit-3"
              variant="ghost"
              style={{ marginTop: space.lg }}
              onPress={() => router.push({ pathname: '/comida/manual', params: { date, category } })}
            />
          )}

          <T variant="caption" tone="dim" style={{ marginTop: space.lg, textAlign: 'center' }}>{PLAN_FOOTNOTE}</T>
        </>
      )}
    </Screen>
  );
}
