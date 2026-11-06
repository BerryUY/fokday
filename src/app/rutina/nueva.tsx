import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Foki } from '@/components/mascot/Foki';
import { Field } from '@/components/ui/form';
import { Loading, Screen } from '@/components/ui/layout';
import { Badge, Button, Card, Row, T } from '@/components/ui/primitives';
import { createFromTemplate, ROUTINE_TEMPLATES, spreadOverDays, type RoutineTemplate } from '@/data/routineTemplates';
import { saveRoutine } from '@/data/routines';
import { getProfile } from '@/data/settings';
import { daysLabel } from '@/lib/dates';
import { useMutation, useQuery } from '@/state/db';
import { space } from '@/theme/tokens';

/** New routine: most people start from a ready plan; an empty one is there for those who know what they want. */
export default function NewRoutineScreen() {
  const run = useMutation();
  const [name, setName] = useState('');
  const { data: profile } = useQuery((db) => getProfile(db), []);
  if (!profile) return <Screen title="Nueva rutina"><Loading /></Screen>;

  const use = async (template: RoutineTemplate) => {
    const id = await run((db) => createFromTemplate(db, template, profile.trainingDays, profile.defaultRestSeconds), { success: '¡Listo! Ya podés ajustarla a tu gusto' });
    if (!id) return;
    if (template.days.length === 1) router.replace({ pathname: '/rutina/[id]', params: { id } });
    else router.back();
  };

  const blank = async () => {
    const id = await run((db) => saveRoutine(db, { name }));
    if (id) router.replace({ pathname: '/rutina/[id]', params: { id } });
  };

  return (
    <Screen title="Nueva rutina">
      <Row gap={space.md} style={{ marginBottom: space.lg }}>
        <Foki mood="strong" size={72} />
        <View style={{ flex: 1 }}>
          <T variant="title">Elegí un plan</T>
          <T variant="label" tone="muted">Después podés cambiar todo lo que quieras.</T>
        </View>
      </Row>

      <View style={{ gap: space.md }}>
        {ROUTINE_TEMPLATES.map((t) => {
          const days = spreadOverDays(t.days.length, profile.trainingDays);
          return (
            <Card key={t.key} onPress={() => void use(t)}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="h2" style={{ flexShrink: 1 }}>{t.title}</T>
                <Badge label={t.level} tone="muted" />
              </Row>
              <T variant="label" tone="muted" style={{ marginTop: 4 }}>{t.subtitle}</T>
              <T variant="caption" tone="dim" style={{ marginTop: space.sm }}>
                {t.days.map((d, i) => `${d.name}${days[i].length ? ` (${daysLabel(days[i])})` : ''}`).join(' · ')}
              </T>
            </Card>
          );
        })}
      </View>

      <T variant="label" tone="dim" style={{ marginTop: space.xl, marginBottom: space.sm, marginLeft: space.xs }}>O armala desde cero</T>
      <Card style={{ gap: space.md }}>
        <Field label="Nombre" value={name} onChangeText={setName} placeholder="Ej.: Pecho y tríceps" onSubmitEditing={blank} />
        <Button label="Crear y sumar ejercicios" icon="arrow-right" variant="secondary" onPress={blank} disabled={!name.trim()} />
      </Card>
    </Screen>
  );
}
