import { View } from 'react-native';
import { Row, T } from '@/components/ui/primitives';
import { EXTRA_NUTRIENTS, type Extras } from '@/domain/nutrition';
import { formatKg } from '@/lib/format';
import { useFeatures } from '@/state/features';
import { space } from '@/theme/tokens';

/** One line with the day's optional nutrients. Renders nothing for people who don't track any. */
export function ExtraTotals({ extras }: { extras: Extras }) {
  const { has } = useFeatures();
  const shown = EXTRA_NUTRIENTS.filter((n) => has(n.key));
  if (shown.length === 0) return null;
  return (
    <Row style={{ flexWrap: 'wrap', marginTop: space.lg }} gap={space.lg}>
      {shown.map((n) => (
        <View key={n.key}>
          <T variant="caption" tone="dim">{n.label}</T>
          <T variant="bodyMedium">{formatKg(extras[n.key] ?? 0)} {n.unit}</T>
        </View>
      ))}
    </Row>
  );
}
