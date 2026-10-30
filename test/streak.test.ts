import { logMeal } from '@/data/meals';
import { getStreak } from '@/data/streak';
import { markAttendance } from '@/data/attendance';
import { saveWeight } from '@/data/weight';
import { computeStreak, milestoneAt } from '@/domain/streak';
import { createTestDb } from './helpers/db';

const today = '2026-10-29'; // jueves

describe('computeStreak', () => {
  it('counts back from today when today already counts', () => {
    const s = computeStreak(['2026-10-27', '2026-10-28', '2026-10-29'], today);
    expect(s).toMatchObject({ current: 3, doneToday: true, longest: 3 });
  });

  it('keeps the streak alive while today is still open', () => {
    const s = computeStreak(['2026-10-26', '2026-10-27', '2026-10-28'], today);
    expect(s).toMatchObject({ current: 3, doneToday: false });
  });

  it('breaks after a whole day with nothing', () => {
    const s = computeStreak(['2026-10-25', '2026-10-26', '2026-10-27'], today);
    expect(s.current).toBe(0);
    expect(s.longest).toBe(3);
  });

  it('marks this week Monday first, with today and the days to come', () => {
    const s = computeStreak(['2026-10-26', '2026-10-28'], today);
    expect(s.week.map((d) => [d.date.slice(8), d.done, d.isToday, d.future])).toEqual([
      ['26', true, false, false],
      ['27', false, false, false],
      ['28', true, false, false],
      ['29', false, true, false],
      ['30', false, false, true],
      ['31', false, false, true],
      ['01', false, false, true],
    ]);
  });

  it('ignores future dates and knows the milestones', () => {
    expect(computeStreak(['2026-10-30'], today).current).toBe(0);
    expect(milestoneAt(7)).toBe(7);
    expect(milestoneAt(8)).toBeNull();
  });
});

describe('getStreak', () => {
  it('joins meals and training days; a weigh-in alone does not count', async () => {
    const db = await createTestDb();
    await logMeal(db, { date: '2026-10-27', category: 'almuerzo', manual: { name: 'Pollo', calories: 500, protein: 40 } });
    await markAttendance(db, '2026-10-28');
    await saveWeight(db, today, 70.2);
    expect(await getStreak(db, today)).toMatchObject({ current: 2, doneToday: false });
    await markAttendance(db, today);
    expect(await getStreak(db, today)).toMatchObject({ current: 3, doneToday: true });
  });
});
