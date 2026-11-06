import { View } from 'react-native';
import { ListRow, Loading, Screen } from '@/components/ui/layout';
import { Card, Divider, Segmented, T, Toggle } from '@/components/ui/primitives';
import type { ChannelKey } from '@/notifications/channels';
import { INTENSITIES, type Intensity } from '@/notifications/plan';
import { getNotificationPrefs, saveNotificationPrefs } from '@/notifications/state';
import { useMutation, useQuery } from '@/state/db';
import { space } from '@/theme/tokens';

const KINDS: { key: ChannelKey; label: string; hint: string }[] = [
  { key: 'streak', label: 'Tu racha', hint: 'Avisos antes de que se corte' },
  { key: 'meals', label: 'Comidas', hint: 'A las horas en que solés comer' },
  { key: 'workout', label: 'Entrenamiento', hint: 'Los días de gym' },
  { key: 'water', label: 'Agua', hint: 'Si seguís el agua' },
  { key: 'other', label: 'Otros', hint: 'Creatina, tareas y peso' },
];

/** How much Foki insists, and about what. */
export default function NotificationsScreen() {
  const run = useMutation();
  const { data: prefs } = useQuery((db) => getNotificationPrefs(db), []);
  if (!prefs) return <Screen title="Notificaciones"><Loading /></Screen>;

  const save = (patch: Partial<typeof prefs>) => run((db) => saveNotificationPrefs(db, { ...prefs, ...patch }), { silent: true });
  const toggle = (k: ChannelKey, on: boolean) => save({ off: on ? prefs.off.filter((x) => x !== k) : [...prefs.off, k] });

  return (
    <Screen title="Notificaciones">
      <T variant="label" tone="dim" style={{ marginBottom: space.sm, marginLeft: space.xs }}>Cuánto insiste Foki</T>
      <Segmented options={INTENSITIES.map((i) => ({ key: i.key, label: i.label }))} value={prefs.intensity} onChange={(intensity: Intensity) => void save({ intensity })} />
      <T variant="caption" tone="dim" style={{ marginTop: space.sm, marginLeft: space.xs }}>{INTENSITIES.find((i) => i.key === prefs.intensity)?.hint}</T>

      <T variant="label" tone="dim" style={{ marginTop: space.xl, marginBottom: space.sm, marginLeft: space.xs }}>Sobre qué te avisa</T>
      <Card padded={false} style={{ paddingVertical: space.xs }}>
        {KINDS.map((k, i) => (
          <View key={k.key}>
            {i > 0 ? <Divider style={{ marginLeft: space.lg }} /> : null}
            <ListRow title={k.label} subtitle={k.hint} right={<Toggle value={!prefs.off.includes(k.key)} onValueChange={(v) => void toggle(k.key, v)} accessibilityLabel={k.label} />} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
