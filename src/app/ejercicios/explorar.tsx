import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Field, Sheet } from '@/components/ui/form';
import { EmptyState, Loading, Screen } from '@/components/ui/layout';
import { Badge, Button, Card, Chip, PressableScale, Row, T } from '@/components/ui/primitives';
import { loadExerciseCatalog } from '@/data/exerciseCatalogStore';
import { addRoutineExercise, listExercises, saveExercise } from '@/data/routines';
import { getProfile } from '@/data/settings';
import { addExerciseToSession } from '@/data/workouts';
import {
  CATALOG_FILTERS,
  equipmentLabel,
  groupFor,
  imageUrl,
  levelLabel,
  muscleLabel,
  searchCatalog,
  type CatalogExercise,
  type CatalogFilter,
} from '@/domain/exerciseCatalog';
import { goBack } from '@/lib/nav';
import { useParams } from '@/lib/params';
import { useMutation } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const PAGE = 40;

/**
 * Guide of 800+ exercises with photos. With ?pick=routine|session&target=<id> the chosen
 * exercise also goes straight into that routine or workout.
 */
export default function ExploreExercisesScreen() {
  const c = useColors();
  const params = useParams();
  const pick = params.string('pick') as 'routine' | 'session' | undefined;
  const target = params.string('target');
  const [all, setAll] = useState<CatalogExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CatalogFilter | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<CatalogExercise | null>(null);

  const load = () => loadExerciseCatalog().then(setAll).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const retry = () => {
    setError(null);
    void load();
  };

  const results = useMemo(() => (all ? searchCatalog(all, query, filter) : []), [all, query, filter]);

  return (
    <Screen title="Guía de ejercicios" subtitle={all ? `${all.length} ejercicios con fotos` : undefined}>
      <Field value={query} onChangeText={(q) => { setQuery(q); setLimit(PAGE); }} placeholder="Buscar: bench, sentadilla, pecho, mancuernas…" returnKeyType="search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: space.md }} style={{ marginHorizontal: -space.lg }}>
        <View style={{ width: space.lg - 6 }} />
        <Chip label="Todos" compact selected={!filter} onPress={() => { setFilter(null); setLimit(PAGE); }} />
        {CATALOG_FILTERS.map((f) => (
          <Chip key={f} label={f} compact selected={filter === f} onPress={() => { setFilter(filter === f ? null : f); setLimit(PAGE); }} />
        ))}
        <View style={{ width: space.lg - 6 }} />
      </ScrollView>

      {error ? (
        <EmptyState icon="wifi-off" title="Sin conexión" message={error} action={<Button label="Reintentar" icon="refresh-cw" onPress={retry} />} />
      ) : !all ? (
        <Loading variant="list" />
      ) : results.length === 0 ? (
        <EmptyState icon="search" title="Sin resultados" message="Probá con otra palabra, en español o en inglés (por ejemplo: sentadilla, curl, remo)." />
      ) : (
        <View style={{ gap: space.sm }}>
          {results.slice(0, limit).map((e, i) => (
            <Animated.View key={e.id} entering={FadeInDown.delay(Math.min(i, 12) * 20).duration(220)}>
              <PressableScale onPress={() => setSelected(e)} style={[styles.row, { backgroundColor: c.surface }]} accessibilityRole="button" accessibilityLabel={e.name}>
                {e.images[0] ? (
                  <Image source={{ uri: imageUrl(e.images[0]) }} style={[styles.thumb, { backgroundColor: c.surfaceAlt }]} />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                    <Feather name="activity" size={20} color={c.textDim} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <T variant="bodyMedium" numberOfLines={2}>{e.name}</T>
                  <T variant="caption" tone="dim" numberOfLines={1}>{groupFor(e)} · {equipmentLabel(e.equipment)}</T>
                </View>
                <Feather name="chevron-right" size={18} color={c.textDim} />
              </PressableScale>
            </Animated.View>
          ))}
          {results.length > limit ? (
            <Button label={`Ver más (${results.length - limit})`} variant="secondary" onPress={() => setLimit(limit + PAGE)} />
          ) : null}
          <T variant="caption" tone="dim" style={{ textAlign: 'center', marginTop: space.md }}>
            Fotos e instrucciones de free-exercise-db (dominio público).
          </T>
        </View>
      )}

      <ExerciseSheet key={selected?.id ?? 'none'} exercise={selected} pick={pick} target={target} onClose={() => setSelected(null)} />
    </Screen>
  );
}

/** Start and end positions crossfade like a short animation. */
function Demo({ images }: { images: string[] }) {
  const c = useColors();
  const phase = useSharedValue(0);
  useEffect(() => {
    if (images.length > 1) phase.value = withRepeat(withTiming(1, { duration: 1100 }), -1, true);
  }, [images.length, phase]);
  const second = useAnimatedStyle(() => ({ opacity: phase.value }));
  if (!images.length) return null;
  return (
    <View style={[styles.demo, { backgroundColor: c.surfaceAlt }]}>
      <Image source={{ uri: imageUrl(images[0]) }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      {images[1] ? (
        <Animated.Image source={{ uri: imageUrl(images[1]) }} style={[StyleSheet.absoluteFill, second]} resizeMode="contain" />
      ) : null}
    </View>
  );
}

function ExerciseSheet({ exercise, pick, target, onClose }: { exercise: CatalogExercise | null; pick?: 'routine' | 'session'; target?: string; onClose: () => void }) {
  const run = useMutation();
  const [saving, setSaving] = useState(false);
  const e = exercise;

  const add = async () => {
    if (!e) return;
    setSaving(true);
    const done = await run(
      async (db) => {
        // Reuse the exercise if it's already in your library (same name, also the English one added before the translation).
        const names = [e.name.toLowerCase(), e.nameEn.toLowerCase()];
        const existing = (await listExercises(db)).find((x) => names.includes(x.name.toLowerCase()));
        const id = existing?.id ?? (await saveExercise(db, { name: e.name, muscleGroup: groupFor(e) }));
        if (pick === 'routine' && target) {
          const profile = await getProfile(db);
          await addRoutineExercise(db, target, id, { sets: 3, repsMin: 8, repsMax: 12, restSeconds: profile.defaultRestSeconds, notes: null });
        } else if (pick === 'session' && target) {
          await addExerciseToSession(db, target, id);
        }
        return true;
      },
      { success: pick === 'routine' ? `${e.name} agregado a la rutina` : pick === 'session' ? `${e.name} agregado al entrenamiento` : `${e.name} está en tu biblioteca` },
    );
    setSaving(false);
    if (done) {
      onClose();
      if (pick) goBack();
    }
  };

  return (
    <Sheet visible={!!exercise} onClose={onClose} title={e?.name}>
      {e ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: space.lg }}>
          <Demo images={e.images} />
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Badge label={groupFor(e)} />
            <Badge label={equipmentLabel(e.equipment)} tone="muted" />
            {e.level ? <Badge label={levelLabel(e.level)} tone="weight" /> : null}
          </Row>
          {e.primaryMuscles.length || e.secondaryMuscles.length ? (
            <T variant="label" tone="muted">
              Trabaja: {[...e.primaryMuscles, ...e.secondaryMuscles].map(muscleLabel).join(', ')}
            </T>
          ) : null}
          {e.instructions.length ? (
            <Card tone="alt" style={{ gap: space.sm }}>
              <T variant="label" tone="muted">Cómo se hace</T>
              {e.instructions.map((step, i) => (
                <Row key={i} gap={space.sm} align="flex-start">
                  <T variant="label" tone="accent" style={{ width: 18 }}>{i + 1}</T>
                  <T variant="caption" tone="muted" style={{ flex: 1 }}>{step}</T>
                </Row>
              ))}
            </Card>
          ) : null}
          <Button
            label={pick === 'routine' ? 'Agregar a la rutina' : pick === 'session' ? 'Agregar al entrenamiento' : 'Agregar a mi biblioteca'}
            icon="plus"
            size="lg"
            loading={saving}
            onPress={add}
          />
        </Animated.View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, paddingRight: space.md, borderRadius: radius.lg },
  thumb: { width: 60, height: 60, borderRadius: radius.md },
  demo: { width: '100%', aspectRatio: 1.4, borderRadius: radius.lg, overflow: 'hidden' },
});
