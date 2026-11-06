import { router } from 'expo-router';
import { View } from 'react-native';
import { Sheet } from '@/components/ui/form';
import { ListRow } from '@/components/ui/layout';
import { Button, Card, Divider } from '@/components/ui/primitives';
import { daysLabel } from '@/lib/dates';
import type { RoutineSummary } from '@/data/routines';
import { space } from '@/theme/tokens';

/** "What are you training today?": one tap on a routine starts it. Used from Inicio and Entrenar. */
export function RoutinePicker({ visible, onClose, routines, onStart }: {
  visible: boolean;
  onClose: () => void;
  routines: RoutineSummary[];
  onStart: (routine: RoutineSummary | null) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="¿Qué entrenás hoy?">
      <View style={{ gap: space.md }}>
        {routines.length ? (
          <Card tone="alt" padded={false} style={{ paddingVertical: space.xs }}>
            {routines.map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <Divider style={{ marginLeft: 62 }} /> : null}
                <ListRow
                  icon="play"
                  iconTone="accent"
                  title={r.name}
                  subtitle={`${r.exerciseCount} ejercicios${r.weekdays.length ? ` · ${daysLabel(r.weekdays)}` : ''}`}
                  onPress={() => {
                    onClose();
                    onStart(r);
                  }}
                />
              </View>
            ))}
          </Card>
        ) : null}
        <Button
          label="Sin rutina: voy sumando ejercicios"
          icon="zap"
          variant="secondary"
          onPress={() => {
            onClose();
            onStart(null);
          }}
        />
        <Button
          label="Crear una rutina nueva"
          icon="plus"
          variant="ghost"
          size="sm"
          onPress={() => {
            onClose();
            router.push('/rutina/nueva');
          }}
        />
      </View>
    </Sheet>
  );
}
