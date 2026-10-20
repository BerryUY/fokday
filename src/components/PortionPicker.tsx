import { View } from 'react-native';
import { Stepper } from '@/components/ui/form';
import { Chip, Row, T } from '@/components/ui/primitives';
import { PORTIONS } from '@/domain/nutrition';
import { formatDecimal } from '@/lib/format';
import { space } from '@/theme/tokens';

export function PortionPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ gap: space.md }}>
      <Row style={{ flexWrap: 'wrap' }}>
        {PORTIONS.map((p) => (
          <Chip key={p} label={`${formatDecimal(p)}×`} selected={value === p} onPress={() => onChange(p)} />
        ))}
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="caption" tone="dim">Otra cantidad</T>
        <Stepper value={value} onChange={(v) => onChange(Math.round(v * 100) / 100)} min={0.25} max={5} step={0.25} format={(v) => `${formatDecimal(v, 2)}×`} />
      </Row>
    </View>
  );
}
