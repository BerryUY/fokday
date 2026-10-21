import { goBack } from '@/lib/nav';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Field, confirm } from '@/components/ui/form';
import { Screen } from '@/components/ui/layout';
import { Button, Chip, Row, T } from '@/components/ui/primitives';
import { deleteExercise, EXERCISE_SUGGESTIONS, getExercise, MUSCLE_GROUPS, saveExercise } from '@/data/routines';
import { useParams } from '@/lib/params';
import { useDb, useMutation } from '@/state/db';
import { space } from '@/theme/tokens';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function EditExerciseScreen() {
  const db = useDb();
  const params = useParams();
  const id = params.string('id');
  const run = useMutation();
  const [name, setName] = useState(params.string('name') ?? '');
  const [group, setGroup] = useState<string>('Pecho');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!id) return;
    getExercise(db, id).then((e) => {
      if (!e) return;
      setName(e.name);
      setGroup(e.muscleGroup);
      setNotes(e.notes ?? '');
    });
  }, [db, id]);

  const suggestions = id
    ? []
    : EXERCISE_SUGGESTIONS.filter((s) => (name ? fold(s.name).includes(fold(name)) && fold(s.name) !== fold(name) : true)).slice(0, 8);

  const save = async () => {
    const saved = await run((d) => saveExercise(d, { name, muscleGroup: group, notes }, id), { success: id ? 'Ejercicio actualizado' : 'Ejercicio creado' });
    if (saved) goBack();
  };

  const remove = async () => {
    if (!id) return;
    const ok = await confirm('Eliminar ejercicio', 'Se quita de la biblioteca y de tus rutinas. Tu historial de entrenamientos se conserva.', 'Eliminar', true);
    if (!ok) return;
    const done = await run((d) => deleteExercise(d, id), { success: 'Ejercicio eliminado' });
    if (done !== undefined) goBack();
  };

  return (
    <Screen title={id ? 'Editar ejercicio' : 'Nuevo ejercicio'} footer={<Button label="Guardar" icon="check" size="lg" onPress={save} disabled={!name.trim()} />}>
      <View style={{ gap: space.lg }}>
        <Field label="Nombre" value={name} onChangeText={setName} placeholder="Ej.: Press de banca" autoFocus={!id} />
        {suggestions.length > 0 ? (
          <View style={{ gap: 6 }}>
            <T variant="caption" tone="dim">Sugerencias</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {suggestions.map((s) => (
                <Chip
                  key={s.name}
                  compact
                  label={s.name}
                  onPress={() => {
                    setName(s.name);
                    setGroup(s.group);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}
        <View style={{ gap: 6 }}>
          <T variant="label" tone="muted">Grupo muscular</T>
          <Row style={{ flexWrap: 'wrap' }} gap={6}>
            {MUSCLE_GROUPS.map((g) => (
              <Chip key={g} compact label={g} selected={group === g} onPress={() => setGroup(g)} />
            ))}
          </Row>
        </View>
        <Field label="Notas" value={notes} onChangeText={setNotes} multiline placeholder="Máquina, agarre, ajustes del asiento…" />
        {id ? <Button label="Eliminar ejercicio" icon="trash-2" variant="danger" onPress={remove} /> : null}
      </View>
    </Screen>
  );
}
