import { dailyTargets, restingEnergy } from '@/domain/energy';
import { isValidWeight, WEIGHT_RANGE } from '@/domain/weight';

describe('Mifflin-St Jeor', () => {
  it('matches the published equation', () => {
    // 10×80 + 6.25×180 − 5×30 + 5 = 1780
    expect(restingEnergy({ weightKg: 80, heightCm: 180, age: 30, sex: 'male' })).toBe(1780);
    // 10×60 + 6.25×165 − 5×28 − 161 = 1330.25
    expect(restingEnergy({ weightKg: 60, heightCm: 165, age: 28, sex: 'female' })).toBeCloseTo(1330.25);
    expect(restingEnergy({ weightKg: 60, heightCm: 165, age: 28, sex: 'unspecified' })).toBeCloseTo(1413.25);
  });
});

describe('daily targets', () => {
  const man = { weightKg: 80, heightCm: 180, age: 30, sex: 'male' as const, activity: 'moderate' as const };

  it('maintains at resting × activity, cuts ~20% to lose, adds ~10% to gain', () => {
    // 1780 × 1.55 = 2759
    expect(dailyTargets(man, 'maintain')).toMatchObject({ calories: 2750, maintenance: 2759, protein: 130 });
    expect(dailyTargets(man, 'lose').calories).toBe(2200);
    expect(dailyTargets(man, 'gain').calories).toBe(3050);
  });

  it('never goes below resting energy when losing', () => {
    const t = dailyTargets({ ...man, activity: 'sedentary' }, 'lose');
    expect(t.calories).toBeGreaterThanOrEqual(t.resting - 25);
  });

  it('more protein while losing, and based on a healthier weight with a high BMI', () => {
    expect(dailyTargets(man, 'lose').protein).toBe(160);
    // 150 kg at 1.75 m (BMI 49): reference = max(BMI-25 weight 76.6, target 100) = 100 kg → 200 g
    expect(dailyTargets({ weightKg: 150, heightCm: 175, age: 35, sex: 'male', activity: 'light' }, 'lose', 100).protein).toBe(200);
  });
});

describe('weight range', () => {
  it('accepts heavy but real weights and rejects typos like 900 kg', () => {
    expect(isValidWeight(WEIGHT_RANGE.min)).toBe(true);
    expect(isValidWeight(320)).toBe(true);
    expect(isValidWeight(900)).toBe(false);
    expect(isValidWeight(5)).toBe(false);
  });
});
