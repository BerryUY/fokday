import { View } from 'react-native';
import { Field } from '@/components/ui/form';
import { Row } from '@/components/ui/primitives';
import type { FeatureKey } from '@/data/settings';
import { EXTRA_NUTRIENTS, type ExtraKey, type Extras } from '@/domain/nutrition';
import { parseNonNegative, toInput } from '@/lib/format';
import { space } from '@/theme/tokens';

export type ExtraTexts = Partial<Record<ExtraKey, string>>;

export function extrasToTexts(extras: Extras | undefined): ExtraTexts {
  const out: ExtraTexts = {};
  for (const n of EXTRA_NUTRIENTS) if (extras?.[n.key]) out[n.key] = toInput(extras[n.key]!, 1);
  return out;
}

/** Only the nutrients the person tracks are read; anything else is left out. */
export function textsToExtras(texts: ExtraTexts, enabled: FeatureKey[]): Extras {
  const out: Extras = {};
  for (const n of EXTRA_NUTRIENTS) {
    if (!enabled.includes(n.key)) continue;
    const v = parseNonNegative(texts[n.key] ?? '');
    if (v) out[n.key] = v;
  }
  return out;
}

/** Input fields for the optional nutrients this person turned on. Renders nothing when none are on. */
export function ExtraFields({ enabled, value, onChange }: { enabled: FeatureKey[]; value: ExtraTexts; onChange: (next: ExtraTexts) => void }) {
  const shown = EXTRA_NUTRIENTS.filter((n) => enabled.includes(n.key));
  if (shown.length === 0) return null;
  const rows: (typeof shown)[] = [];
  for (let i = 0; i < shown.length; i += 2) rows.push(shown.slice(i, i + 2));
  return (
    <View style={{ gap: space.lg }}>
      {rows.map((row) => (
        <Row key={row[0].key} gap={space.md} align="flex-start">
          {row.map((n) => (
            <View key={n.key} style={{ flex: 1 }}>
              <Field
                label={`${n.label} (opcional)`}
                value={value[n.key] ?? ''}
                onChangeText={(t) => onChange({ ...value, [n.key]: t })}
                keyboardType="decimal-pad"
                suffix={n.unit}
                error={value[n.key] && parseNonNegative(value[n.key]!) === null ? 'Número inválido' : null}
              />
            </View>
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </Row>
      ))}
    </View>
  );
}
