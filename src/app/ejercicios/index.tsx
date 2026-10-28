import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useState } from 'react';
import { View } from 'react-native';
import { Field } from '@/components/ui/form';
import { EmptyState, ListRow, Screen } from '@/components/ui/layout';
import { Button, Card, Divider, IconBubble, IconButton, T } from '@/components/ui/primitives';
import { addRoutineExercise, listExercises } from '@/data/routines';
import { getProfile } from '@/data/settings';
import { addExerciseToSession } from '@/data/workouts';
import { useParams } from '@/lib/params';
import { useMutation, useQuery } from '@/state/db';
import { space } from '@/theme/tokens';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Exercise library. With ?pick=routine|session&target=<id> it adds the tapped exercise there. */
export default function ExercisesScreen() {
  const params = useParams();
  const pick = params.string('pick') as 'routine' | 'session' | undefined;
  const target = params.string('target');
  const run = useMutation();
  const [query, setQuery] = useState('');
  const { data: exercises } = useQuery((db) => listExercises(db), []);

  const filtered = (exercises ?? []).filter((e) => !query || fold(e.name).includes(fold(query)) || fold(e.muscleGroup).includes(fold(query)));
  const groups = [...new Set(filtered.map((e) => e.muscleGroup))];

  const choose = async (exerciseId: string, name: string) => {
    if (!pick || !target) {
      router.push({ pathname: '/ejercicios/editar', params: { id: exerciseId } });
      return;
    }
    const ok = await run(
      async (db) => {
        if (pick === 'routine') {
          const profile = await getProfile(db);
          return addRoutineExercise(db, target, exerciseId, { sets: 3, repsMin: 8, repsMax: 12, restSeconds: profile.defaultRestSeconds, notes: null });
        }
        await addExerciseToSession(db, target, exerciseId);
        return true;
      },
      { success: `${name} agregado` },
    );
    if (ok) goBack();
  };

  return (
    <Screen
      title={pick ? 'Elegí un ejercicio' : 'Ejercicios'}
      right={<IconButton icon="plus" label="Nuevo ejercicio" onPress={() => router.push({ pathname: '/ejercicios/editar', params: {} })} />}
    >
      <Card
        tone="accent"
        style={{ marginBottom: space.md }}
        onPress={() => router.push({ pathname: '/ejercicios/explorar', params: pick && target ? { pick, target } : {} })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <IconBubble icon="image" tone="accent" size={40} />
          <View style={{ flex: 1 }}>
            <T variant="bodyMedium">Guía con fotos</T>
            <T variant="caption" tone="muted">Más de 800 ejercicios con imágenes y cómo hacerlos</T>
          </View>
        </View>
      </Card>
      <Field value={query} onChangeText={setQuery} placeholder="Buscar en tu biblioteca" />
      {pick === 'routine' ? (
        <T variant="caption" tone="dim" style={{ marginTop: space.sm }}>Se agrega con 3 × 8–12. Después lo ajustás tocándolo en la rutina.</T>
      ) : null}
      <View style={{ marginTop: space.lg }}>
        {exercises && exercises.length === 0 ? (
          <EmptyState
            icon="activity"
            title="Tu biblioteca está vacía"
            message="Creá los ejercicios que hacés en el gym. Hay sugerencias para cargarlos rápido."
            action={<Button label="Crear ejercicio" icon="plus" onPress={() => router.push({ pathname: '/ejercicios/editar', params: {} })} />}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="search"
            title="Sin resultados"
            action={<Button label={`Crear “${query}”`} icon="plus" variant="secondary" onPress={() => router.push({ pathname: '/ejercicios/editar', params: { name: query } })} />}
          />
        ) : (
          groups.map((g) => (
            <View key={g} style={{ marginBottom: space.lg }}>
              <T variant="overline" tone="dim" style={{ marginBottom: space.sm }}>{g}</T>
              <Card padded={false} style={{ paddingVertical: space.xs }}>
                {filtered.filter((e) => e.muscleGroup === g).map((e, i) => (
                  <View key={e.id}>
                    {i > 0 ? <Divider style={{ marginHorizontal: space.lg }} /> : null}
                    <ListRow
                      title={e.name}
                      onPress={() => choose(e.id, e.name)}
                      right={pick ? <IconBubble icon="plus" tone="accent" size={30} /> : undefined}
                      chevron={!pick}
                    />
                  </View>
                ))}
              </Card>
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}
