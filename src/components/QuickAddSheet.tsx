import { useState } from 'react';
import { View } from 'react-native';
import { ExtraFields, textsToExtras, type ExtraTexts } from '@/components/ExtraFields';
import { MomentPicker } from '@/components/MomentPicker';
import { Field, Sheet } from '@/components/ui/form';
import { Button, Row, T } from '@/components/ui/primitives';
import { logMeal } from '@/data/meals';
import { guessCategory, type MealCategory } from '@/domain/nutrition';
import { todayKey, type DateKey } from '@/lib/dates';
import { formatKcal, parseNonNegative } from '@/lib/format';
import { useMutation } from '@/state/db';
import { useFeatures } from '@/state/features';
import { space } from '@/theme/tokens';

/**
 * Log numbers without creating a food ("una cucharada de chocolate"): calories are the only
 * required field. Saves, closes and confirms with a toast.
 */
export function QuickAddSheet({ visible, onClose, date = todayKey() }: { visible: boolean; onClose: () => void; date?: DateKey }) {
  const run = useMutation();
  const { features } = useFeatures();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [prot, setProt] = useState('');
  const [extraTexts, setExtraTexts] = useState<ExtraTexts>({});
  const [moment, setMoment] = useState<MealCategory>(guessCategory());
  const [saving, setSaving] = useState(false);

  const calories = parseNonNegative(kcal);
  const protein = prot.trim() ? parseNonNegative(prot) : 0;
  const valid = calories !== null && calories > 0 && protein !== null;

  const reset = () => {
    setName('');
    setKcal('');
    setProt('');
    setExtraTexts({});
    setMoment(guessCategory());
  };

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const label = name.trim() || 'Agregado rápido';
    const ok = await run(
      (db) => logMeal(db, { date, category: moment, manual: { name: label, calories: calories!, protein: protein!, extras: textsToExtras(extraTexts, features) } }),
      { success: `${label} · ${formatKcal(calories!)} kcal` },
    );
    setSaving(false);
    if (ok) {
      reset();
      onClose();
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Sumar rápido">
      <View style={{ gap: space.lg }}>
        <T variant="caption" tone="dim">Para algo puntual que no querés guardar como comida. Solo las calorías son obligatorias.</T>
        <Row gap={space.md} align="flex-start">
          <View style={{ flex: 1 }}>
            <Field label="Calorías" value={kcal} onChangeText={setKcal} keyboardType="numeric" suffix="kcal" placeholder="60" autoFocus error={kcal && calories === null ? 'Número inválido' : null} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Proteína" value={prot} onChangeText={setProt} keyboardType="decimal-pad" suffix="g" placeholder="0" error={prot && protein === null ? 'Número inválido' : null} />
          </View>
        </Row>
        <ExtraFields enabled={features} value={extraTexts} onChange={setExtraTexts} />
        <Field label="¿Qué fue? (opcional)" value={name} onChangeText={setName} placeholder="Ej.: una cucharada de chocolate" />
        <MomentPicker value={moment} onChange={setMoment} />
        <Button label="Sumar" icon="check" size="lg" onPress={save} disabled={!valid} loading={saving} />
      </View>
    </Sheet>
  );
}
