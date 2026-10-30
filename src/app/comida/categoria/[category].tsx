import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MealCard } from '@/components/nutrition';
import { Field } from '@/components/ui/form';
import { EmptyState, Loading, Screen } from '@/components/ui/layout';
import { Button, Card, IconButton, Row, T } from '@/components/ui/primitives';
import { LIGHT_DINNER_GUIDE, PLAN_FOOTNOTE } from '@/data/catalog';
import { getLogsForDate, listMeals, logMeal } from '@/data/meals';
import { getGoalForDate, getProfile } from '@/data/settings';
import { categoryLabel, sumDailyTotals } from '@/domain/nutrition';
import { formatRelative } from '@/lib/dates';
import { formatKcal, formatProtein } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useMutation, useQuery } from '@/state/db';
import { space } from '@/theme/tokens';

/** Lowercase without accents, so "empanada" finds "Empanadas de carne" and "cafe" finds "Café". */
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function CategoryScreen() {
  const params = useParams();
  const category = params.category() ?? 'desayuno';
  const date = params.date();
  const run = useMutation();

  const { data } = useQuery(async (db) => {
    const [all, logs, goal, profile] = await Promise.all([listMeals(db), getLogsForDate(db, date), getGoalForDate(db, date), getProfile(db)]);
    const meals = all.filter((m) => m.category === category);
    const gaining = profile.targetWeight > profile.startWeight + 0.2;
    return { meals, others: all.filter((m) => m.category !== category), goal, gaining, bucket: sumDailyTotals(logs).byCategory[category] };
  }, [category, date]);

  const [showOthers, setShowOthers] = useState(false);
  const [query, setQuery] = useState('');
  const q = fold(query.trim());
  // While searching, every saved meal counts (this moment's first), not only this moment's.
  const found = data && q ? [...data.meals, ...data.others].filter((m) => fold(m.name).includes(q)) : null;

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

          {data.meals.length + data.others.length > 0 ? (
            <View style={{ marginBottom: space.lg }}>
              <Field icon="search" value={query} onChangeText={setQuery} placeholder="Buscar en tus comidas" returnKeyType="search" autoCorrect={false} clearButtonMode="while-editing" />
            </View>
          ) : null}

          {found ? (
            found.length === 0 ? (
              <EmptyState
                icon="search"
                title="No encontramos esa comida"
                message="Creala para registrarla con un toque, o cargala a mano."
                action={<Button label="Crear comida" icon="plus" onPress={() => router.push({ pathname: '/comida/editar', params: { category } })} />}
              />
            ) : (
              <View style={{ gap: space.md }}>
                {found.map((meal) => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    calorieTarget={data.goal.calories}
                    onPress={() => router.push({ pathname: '/comida/[id]', params: { id: meal.id, date, category } })}
                    onQuickLog={() =>
                      run((db) => logMeal(db, { date, category, meal }), { success: `${meal.name} · ${formatKcal(meal.calories)} kcal registrado` })
                    }
                  />
                ))}
              </View>
            )
          ) : null}

          {found ? null : data.meals.length === 0 ? (
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

          {!found && data.others.length > 0 ? (
            <View style={{ marginTop: space.lg, gap: space.md }}>
              <Button
                label={showOthers ? 'Ocultar comidas de otros momentos' : `Comidas de otros momentos (${data.others.length})`}
                icon={showOthers ? 'chevron-up' : 'chevron-down'}
                variant="secondary"
                onPress={() => setShowOthers(!showOthers)}
              />
              {showOthers
                ? data.others.map((meal, i) => (
                    <Animated.View key={meal.id} entering={FadeInDown.delay(Math.min(i, 8) * 25).duration(240)}>
                      <MealCard
                        meal={meal}
                        calorieTarget={data.goal.calories}
                        onPress={() => router.push({ pathname: '/comida/[id]', params: { id: meal.id, date, category } })}
                        onQuickLog={() =>
                          run((db) => logMeal(db, { date, category, meal }), { success: `${meal.name} · ${formatKcal(meal.calories)} kcal registrado` })
                        }
                      />
                    </Animated.View>
                  ))
                : null}
            </View>
          ) : null}

          {category === 'cena' && data.gaining ? (
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
