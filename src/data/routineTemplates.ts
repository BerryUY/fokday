import type { Db } from '@/db/types';
import { addRoutineExercise, listExercises, saveExercise, saveRoutine, setRoutineWeekdays } from './routines';

/**
 * Ready-made plans, so nobody has to design a routine from a blank screen on day one. Each one
 * creates its routines with their exercises and spreads them over the person's training days.
 * Everything can be edited afterwards.
 */

type Item = { name: string; group: string; sets: number; reps: [number, number] };
type Day = { name: string; exercises: Item[] };
export type RoutineTemplate = { key: string; title: string; subtitle: string; level: string; days: Day[] };

const ex = (name: string, group: string, sets = 3, reps: [number, number] = [8, 12]): Item => ({ name, group, sets, reps });

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    key: 'full-body',
    title: 'Cuerpo completo',
    subtitle: 'Todo el cuerpo en cada entrenamiento. Ideal para 2 o 3 días por semana.',
    level: 'Para arrancar',
    days: [
      {
        name: 'Cuerpo completo',
        exercises: [
          ex('Sentadilla', 'Cuádriceps'),
          ex('Press de banca', 'Pecho'),
          ex('Remo con barra', 'Espalda'),
          ex('Press militar', 'Hombros'),
          ex('Curl con barra', 'Bíceps', 2),
          ex('Plancha', 'Core', 3, [30, 45]),
        ],
      },
    ],
  },
  {
    key: 'upper-lower',
    title: 'Torso y pierna',
    subtitle: 'Dos entrenamientos que se alternan. Ideal para 4 días por semana.',
    level: 'Intermedio',
    days: [
      {
        name: 'Torso',
        exercises: [
          ex('Press de banca', 'Pecho', 4),
          ex('Remo con barra', 'Espalda', 4),
          ex('Press militar', 'Hombros'),
          ex('Jalón al pecho', 'Espalda'),
          ex('Curl con barra', 'Bíceps'),
          ex('Extensión de tríceps en polea', 'Tríceps'),
        ],
      },
      {
        name: 'Pierna',
        exercises: [
          ex('Sentadilla', 'Cuádriceps', 4),
          ex('Peso muerto rumano', 'Isquiotibiales'),
          ex('Prensa', 'Cuádriceps'),
          ex('Curl femoral', 'Isquiotibiales'),
          ex('Elevación de talones', 'Pantorrillas', 4, [12, 15]),
        ],
      },
    ],
  },
  {
    key: 'push-pull-legs',
    title: 'Empuje, tirón y pierna',
    subtitle: 'Tres entrenamientos que rotan. Ideal para 3 a 6 días por semana.',
    level: 'Avanzado',
    days: [
      {
        name: 'Empuje',
        exercises: [
          ex('Press de banca', 'Pecho', 4),
          ex('Press inclinado con mancuernas', 'Pecho'),
          ex('Press militar', 'Hombros'),
          ex('Elevaciones laterales', 'Hombros', 3, [12, 15]),
          ex('Extensión de tríceps en polea', 'Tríceps'),
        ],
      },
      {
        name: 'Tirón',
        exercises: [
          ex('Dominadas', 'Espalda', 4, [6, 10]),
          ex('Remo con barra', 'Espalda', 4),
          ex('Jalón al pecho', 'Espalda'),
          ex('Curl con barra', 'Bíceps'),
          ex('Curl martillo', 'Bíceps'),
        ],
      },
      {
        name: 'Pierna',
        exercises: [
          ex('Sentadilla', 'Cuádriceps', 4),
          ex('Peso muerto rumano', 'Isquiotibiales'),
          ex('Prensa', 'Cuádriceps'),
          ex('Hip thrust', 'Glúteos'),
          ex('Elevación de talones', 'Pantorrillas', 4, [12, 15]),
        ],
      },
    ],
  },
  {
    key: 'home',
    title: 'En casa, sin equipo',
    subtitle: 'Solo con tu peso. Para cuando no vas al gym.',
    level: 'Para arrancar',
    days: [
      {
        name: 'En casa',
        exercises: [
          ex('Sentadilla libre', 'Cuádriceps', 3, [12, 20]),
          ex('Flexiones de brazos', 'Pecho', 3, [8, 15]),
          ex('Zancadas', 'Cuádriceps', 3, [10, 12]),
          ex('Fondos en silla', 'Tríceps', 3, [8, 12]),
          ex('Puente de glúteos', 'Glúteos', 3, [12, 15]),
          ex('Plancha', 'Core', 3, [30, 45]),
        ],
      },
    ],
  },
];

/** Which routine goes on each training day: they take turns over the days of the week. */
export function spreadOverDays(routines: number, trainingDays: number[]): number[][] {
  const out: number[][] = Array.from({ length: routines }, () => []);
  // Monday first, so a Mon/Wed/Fri plan starts the week with the first routine.
  const ordered = [...trainingDays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  ordered.forEach((day, i) => out[i % routines].push(day));
  return out;
}

/** Creates the template's routines (reusing exercises the person already has) and returns the first one's id. */
export async function createFromTemplate(db: Db, template: RoutineTemplate, trainingDays: number[], restSeconds: number): Promise<string> {
  const known = new Map((await listExercises(db)).map((e) => [e.name.toLowerCase(), e.id]));
  const days = spreadOverDays(template.days.length, trainingDays);
  let first = '';
  for (const [i, day] of template.days.entries()) {
    const routineId = await saveRoutine(db, { name: day.name });
    first ||= routineId;
    for (const item of day.exercises) {
      const key = item.name.toLowerCase();
      const exerciseId = known.get(key) ?? (await saveExercise(db, { name: item.name, muscleGroup: item.group }));
      known.set(key, exerciseId);
      await addRoutineExercise(db, routineId, exerciseId, { sets: item.sets, repsMin: item.reps[0], repsMax: item.reps[1], restSeconds, notes: null });
    }
    if (days[i].length) await setRoutineWeekdays(db, routineId, days[i]);
  }
  return first;
}
