import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { cloudApi, type PublicFood } from '@/backup/api';
import { MomentPicker } from '@/components/MomentPicker';
import { Field, Sheet, confirm } from '@/components/ui/form';
import { EmptyState, Loading, Screen } from '@/components/ui/layout';
import { Badge, Button, Card, Row, T } from '@/components/ui/primitives';
import { logMeal, saveMeal } from '@/data/meals';
import { categoryLabel, guessCategory, type MealCategory } from '@/domain/nutrition';
import { formatKcal, formatProtein } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useCloudConfig } from '@/state/cloud';
import { useMutation } from '@/state/db';
import { useToast } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Foods other people chose to share. Nobody's name is shown; you can remove only your own. */
export default function PublicLibraryScreen() {
  const c = useColors();
  const toast = useToast();
  const date = useParams().date();
  const { config, loading } = useCloudConfig();
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<PublicFood[] | null>(null);
  const [selected, setSelected] = useState<PublicFood | null>(null);
  const [tick, setTick] = useState(0);

  // Search as you type, a moment after the last keystroke.
  useEffect(() => {
    if (!config) return;
    let alive = true;
    const t = setTimeout(() => {
      cloudApi
        .searchPublicFoods(config, query.trim())
        .then((r) => alive && setFoods(r.foods))
        .catch((e) => {
          if (!alive) return;
          setFoods([]);
          toast.show(e instanceof Error ? e.message : 'No se pudo buscar.', 'error');
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [config, query, tick, toast]);

  if (!loading && !config) {
    return (
      <Screen title="Biblioteca pública">
        <Card style={{ padding: space.xl, gap: space.md }}>
          <Feather name="globe" size={28} color={c.accent} />
          <T variant="h2">Activá tu perfil en la nube</T>
          <T variant="body" tone="muted">La biblioteca vive en el servidor de Momentum. Con tu perfil podés buscar las comidas que compartió la comunidad y compartir las tuyas.</T>
          <Button label="Crear mi perfil" icon="user-plus" onPress={() => router.push('/ajustes/respaldo')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Biblioteca pública" subtitle="Comidas que compartió la comunidad">
      <Field value={query} onChangeText={setQuery} placeholder="Buscar (ej.: alfajor, guiso, yogur)" returnKeyType="search" />
      <View style={{ marginTop: space.lg, gap: space.sm }}>
        {foods === null ? (
          <Loading />
        ) : foods.length === 0 ? (
          <EmptyState
            icon="search"
            title={query ? 'Sin resultados' : 'Todavía no hay comidas compartidas'}
            message="Cuando crees una comida, podés compartirla acá activando “Compartir en la biblioteca pública”."
          />
        ) : (
          foods.map((f, i) => (
            <Animated.View key={f.id} entering={FadeInDown.delay(Math.min(i, 10) * 25).duration(240)}>
              <Card onPress={() => setSelected(f)} style={{ paddingVertical: space.md }}>
                <Row style={{ justifyContent: 'space-between' }} align="flex-start">
                  <View style={{ flex: 1, paddingRight: space.md }}>
                    <T variant="bodyMedium" numberOfLines={2}>{f.name}</T>
                    <T variant="caption" tone="dim">{categoryLabel(f.category)}</T>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T variant="label" tone="accent">{formatKcal(f.calories)} kcal</T>
                    <T variant="caption" tone="protein">{formatProtein(f.protein)} g prot.</T>
                  </View>
                </Row>
                {f.mine ? <View style={{ marginTop: space.sm, alignSelf: "flex-start" }}><Badge label="Compartida por vos" tone="muted" /></View> : null}
              </Card>
            </Animated.View>
          ))
        )}
      </View>
      <PublicFoodSheet
        key={selected?.id ?? 'none'}
        food={selected}
        date={date}
        onClose={() => setSelected(null)}
        onRemoved={() => {
          setSelected(null);
          setTick((t) => t + 1);
        }}
      />
    </Screen>
  );
}

function PublicFoodSheet({ food, date, onClose, onRemoved }: { food: PublicFood | null; date: string; onClose: () => void; onRemoved: () => void }) {
  const run = useMutation();
  const toast = useToast();
  const { config } = useCloudConfig();
  const [moment, setMoment] = useState<MealCategory>(guessCategory());
  const [busy, setBusy] = useState(false);
  const f = food;

  const register = async () => {
    if (!f) return;
    const ok = await run((db) => logMeal(db, { date, category: moment, manual: { name: f.name, calories: f.calories, protein: f.protein, extras: f.extras } }), {
      success: `${f.name} registrado · ${formatKcal(f.calories)} kcal`,
    });
    if (ok) onClose();
  };

  const keep = async () => {
    if (!f) return;
    const ok = await run(
      (db) => saveMeal(db, { name: f.name, category: f.category, calories: f.calories, protein: f.protein, isEstimate: true, ingredients: f.ingredients, extras: f.extras }),
      { success: 'Guardada en tus comidas' },
    );
    if (ok) onClose();
  };

  const remove = async () => {
    if (!f || !config) return;
    if (!(await confirm('Quitar de la biblioteca', 'Deja de verse para los demás. Tus registros no cambian.', 'Quitar', true))) return;
    setBusy(true);
    try {
      await cloudApi.deletePublicFood(config, f.id);
      toast.show('Quitada de la biblioteca');
      onRemoved();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo quitar.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={!!food} onClose={onClose} title={f?.name}>
      {f ? (
        <View style={{ gap: space.lg }}>
          <Row gap={space.lg}>
            <T variant="h3" tone="accent">{formatKcal(f.calories)} kcal</T>
            <T variant="h3" tone="protein">{formatProtein(f.protein)} g de proteína</T>
          </Row>
          {f.ingredients.length ? <T variant="label" tone="muted">{f.ingredients.join(' · ')}</T> : null}
          <MomentPicker value={moment} onChange={setMoment} />
          <Button label="Registrar" icon="check" onPress={register} />
          <Button label="Guardar en mis comidas" icon="bookmark" variant="secondary" onPress={keep} />
          {f.mine ? <Button label="Quitar de la biblioteca" icon="trash-2" variant="danger" loading={busy} onPress={remove} /> : null}
        </View>
      ) : null}
    </Sheet>
  );
}
