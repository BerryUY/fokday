import { copiesToDelete, folderFileName, isWeeklyDue } from '@/backup/weekly';

describe('weekly folder copies', () => {
  const now = new Date('2026-10-21T18:30:00Z');

  it('is due the first time, after a week, or if the clock went back', () => {
    expect(isWeeklyDue(null, now)).toBe(true);
    expect(isWeeklyDue('2026-10-18T18:30:00Z', now)).toBe(false);
    expect(isWeeklyDue('2026-10-14T18:30:00Z', now)).toBe(true);
    expect(isWeeklyDue('2027-01-01T00:00:00Z', now)).toBe(true);
    expect(isWeeklyDue('basura', now)).toBe(true);
  });

  it('names files so they sort by date', () => {
    expect(folderFileName(new Date(2026, 9, 21, 9, 5))).toBe('momentum-respaldo-2026-10-21-0905.json');
  });

  it('keeps the 4 newest copies and never touches other files', () => {
    const names = [
      'momentum-respaldo-2026-09-01-1000.json',
      'momentum-respaldo-2026-09-08-1000.json',
      'momentum-respaldo-2026-09-15-1000.json',
      'momentum-respaldo-2026-09-22-1000.json',
      'momentum-respaldo-2026-09-29-1000.json',
      'foto.jpg',
      'momentum-respaldo-notas.txt',
    ];
    expect(copiesToDelete(names)).toEqual(['momentum-respaldo-2026-09-01-1000.json']);
    expect(copiesToDelete(names.slice(0, 3))).toEqual([]);
  });
});
