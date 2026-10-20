import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { DateChip } from '@/components/DatePicker';
import { Field } from '@/components/ui/form';
import { Screen } from '@/components/ui/layout';
import { Button, Card, Chip, Row, T } from '@/components/ui/primitives';
import { LIGHT_DINNER_GUIDE } from '@/data/catalog';
import { logMeal, saveMeal } from '@/data/meals';
import { MEAL_CATEGORIES, type MealCategory } from '@/domain/nutrition';
import { formatKcal, parseNonNegative } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useMutation } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Quick entry for anything outside the catalog: a different dinner, a snack, eating out. */
export default function ManualMealScreen() {
  const c = useColors();
  const params = useParams();
  const run = useMutation();
  const [date, setDate] = useState(params.date());
  const [category, setCategory] = useState<MealCategory>(params.category() ?? 'cena');
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [prot, setProt] = useState('');
  const [notes, setNotes] = useState('');
  const [saveToCatalog, setSaveToCatalog] = useState(false);
  const [saving, setSaving] = useState(false);

  const calories = parseNonNegative(kcal);
  const protein = parseNonNegative(prot);
  const valid = name.trim().length > 0 && calories !== null && protein !== null;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const ok = await run(
      async (db) => {
        if (saveToCatalog) {
          await saveMeal(db, { name, category, calories: calories!, protein: protein!, isEstimate: true, ingredients: [], notes: null });
        }
        return logMeal(db, { date, category, notes, manual: { name, calories: calories!, protein: protein! } });
      },
      { success: `${name.trim()} registrado · ${formatKcal(calories ?? 0)} kcal` },
    );
    setSaving(false);
    if (ok) goBack();
  };

  return (
    <Screen title="Comida distinta" footer={<Button label="Registrar comida" icon="check" size="lg" onPress={save} disabled={!valid} loading={saving} />}>
      <View style={{ gap: space.lg }}>
        {category === 'cena' ? (
          <Card tone="alt">
            <T variant="label" tone="muted">{LIGHT_DINNER_GUIDE.description}</T>
            <T variant="label" tone="weight" style={{ marginTop: 6 }}>{LIGHT_DINNER_GUIDE.tip}</T>
          </Card>
        ) : null}
        <Field label="¿Qué comiste?" value={name} onChangeText={setName} placeholder="Ej.: Sopa de verduras" autoFocus />
        <Row gap={space.md} align="flex-start">
          <View style={{ flex: 1 }}>
            <Field label="Calorías aprox." value={kcal} onChangeText={setKcal} keyboardType="numeric" suffix="kcal" error={kcal && calories === null ? 'Número inválido' : null} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Proteína aprox." value={prot} onChangeText={setProt} keyboardType="decimal-pad" suffix="g" error={prot && protein === null ? 'Número inválido' : null} />
          </View>
        </Row>
        <View style={{ gap: 6 }}>
          <T variant="label" tone="muted">Momento del día</T>
          <Row style={{ flexWrap: 'wrap' }}>
            {MEAL_CATEGORIES.map((cat) => (
              <Chip key={cat.key} label={cat.short} selected={category === cat.key} onPress={() => setCategory(cat.key)} />
            ))}
          </Row>
        </View>
        <View style={{ gap: 6 }}>
          <T variant="label" tone="muted">Día</T>
          <Row><DateChip value={date} onChange={setDate} /></Row>
        </View>
        <Field label="Notas (opcional)" value={notes} onChangeText={setNotes} placeholder="Ej.: comí afuera" />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="bodyMedium">Guardar en el catálogo</T>
            <T variant="caption" tone="dim">Para registrarla con un toque la próxima vez.</T>
          </View>
          <Switch value={saveToCatalog} onValueChange={setSaveToCatalog} trackColor={{ true: c.accent, false: c.track }} thumbColor="#FFFFFF" />
        </Row>
      </View>
    </Screen>
  );
}
