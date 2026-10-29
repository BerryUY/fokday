import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';
import { getMeta, setMeta } from '@/backup/snapshot';
import { useMutation, useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Card, IconButton, PressableScale, Row, T } from './ui/primitives';

const TOUR_META = 'tour_state';

/**
 * A quiet invitation on Inicio for new people: take the 30-second tour or close it. Never comes
 * back once seen or dismissed (the tour stays in Ajustes).
 */
export function TourCard() {
  const c = useColors();
  const run = useMutation();
  const { data: state } = useQuery((db) => getMeta(db, TOUR_META), []);
  if (state !== null) return null;
  return (
    <Card tone="outline" style={{ marginBottom: space.lg, paddingVertical: space.md }}>
      <Row gap={space.md}>
        <PressableScale style={{ flex: 1 }} onPress={() => router.push('/tour')} accessibilityRole="button" accessibilityLabel="Ver el tour de la app">
          <Row gap={space.md}>
            <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="compass" size={20} color={c.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="bodyMedium">¿Primera vez en FokDay?</T>
              <T variant="caption" tone="accent">Mirá el tour de 30 segundos</T>
            </View>
          </Row>
        </PressableScale>
        <IconButton icon="x" label="No, gracias" size={32} onPress={() => run((db) => setMeta(db, TOUR_META, 'dismissed'), { silent: true })} />
      </Row>
    </Card>
  );
}
