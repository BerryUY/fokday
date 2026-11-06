import { View } from 'react-native';
import { ProgressBar } from '@/components/ui/progress';
import { Row, T } from '@/components/ui/primitives';
import { EXTRA_NUTRIENTS, extraTargets, goalProgress, type Extras } from '@/domain/nutrition';
import { formatKg } from '@/lib/format';
import { useFeatures } from '@/state/features';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** The day's optional nutrients with what's left of each. Renders nothing for people who don't track any. */
export function ExtraTotals({ extras, calories, protein }: { extras: Extras; calories: number; protein: number }) {
  const c = useColors();
  const { has } = useFeatures();
  const shown = EXTRA_NUTRIENTS.filter((n) => has(n.key));
  if (shown.length === 0) return null;
  const targets = extraTargets(calories, protein);
  return (
    <View style={{ gap: space.md, marginTop: space.xl }}>
      {shown.map((n) => {
        const g = goalProgress(extras[n.key] ?? 0, targets[n.key]);
        return (
          <View key={n.key} style={{ gap: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="label" tone="muted">{n.label}</T>
              <T variant="label">
                {formatKg(g.consumed)} / {formatKg(g.target)} {n.unit}
                <T variant="label" tone="dim">{g.remaining > 0 ? ` · faltan ${formatKg(g.remaining)}` : ' · listo'}</T>
              </T>
            </Row>
            <ProgressBar progress={g.ratio} color={c.weight} height={5} />
          </View>
        );
      })}
    </View>
  );
}
