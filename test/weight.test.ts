import { addMilestone, listMilestones, listWeights, saveWeight, updateWeight } from '@/data/weight';
import { changeFromPrevious, changeOverDays, milestoneStatus, rollingAverage, weightProgress } from '@/domain/weight';
import { createTestDb } from './helpers/db';

describe('weight progress', () => {
  it('has no current weight until something is measured (no fake values)', () => {
    expect(weightProgress(57, 65, [])).toEqual({
      start: 57, target: 65, current: null, gained: null, remaining: null, progress: null, reached: false,
    });
  });

  it('uses the latest real measurement', () => {
    const p = weightProgress(57, 65, [
      { date: '2026-01-10', weight: 58.4 },
      { date: '2026-01-01', weight: 57.2 },
    ]);
    expect(p).toMatchObject({ current: 58.4, gained: 1.4, remaining: 6.6, reached: false });
    expect(p.progress).toBeCloseTo(1.4 / 8, 5);
  });

  it('clamps progress and flags the goal when reached', () => {
    expect(weightProgress(57, 65, [{ date: '2026-09-01', weight: 65.3 }])).toMatchObject({ remaining: 0, progress: 1, reached: true });
    expect(weightProgress(57, 65, [{ date: '2026-09-01', weight: 56.5 }])).toMatchObject({ gained: -0.5, progress: 0 });
  });

  it('computes a 7-day rolling average from real points only', () => {
    const avg = rollingAverage([
      { date: '2026-01-01', weight: 57 },
      { date: '2026-01-03', weight: 58 },
      { date: '2026-01-07', weight: 59 },
      { date: '2026-01-09', weight: 60 },
    ]);
    expect(avg.map((a) => a.weight)).toEqual([57, 57.5, 58, 59]);
  });

  it('measures weekly/monthly change against the last measurement old enough', () => {
    const entries = [
      { date: '2026-01-01', weight: 57 },
      { date: '2026-01-20', weight: 58 },
      { date: '2026-01-31', weight: 58.6 },
    ];
    expect(changeOverDays(entries, 7)?.change).toBe(0.6);
    expect(changeOverDays(entries, 30)?.change).toBe(1.6);
    expect(changeOverDays(entries, 60)).toBeNull();
    expect(changeFromPrevious(entries)).toBe(0.6);
  });

  it('marks milestones on the first day they were actually reached', () => {
    const status = milestoneStatus([60, 58], [
      { date: '2026-02-01', weight: 58.1 },
      { date: '2026-02-08', weight: 57.9 },
    ]);
    expect(status).toEqual([
      { weight: 58, achievedOn: '2026-02-01' },
      { weight: 60, achievedOn: null },
    ]);
  });
});

describe('weight entries', () => {
  it('keeps one measurement per day and lets entries be corrected', async () => {
    const db = await createTestDb();
    expect(await saveWeight(db, '2026-01-01', 57.3)).toEqual({ replaced: false });
    expect(await saveWeight(db, '2026-01-01', 57.1)).toEqual({ replaced: true });
    await saveWeight(db, '2026-01-02', 57.4);
    const entries = await listWeights(db);
    expect(entries).toHaveLength(2);
    expect(entries[0].weight).toBe(57.1);

    await expect(updateWeight(db, entries[1].id, '2026-01-01', 57.4)).rejects.toThrow(/Ya hay un peso/);
    await updateWeight(db, entries[1].id, '2026-01-05', 57.6);
    expect((await listWeights(db)).map((e) => e.date)).toEqual(['2026-01-01', '2026-01-05']);
    await expect(saveWeight(db, '2026-01-06', 5)).rejects.toThrow();
  });

  it('stores milestones without duplicates', async () => {
    const db = await createTestDb();
    await addMilestone(db, 60, 'Primeros 3 kg');
    await addMilestone(db, 60, 'Renombrado');
    const ms = await listMilestones(db);
    expect(ms).toEqual([expect.objectContaining({ weight: 60, label: 'Renombrado' })]);
  });
});
