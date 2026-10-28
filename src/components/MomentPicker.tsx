import { View } from 'react-native';
import { Chip, Row, T } from '@/components/ui/primitives';
import { MEAL_CATEGORIES, type MealCategory } from '@/domain/nutrition';

/** "¿Cuándo la comiste?" — any food can count as any moment (a snack can be breakfast). */
export function MomentPicker({ value, onChange, label = '¿Cuándo?' }: { value: MealCategory; onChange: (m: MealCategory) => void; label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <T variant="label" tone="muted">{label}</T>
      <Row style={{ flexWrap: 'wrap' }} gap={6}>
        {MEAL_CATEGORIES.map((cat) => (
          <Chip key={cat.key} label={cat.short} compact selected={value === cat.key} onPress={() => onChange(cat.key)} />
        ))}
      </Row>
    </View>
  );
}
