import { guessCategory } from '@/domain/nutrition';

describe('meal moment from the time of day', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 28, h, m);
  it('maps hours to moments', () => {
    expect(guessCategory(at(7))).toBe('desayuno');
    expect(guessCategory(at(10, 59))).toBe('desayuno');
    expect(guessCategory(at(13))).toBe('almuerzo');
    expect(guessCategory(at(17, 30))).toBe('merienda');
    expect(guessCategory(at(21))).toBe('cena');
    expect(guessCategory(at(1))).toBe('cena');
  });
});
