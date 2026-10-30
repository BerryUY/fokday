import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { ExtraFields, extrasToTexts, textsToExtras, type ExtraTexts } from '@/components/ExtraFields';
import { Field, confirm } from '@/components/ui/form';
import { Loading, Screen } from '@/components/ui/layout';
import { Button, Card, Chip, Row, T } from '@/components/ui/primitives';
import { archiveMeal, getMeal, saveMeal } from '@/data/meals';
import { MEAL_CATEGORIES, type MealCategory } from '@/domain/nutrition';
import { parseNonNegative, toInput } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useDb, useMutation } from '@/state/db';
import { useFeatures } from '@/state/features';
import { useCloudConfig } from '@/state/cloud';
import { useToast } from '@/state/toast';
import { cloudApi } from '@/backup/api';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Create a custom meal or edit any meal in the catalog (predefined ones included). */
export default function EditMealScreen() {
  const c = useColors();
  const db = useDb();
  const params = useParams();
  const id = params.string('id');
  const run = useMutation();
  const [loaded, setLoaded] = useState(!id);
  const [isCustom, setIsCustom] = useState(true);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MealCategory>(params.category() ?? 'desayuno');
  const [kcal, setKcal] = useState('');
  const [prot, setProt] = useState('');
  const [prep, setPrep] = useState('');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [estimate, setEstimate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [share, setShare] = useState(false);
  const { config } = useCloudConfig();
  const toast = useToast();
  const { features } = useFeatures();
  const [extraTexts, setExtraTexts] = useState<ExtraTexts>({});

  useEffect(() => {
    if (!id) return;
    getMeal(db, id).then((m) => {
      if (m) {
        setExtraTexts(extrasToTexts(m.extras));
        setName(m.name);
        setCategory(m.category);
        setKcal(toInput(m.calories, 0));
        setProt(toInput(m.protein, 1));
        setPrep(m.prepMinutes !== null ? String(m.prepMinutes) : '');
        setNotes(m.notes ?? '');
        setIngredients(m.ingredients.join('\n'));
        setEstimate(m.isEstimate);
        setIsCustom(m.isCustom);
      }
      setLoaded(true);
    });
  }, [db, id]);

  const calories = parseNonNegative(kcal);
  const protein = parseNonNegative(prot);
  const prepMinutes = prep.trim() ? parseNonNegative(prep) : null;
  const valid = name.trim().length > 0 && calories !== null && protein !== null && (prep.trim() === '' || prepMinutes !== null);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const savedId = await run(
      (d) =>
        saveMeal(
          d,
          {
            name,
            category,
            calories: calories!,
            protein: protein!,
            isEstimate: estimate,
            prepMinutes: prepMinutes === null ? null : Math.round(prepMinutes),
            notes,
            ingredients: ingredients.split('\n'),
            extras: textsToExtras(extraTexts, features),
          },
          id,
        ),
      { success: id ? 'Comida actualizada' : 'Comida creada' },
    );
    setSaving(false);
    if (savedId && share && config) {
      // Sharing is best effort: the food is already saved on the phone either way.
      try {
        await cloudApi.sharePublicFood(config, {
          name: name.trim(),
          category,
          calories: calories!,
          protein: protein!,
          extras: textsToExtras(extraTexts, features),
          ingredients: ingredients.split('\n').map((l) => l.trim()).filter(Boolean),
        });
        toast.show('Guardada y compartida en Comunidad');
      } catch (e) {
        toast.show(`Se guardó, pero no se pudo compartir: ${e instanceof Error ? e.message : 'error'}`, 'error');
      }
    }
    if (savedId) goBack();
  };

  const remove = async () => {
    if (!id) return;
    const ok = await confirm('Eliminar comida', 'Se quita del catálogo. Lo que ya registraste con ella se conserva.', 'Eliminar', true);
    if (!ok) return;
    const done = await run((d) => archiveMeal(d, id), { success: 'Comida eliminada del catálogo' });
    if (done !== undefined) router.dismissTo('/comidas');
  };

  if (!loaded) return <Screen title="Editar comida"><Loading /></Screen>;

  return (
    <Screen
      title={id ? 'Editar comida' : 'Nueva comida'}
      footer={<Button label="Guardar" icon="check" size="lg" onPress={save} disabled={!valid} loading={saving} />}
    >
      <View style={{ gap: space.lg }}>
        {id && !isCustom ? (
          <Card tone="alt">
            <T variant="label" tone="muted">
              Es una opción del plan. Tus cambios se mantienen aunque actualices la app, y no modifican lo que ya registraste.
            </T>
          </Card>
        ) : null}
        <Field label="Nombre" value={name} onChangeText={setName} placeholder="Ej.: Tortilla de papas" autoFocus={!id} />
        <View style={{ gap: 6 }}>
          <T variant="label" tone="muted">Categoría</T>
          <Row style={{ flexWrap: 'wrap' }}>
            {MEAL_CATEGORIES.map((cat) => (
              <Chip key={cat.key} label={cat.short} selected={category === cat.key} onPress={() => setCategory(cat.key)} />
            ))}
          </Row>
        </View>
        <Row gap={space.md} align="flex-start">
          <View style={{ flex: 1 }}>
            <Field label="Calorías (1×)" value={kcal} onChangeText={setKcal} keyboardType="numeric" suffix="kcal" error={kcal && calories === null ? 'Número inválido' : null} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Proteína (1×)" value={prot} onChangeText={setProt} keyboardType="decimal-pad" suffix="g" error={prot && protein === null ? 'Número inválido' : null} />
          </View>
        </Row>
        <ExtraFields enabled={features} value={extraTexts} onChange={setExtraTexts} />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="bodyMedium">Valores estimados</T>
            <T variant="caption" tone="dim">Se muestran con “~” para recordar que son aproximados.</T>
          </View>
          <Switch value={estimate} onValueChange={setEstimate} trackColor={{ true: c.accent, false: c.track }} thumbColor="#FFFFFF" />
        </Row>
        {config ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T variant="bodyMedium">Compartir en Comunidad</T>
              <T variant="caption" tone="dim">Otras personas van a poder usarla. No se muestra tu nombre.</T>
            </View>
            <Switch value={share} onValueChange={setShare} trackColor={{ true: c.accent, false: c.track }} thumbColor="#FFFFFF" />
          </Row>
        ) : null}
        <Field label="Preparación (minutos, opcional)" value={prep} onChangeText={setPrep} keyboardType="numeric" suffix="min" />
        <Field
          label="Ingredientes (uno por línea)"
          value={ingredients}
          onChangeText={setIngredients}
          multiline
          placeholder={'2 huevos\n2 tostadas\n1 vaso de leche'}
        />
        <Field label="Notas (opcional)" value={notes} onChangeText={setNotes} multiline placeholder="Consejos o variantes" />
        {id ? <Button label="Eliminar del catálogo" icon="trash-2" variant="danger" onPress={remove} /> : null}
      </View>
    </Screen>
  );
}
