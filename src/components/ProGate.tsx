import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { usePro } from '@/billing/pro';
import { Button, Card, Row, T } from '@/components/ui/primitives';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** "PRO" pill next to locked options. */
export function ProBadge() {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
      <T variant="overline" color={c.accentText} style={{ fontSize: 10, lineHeight: 14 }}>Pro</T>
    </View>
  );
}

/** A locked card that explains what Pro adds here and opens the plans. */
export function ProLock({ title, message }: { title: string; message: string }) {
  const c = useColors();
  return (
    <Card style={{ gap: space.md, alignItems: 'flex-start' }}>
      <Row gap={space.sm}>
        <Feather name="lock" size={18} color={c.accent} />
        <T variant="h3">{title}</T>
        <ProBadge />
      </Row>
      <T variant="label" tone="muted">{message}</T>
      <Button label="Ver FokDay Pro" icon="zap" size="sm" onPress={() => router.push('/pro')} />
    </Card>
  );
}

/** Shows children with Pro, or the lock card without it. */
export function ProGate({ title, message, children }: { title: string; message: string; children: ReactNode }) {
  return usePro() ? <>{children}</> : <ProLock title={title} message={message} />;
}
