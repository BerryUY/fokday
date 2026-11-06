import { View } from 'react-native';
import { ListRow, Loading, Screen } from '@/components/ui/layout';
import { Card, Divider, T, Toggle } from '@/components/ui/primitives';
import type { ChannelKey } from '@/notifications/channels';
import { getMutedKinds, saveMutedKinds } from '@/notifications/state';
import { useMutation, useQuery } from '@/state/db';
import { space } from '@/theme/tokens';

const KINDS: { key: ChannelKey; label: string; hint: string }[] = [
  { key: 'streak', label: 'Tu racha', hint: 'Avisos antes de que se corte' },
  { key: 'meals', label: 'Comidas', hint: 'A las horas en que solés comer' },
  { key: 'workout', label: 'Entrenamiento', hint: 'Los días de gym' },
  { key: 'water', label: 'Agua', hint: 'Si seguís el agua' },
  { key: 'other', label: 'Otros', hint: 'Creatina, tareas y peso' },
];

/** What Foki reminds you about. How often isn't a choice: the app decides. */
export default function NotificationsScreen() {
  const run = useMutation();
  const { data: off } = useQuery((db) => getMutedKinds(db), []);
  if (!off) return <Screen title="Notificaciones"><Loading /></Screen>;

  const toggle = (k: ChannelKey, on: boolean) => run((db) => saveMutedKinds(db, on ? off.filter((x) => x !== k) : [...off, k]), { silent: true });

  return (
    <Screen title="Notificaciones">
      <T variant="label" tone="dim" style={{ marginBottom: space.sm, marginLeft: space.xs }}>Sobre qué te avisa Foki</T>
      <Card padded={false} style={{ paddingVertical: space.xs }}>
        {KINDS.map((k, i) => (
          <View key={k.key}>
            {i > 0 ? <Divider style={{ marginLeft: space.lg }} /> : null}
            <ListRow title={k.label} subtitle={k.hint} right={<Toggle value={!off.includes(k.key)} onValueChange={(v) => void toggle(k.key, v)} accessibilityLabel={k.label} />} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
