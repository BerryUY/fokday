import { useState } from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';
import { Foki } from '@/components/mascot/Foki';
import { ListRow, Loading, Screen } from '@/components/ui/layout';
import { Button, Card, Divider, Row, Segmented, T } from '@/components/ui/primitives';
import type { ChannelKey } from '@/notifications/channels';
import { INTENSITIES, type Intensity, type PlannedNotification } from '@/notifications/plan';
import { sendTestNotification } from '@/notifications/schedule';
import { currentPlan, getNotificationPrefs, saveNotificationPrefs } from '@/notifications/state';
import { useMutation, useQuery } from '@/state/db';
import { useToast } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const KINDS: { key: ChannelKey; label: string; hint: string }[] = [
  { key: 'streak', label: 'Tu racha', hint: 'Avisos antes de que se corte' },
  { key: 'meals', label: 'Comidas', hint: 'A las horas en que solés comer' },
  { key: 'workout', label: 'Entrenamiento', hint: 'Los días de gym' },
  { key: 'water', label: 'Agua', hint: 'Si seguís el agua' },
  { key: 'other', label: 'Otros', hint: 'Creatina, tareas y peso' },
];

const when = (d: Date) => {
  const day = d.toLocaleDateString('es-UY', { weekday: 'short' });
  return `${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** How much Foki insists, what about, and the messages coming next exactly as they'll look. */
export default function NotificationsScreen() {
  const c = useColors();
  const run = useMutation();
  const toast = useToast();
  const [sent, setSent] = useState(false);
  const { data } = useQuery(async (db) => ({ prefs: await getNotificationPrefs(db), plan: await currentPlan(db) }), []);
  if (!data) return <Screen title="Notificaciones"><Loading /></Screen>;
  const { prefs, plan } = data;
  const next = plan.slice(0, 5);

  const save = (patch: Partial<typeof prefs>) => run((db) => saveNotificationPrefs(db, { ...prefs, ...patch }), { silent: true });
  const toggle = (k: ChannelKey, on: boolean) => save({ off: on ? prefs.off.filter((x) => x !== k) : [...prefs.off, k] });

  return (
    <Screen title="Notificaciones">
      <T variant="label" tone="dim" style={styles.group}>Cuánto insiste Foki</T>
      <Segmented options={INTENSITIES.map((i) => ({ key: i.key, label: i.label }))} value={prefs.intensity} onChange={(intensity: Intensity) => void save({ intensity })} />
      <T variant="caption" tone="dim" style={{ marginTop: space.sm, marginLeft: space.xs }}>{INTENSITIES.find((i) => i.key === prefs.intensity)?.hint}</T>

      <T variant="label" tone="dim" style={[styles.group, { marginTop: space.xl }]}>Sobre qué te avisa</T>
      <Card padded={false} style={{ paddingVertical: space.xs }}>
        {KINDS.map((k, i) => (
          <View key={k.key}>
            {i > 0 ? <Divider style={{ marginLeft: space.lg }} /> : null}
            <ListRow
              title={k.label}
              subtitle={k.hint}
              right={<Switch value={!prefs.off.includes(k.key)} onValueChange={(v) => void toggle(k.key, v)} trackColor={{ true: c.accent, false: c.track }} thumbColor="#FFFFFF" />}
            />
          </View>
        ))}
      </Card>

      <T variant="label" tone="dim" style={[styles.group, { marginTop: space.xl }]}>Lo próximo que vas a recibir</T>
      <View style={{ gap: space.sm }}>
        {next.map((n) => (
          <NotificationCard key={n.id} n={n} />
        ))}
      </View>
      {Platform.OS !== 'web' && next[0] ? (
        <Button
          label={sent ? 'Enviada' : 'Probar una ahora'}
          icon="bell"
          variant="secondary"
          style={{ marginTop: space.lg }}
          disabled={sent}
          onPress={async () => {
            await sendTestNotification(next[0]);
            setSent(true);
            toast.show('Llega en un par de segundos');
          }}
        />
      ) : null}
    </Screen>
  );
}

/** Drawn like the real thing in the notification shade. */
function NotificationCard({ n }: { n: PlannedNotification }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.surface }]}>
      <View style={{ flex: 1 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="caption" tone="dim">FokDay</T>
          <T variant="caption" tone="dim">{when(n.at)}</T>
        </Row>
        <T variant="bodyMedium" style={{ marginTop: 2 }}>{n.title}</T>
        <T variant="label" tone="muted">{n.body}</T>
        {n.category ? (
          <Row gap={space.lg} style={{ marginTop: space.sm }}>
            {(n.category === 'meal' ? ['Sacar foto', 'Escanear'] : ['Sumar un vaso']).map((b) => (
              <T key={b} variant="label" tone="accent">{b}</T>
            ))}
          </Row>
        ) : null}
      </View>
      <View style={styles.tile}>
        <Foki mood={n.mood} lit={n.mood !== 'worried' && n.mood !== 'sad'} size={44} still color="#C8F560" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: space.sm, marginLeft: space.xs },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingLeft: space.lg, borderRadius: radius.lg },
  tile: { width: 62, height: 62, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F1210', overflow: 'hidden' },
});
