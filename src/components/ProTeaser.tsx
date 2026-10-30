import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';
import { PRO_LIST_PRICES } from '@/billing/pro';
import { Card, Row, T } from '@/components/ui/primitives';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Inicio, free plan: what Pro adds and what it costs, one tap from the plans. */
export function ProTeaser() {
  const c = useColors();
  return (
    <Card tone="accent" onPress={() => router.push('/pro')} style={{ gap: space.md }}>
      <Row gap={space.md}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="zap" size={20} color={c.accentText} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="h3">Pasate a Pro</T>
          <T variant="caption" tone="muted">20 fotos con IA por día, resumen semanal, escáner ilimitado y sin videos</T>
        </View>
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="bodyMedium" tone="accent">Desde {PRO_LIST_PRICES.annualPerMonth} por mes</T>
        <Feather name="arrow-right" size={18} color={c.accent} />
      </Row>
    </Card>
  );
}
