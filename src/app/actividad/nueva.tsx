import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { DateChip } from '@/components/DatePicker';
import { Field, confirm } from '@/components/ui/form';
import { Screen } from '@/components/ui/layout';
import { Button, Card, Chip, Row, T } from '@/components/ui/primitives';
import { ACTIVITY_TYPES, deleteActivity, getActivity, saveActivity } from '@/data/activities';
import { parseNonNegative, parsePositive, toInput } from '@/lib/format';
import { goBack } from '@/lib/nav';
import { useParams } from '@/lib/params';
import { useDb, useMutation } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const QUICK_MINUTES = [20, 30, 45, 60];

/** Walks, cycling and other exercise that isn't a gym routine. Counts as a day of exercise. */
export default function ActivityScreen() {
  const c = useColors();
  const db = useDb();
  const params = useParams();
  const id = params.string('id');
  const run = useMutation();
  const [date, setDate] = useState(params.date());
  const [type, setType] = useState<string>('caminata');
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');
  const [notes, setNotes] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getActivity(db, id).then((a) => {
      if (!a) return;
      setDate(a.date);
      setType(a.type);
      setMinutes(String(a.minutes));
      setDistance(toInput(a.distanceKm, 2));
      setNotes(a.notes);
    });
  }, [db, id]);

  const mins = parsePositive(minutes);
  const km = distance.trim() ? parseNonNegative(distance) : null;
  const valid = mins !== null && mins >= 1 && mins <= 1440 && (distance.trim() === '' || km !== null);

  const save = async () => {
    if (!valid) return;
    const ok = await run((d) => saveActivity(d, { date, type, minutes: mins!, distanceKm: km, notes }, id), {
      success: id ? 'Actividad actualizada' : 'Actividad registrada',
    });
    if (ok) goBack();
  };

  const remove = async () => {
    if (!id) return;
    if (!(await confirm('Eliminar actividad', 'Se borra este registro.', 'Eliminar', true))) return;
    const done = await run((d) => deleteActivity(d, id), { success: 'Actividad eliminada' });
    if (done !== undefined) goBack();
  };

  return (
    <Screen
      title={id ? 'Editar actividad' : 'Otra actividad'}
      footer={<Button label="Guardar" icon="check" size="lg" onPress={save} disabled={!valid} />}
    >
      <View style={{ gap: space.lg }}>
        <View style={{ gap: 6 }}>
          <T variant="label" tone="muted">¿Qué hiciste?</T>
          <Row style={{ flexWrap: 'wrap' }}>
            {ACTIVITY_TYPES.map((t) => (
              <Chip key={t.key} label={t.label} selected={type === t.key} onPress={() => setType(t.key)} />
            ))}
          </Row>
        </View>
        <View style={{ gap: 8 }}>
          <Field label="Duración" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" suffix="min" placeholder="40" autoFocus={!id} error={minutes && !valid ? 'Poné entre 1 y 1440 minutos' : null} />
          <Row style={{ flexWrap: 'wrap' }} gap={6}>
            {QUICK_MINUTES.map((m) => (
              <Chip key={m} label={`${m} min`} compact selected={minutes === String(m)} onPress={() => setMinutes(String(m))} />
            ))}
          </Row>
        </View>
        <Field label="Distancia (opcional)" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" suffix="km" error={distance && km === null ? 'Número inválido' : null} />
        <View style={{ gap: 6 }}>
          <T variant="label" tone="muted">Día</T>
          <Row><DateChip value={date} onChange={setDate} /></Row>
        </View>
        <Card tone="alt">
          <Row gap={space.md} align="flex-start">
            <MaterialCommunityIcons name="information-outline" size={18} color={c.textDim} />
            <T variant="caption" tone="muted" style={{ flex: 1 }}>
              Cuenta como día de ejercicio para tu constancia y tu racha, pero queda como actividad libre: no es un entrenamiento de rutina.
            </T>
          </Row>
        </Card>
        {id ? <Button label="Eliminar actividad" icon="trash-2" variant="danger" onPress={remove} /> : null}
      </View>
    </Screen>
  );
}
