import { goBack } from '@/lib/nav';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { DateChip } from '@/components/DatePicker';
import { PortionPicker } from '@/components/PortionPicker';
import { Field, confirm } from '@/components/ui/form';
import { EmptyState, Loading, Screen } from '@/components/ui/layout';
import { Button, Card, Chip, Row, SectionHeader, T } from '@/components/ui/primitives';
import { deleteMealLog, getMealLog, repeatMealLog, updateMealLog, type MealLog } from '@/data/meals';
import { MEAL_CATEGORIES, scaleNutrition } from '@/domain/nutrition';
import { formatTime } from '@/lib/dates';
import { formatKcal, parseNonNegative, toInput } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useDb, useMutation } from '@/state/db';
import { space } from '@/theme/tokens';

/** Correct or delete one logged entry. Changes only affect this entry, never the meal template. */
export default function EditLogScreen() {
  const db = useDb();
  const id = useParams().string('id') ?? '';
  const run = useMutation();
  const [log, setLog] = useState<MealLog | null | undefined>(undefined);
  const [draft, setDraft] = useState<MealLog | null>(null);
  const [kcal, setKcal] = useState('');
  const [prot, setProt] = useState('');

  useEffect(() => {
    getMealLog(db, id).then((l) => {
      setLog(l);
      setDraft(l);
      if (l) {
        setKcal(toInput(l.calories, 0));
        setProt(toInput(l.protein, 1));
      }
    });
  }, [db, id]);

  if (log === undefined) return <Screen title="Registro"><Loading /></Screen>;
  if (!log || !draft) return <Screen title="Registro"><EmptyState icon="alert-circle" title="Este registro ya no existe" /></Screen>;

  const calories = parseNonNegative(kcal);
  const protein = parseNonNegative(prot);
  const valid = draft.name.trim().length > 0 && calories !== null && protein !== null;

  const setPortion = (portion: number) => {
    const scaled = scaleNutrition({ calories: draft.baseCalories, protein: draft.baseProtein }, portion);
    setDraft({ ...draft, portion });
    setKcal(toInput(scaled.calories, 0));
    setProt(toInput(scaled.protein, 1));
  };

  const save = async () => {
    if (!valid) return;
    const ok = await run(
      (d) =>
        updateMealLog(d, log.id, {
          name: draft.name,
          category: draft.category,
          logDate: draft.logDate,
          portion: draft.portion,
          calories: calories!,
          protein: protein!,
          notes: draft.notes,
        }),
      { success: 'Registro actualizado' },
    );
    if (ok) goBack();
  };

  const remove = async () => {
    const yes = await confirm('Eliminar registro', `Se elimina “${log.name}” de este día.`, 'Eliminar', true);
    if (!yes) return;
    const ok = await run((d) => deleteMealLog(d, log.id), { success: 'Registro eliminado' });
    if (ok !== undefined) goBack();
  };

  const repeat = async () => {
    const ok = await run((d) => repeatMealLog(d, log.id), { success: `${log.name} registrado otra vez` });
    if (ok) goBack();
  };

  return (
    <Screen
      title="Editar registro"
      subtitle={`Registrado a las ${formatTime(log.loggedAt)}`}
      footer={<Button label="Guardar cambios" icon="check" size="lg" onPress={save} disabled={!valid} />}
    >
      <View style={{ gap: space.lg }}>
        <Field label="Nombre" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
        <Card>
          <SectionHeader title="Porción" />
          <PortionPicker value={draft.portion} onChange={setPortion} />
          <T variant="caption" tone="dim" style={{ marginTop: space.sm }}>
            Al cambiar la porción se recalculan los valores a partir de 1× = {formatKcal(draft.baseCalories)} kcal.
          </T>
        </Card>
        <Row gap={space.md} align="flex-start">
          <View style={{ flex: 1 }}>
            <Field label="Calorías" value={kcal} onChangeText={setKcal} keyboardType="numeric" suffix="kcal" error={kcal && calories === null ? 'Número inválido' : null} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Proteína" value={prot} onChangeText={setProt} keyboardType="decimal-pad" suffix="g" error={prot && protein === null ? 'Número inválido' : null} />
          </View>
        </Row>
        <View style={{ gap: 6 }}>
          <T variant="label" tone="muted">Categoría y día</T>
          <Row style={{ flexWrap: 'wrap' }}>
            {MEAL_CATEGORIES.map((cat) => (
              <Chip key={cat.key} label={cat.short} compact selected={draft.category === cat.key} onPress={() => setDraft({ ...draft, category: cat.key })} />
            ))}
          </Row>
          <Row style={{ marginTop: 6 }}>
            <DateChip value={draft.logDate} onChange={(logDate) => setDraft({ ...draft, logDate })} />
          </Row>
        </View>
        <Field label="Notas" value={draft.notes ?? ''} onChangeText={(notes) => setDraft({ ...draft, notes })} placeholder="Opcional" />
        <Row gap={space.md}>
          <Button label="Repetir" icon="copy" variant="secondary" onPress={repeat} style={{ flex: 1 }} />
          <Button label="Eliminar" icon="trash-2" variant="danger" onPress={remove} style={{ flex: 1 }} />
        </Row>
      </View>
    </Screen>
  );
}
