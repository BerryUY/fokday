import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { DateChip } from '@/components/DatePicker';
import { Field, confirm } from '@/components/ui/form';
import { Screen } from '@/components/ui/layout';
import { Button, Card, Row, T } from '@/components/ui/primitives';
import { deleteWeight, getWeight, listWeights, saveWeight, updateWeight } from '@/data/weight';
import { latestEntry } from '@/domain/weight';
import { formatShort } from '@/lib/dates';
import { formatKg, formatSigned, parsePositive, toInput } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useDb, useMutation } from '@/state/db';
import { useToast } from '@/state/toast';
import { space } from '@/theme/tokens';

export default function LogWeightScreen() {
  const db = useDb();
  const params = useParams();
  const id = params.string('id');
  const run = useMutation();
  const toast = useToast();
  const [date, setDate] = useState(params.date());
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [previous, setPrevious] = useState<{ date: string; weight: number } | null>(null);

  useEffect(() => {
    (async () => {
      const all = await listWeights(db);
      if (id) {
        const e = await getWeight(db, id);
        if (e) {
          setDate(e.date);
          setWeight(toInput(e.weight, 2));
          setNotes(e.notes ?? '');
        }
        setPrevious(latestEntry(all.filter((w) => w.id !== id && (!e || w.date < e.date))));
      } else {
        setPrevious(latestEntry(all));
      }
    })();
  }, [db, id]);

  const value = parsePositive(weight);
  const valid = value !== null && value >= 20 && value <= 300;

  const save = async () => {
    if (!valid) return;
    const result = await run(async (d) => {
      if (id) {
        await updateWeight(d, id, date, value!, notes);
        return { replaced: false };
      }
      return saveWeight(d, date, value!, notes);
    });
    if (result) {
      toast.show(id ? 'Medición actualizada' : result.replaced ? 'Actualizamos el peso de ese día' : `Peso registrado: ${formatKg(value!)} kg`);
      goBack();
    }
  };

  const remove = async () => {
    if (!id) return;
    if (!(await confirm('Eliminar medición', 'Se borra este registro de peso.', 'Eliminar', true))) return;
    const ok = await run((d) => deleteWeight(d, id), { success: 'Medición eliminada' });
    if (ok !== undefined) goBack();
  };

  return (
    <Screen title={id ? 'Editar peso' : 'Registrar peso'} footer={<Button label="Guardar" icon="check" size="lg" onPress={save} disabled={!valid} />}>
      <View style={{ gap: space.lg }}>
        <Field large value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="57,0" suffix="kg" autoFocus={!id} error={weight && !valid ? 'Ingresá un peso entre 20 y 300 kg' : null} />
        {previous && value ? (
          <T variant="label" tone="muted">
            Anterior: {formatKg(previous.weight)} kg ({formatShort(previous.date)}) · cambio {formatSigned(value - previous.weight)} kg
          </T>
        ) : null}
        <View style={{ gap: 6 }}>
          <T variant="label" tone="muted">Fecha de la medición</T>
          <Row><DateChip value={date} onChange={setDate} /></Row>
        </View>
        <Field label="Notas (opcional)" value={notes} onChangeText={setNotes} placeholder="Ej.: en ayunas, después del gym" />
        <Card tone="alt">
          <T variant="caption" tone="muted">Hay un registro por día: si ya pesaste ese día, se actualiza. Tu peso de inicio y tu meta se cambian en Ajustes.</T>
        </Card>
        {id ? <Button label="Eliminar medición" icon="trash-2" variant="danger" onPress={remove} /> : null}
      </View>
    </Screen>
  );
}
