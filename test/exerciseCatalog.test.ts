import { equipmentLabel, groupFor, imageUrl, muscleLabel, parseCatalog, searchCatalog } from '@/domain/exerciseCatalog';

const raw = [
  { id: 'Barbell_Bench_Press', name: 'Barbell Bench Press - Medium Grip', level: 'beginner', equipment: 'barbell', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], instructions: ['Lie back.'], category: 'strength', images: ['Barbell_Bench_Press/0.jpg', 'Barbell_Bench_Press/1.jpg'] },
  { id: 'Barbell_Squat', name: 'Barbell Squat', level: 'beginner', equipment: 'barbell', primaryMuscles: ['quadriceps'], secondaryMuscles: [], instructions: [], category: 'strength', images: [] },
  { id: 'Jogging', name: 'Jogging, Treadmill', level: 'beginner', equipment: 'machine', primaryMuscles: ['quadriceps'], secondaryMuscles: [], instructions: [], category: 'cardio', images: [] },
  { id: 'Hamstring_Stretch', name: 'Hamstring Stretch', level: 'beginner', equipment: null, primaryMuscles: ['hamstrings'], secondaryMuscles: [], instructions: [], category: 'stretching', images: [] },
  { name: 'Broken entry without id' },
];

describe('exercise guide', () => {
  const all = parseCatalog(raw);

  it('parses defensively and drops broken entries', () => {
    expect(all).toHaveLength(4);
    expect(parseCatalog('nope')).toEqual([]);
  });

  it('translates muscles, equipment and groups', () => {
    expect(muscleLabel('chest')).toBe('Pecho');
    expect(equipmentLabel('barbell')).toBe('Barra');
    expect(equipmentLabel(null)).toBe('Sin equipo');
    expect(groupFor(all[0])).toBe('Pecho');
    expect(groupFor(all[2])).toBe('Cardio');
    expect(imageUrl('A/0.jpg')).toMatch(/^https:\/\/raw\.githubusercontent\.com\/.+\/exercises\/A\/0\.jpg$/);
  });

  it('searches by English name or Spanish muscle, within a filter', () => {
    expect(searchCatalog(all, 'bench', null).map((e) => e.id)).toEqual(['Barbell_Bench_Press']);
    expect(searchCatalog(all, 'cuadriceps', null).map((e) => e.id)).toEqual(['Barbell_Squat', 'Jogging']);
    expect(searchCatalog(all, '', 'Cuádriceps').map((e) => e.id)).toEqual(['Barbell_Squat']);
    expect(searchCatalog(all, '', 'Cardio').map((e) => e.id)).toEqual(['Jogging']);
    expect(searchCatalog(all, '', 'Estiramientos').map((e) => e.id)).toEqual(['Hamstring_Stretch']);
    expect(searchCatalog(all, 'barra pecho', null).map((e) => e.id)).toEqual(['Barbell_Bench_Press']);
  });
});
