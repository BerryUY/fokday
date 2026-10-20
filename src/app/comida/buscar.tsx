import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { MealCard } from '@/components/nutrition';
import { Field } from '@/components/ui/form';
import { EmptyState, Screen } from '@/components/ui/layout';
import { Button, Chip, Row, T } from '@/components/ui/primitives';
import { listMeals, logMeal } from '@/data/meals';
import { categoryLabel, MEAL_CATEGORIES } from '@/domain/nutrition';
import { formatKcal } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useMutation, useQuery } from '@/state/db';
import { space } from '@/theme/tokens';

export default function SearchMealsScreen() {
  const date = useParams().date();
  const run = useMutation();
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(false);
  const { data: meals } = useQuery((db) => listMeals(db, { search: query, favoritesOnly: favorites }), [query, favorites]);

  return (
    <Screen title="Buscar comida">
      <Field value={query} onChangeText={setQuery} placeholder="Nombre o ingrediente (ej.: avena, pollo)" autoFocus returnKeyType="search" />
      <Row style={{ marginTop: space.md, marginBottom: space.lg }}>
        <Chip label="Solo favoritas" icon="star" tone="weight" selected={favorites} onPress={() => setFavorites(!favorites)} />
      </Row>
      {meals && meals.length === 0 ? (
        <EmptyState
          icon="search"
          title="Sin resultados"
          message={query ? `No encontramos “${query}”.` : 'Todavía no marcaste favoritas.'}
          action={<Button label="Crear comida" icon="plus" variant="secondary" onPress={() => router.push({ pathname: '/comida/editar', params: {} })} />}
        />
      ) : (
        MEAL_CATEGORIES.map((cat) => {
          const items = (meals ?? []).filter((m) => m.category === cat.key);
          if (items.length === 0) return null;
          return (
            <View key={cat.key} style={{ marginBottom: space.lg }}>
              <T variant="overline" tone="dim" style={{ marginBottom: space.sm }}>{categoryLabel(cat.key)}</T>
              <View style={{ gap: space.md }}>
                {items.map((meal) => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    onPress={() => router.push({ pathname: '/comida/[id]', params: { id: meal.id, date } })}
                    onQuickLog={() => run((db) => logMeal(db, { date, category: meal.category, meal }), { success: `${meal.name} · ${formatKcal(meal.calories)} kcal registrado` })}
                  />
                ))}
              </View>
            </View>
          );
        })
      )}
    </Screen>
  );
}
