/**
 * The open exercise guide (free-exercise-db, public domain): 800+ exercises with two photos
 * each (start and end position). The source is in English; names and steps are shown from a
 * Spanish translation made once (src/data/exercises-es.json), and the English name stays searchable.
 */

export const CATALOG_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
export const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export type CatalogExercise = {
  id: string;
  name: string;
  /** The original English name, kept for search ("bench" finds "Press de banca"). */
  nameEn: string;
  level: string;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
};

const MUSCLE_ES: Record<string, string> = {
  abdominals: 'Abdominales', hamstrings: 'Isquiotibiales', adductors: 'Aductores', abductors: 'Abductores',
  quadriceps: 'Cuádriceps', biceps: 'Bíceps', shoulders: 'Hombros', chest: 'Pecho', 'middle back': 'Espalda media',
  calves: 'Gemelos', glutes: 'Glúteos', 'lower back': 'Espalda baja', lats: 'Dorsales', triceps: 'Tríceps',
  traps: 'Trapecios', forearms: 'Antebrazos', neck: 'Cuello',
};

/** Which of the app's muscle groups an exercise belongs to (what is saved in your library). */
const MUSCLE_GROUP: Record<string, string> = {
  abdominals: 'Core', hamstrings: 'Isquiotibiales', adductors: 'Glúteos', abductors: 'Glúteos', quadriceps: 'Cuádriceps',
  biceps: 'Bíceps', shoulders: 'Hombros', chest: 'Pecho', 'middle back': 'Espalda', calves: 'Pantorrillas', glutes: 'Glúteos',
  'lower back': 'Espalda', lats: 'Espalda', triceps: 'Tríceps', traps: 'Espalda', forearms: 'Antebrazos', neck: 'Otro',
};

const EQUIPMENT_ES: Record<string, string> = {
  'body only': 'Peso corporal', machine: 'Máquina', other: 'Otro', 'foam roll': 'Rodillo', kettlebells: 'Pesa rusa',
  dumbbell: 'Mancuernas', cable: 'Polea', barbell: 'Barra', bands: 'Bandas', 'medicine ball': 'Balón medicinal',
  'exercise ball': 'Pelota', 'e-z curl bar': 'Barra Z',
};

const LEVEL_ES: Record<string, string> = { beginner: 'Principiante', intermediate: 'Intermedio', expert: 'Avanzado' };

export const muscleLabel = (m: string) => MUSCLE_ES[m] ?? m;
export const equipmentLabel = (e: string | null) => (e ? EQUIPMENT_ES[e] ?? e : 'Sin equipo');
export const levelLabel = (l: string) => LEVEL_ES[l] ?? l;
export const imageUrl = (path: string) => IMAGE_BASE + path;

/** The app's group for an exercise, from its main muscle (cardio and stretches have their own). */
export function groupFor(e: Pick<CatalogExercise, 'primaryMuscles' | 'category'>): string {
  if (e.category === 'cardio') return 'Cardio';
  return MUSCLE_GROUP[e.primaryMuscles[0] ?? ''] ?? 'Otro';
}

/** Filters shown as chips: the app's muscle groups plus cardio and stretching. */
export const CATALOG_FILTERS = ['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Pantorrillas', 'Core', 'Antebrazos', 'Cardio', 'Estiramientos'] as const;
export type CatalogFilter = (typeof CATALOG_FILTERS)[number];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Accepts the raw JSON defensively: entries without a name or id are dropped. */
export function parseCatalog(raw: unknown): CatalogExercise[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogExercise[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (typeof r?.id !== 'string' || typeof r?.name !== 'string') continue;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    out.push({
      id: r.id,
      name: r.name,
      nameEn: r.name,
      level: typeof r.level === 'string' ? r.level : '',
      equipment: typeof r.equipment === 'string' && r.equipment ? r.equipment : null,
      primaryMuscles: list(r.primaryMuscles),
      secondaryMuscles: list(r.secondaryMuscles),
      instructions: list(r.instructions),
      category: typeof r.category === 'string' ? r.category : '',
      images: list(r.images),
    });
  }
  return out;
}

/** Spanish name and steps per exercise id: { n: name, i: steps }. */
export type CatalogTranslations = Record<string, { n: string; i: string[] }>;

/** Swaps in the Spanish name and steps where a translation exists; the rest stay in English. */
export function applySpanish(all: CatalogExercise[], es: CatalogTranslations): CatalogExercise[] {
  return all.map((e) => {
    const t = es[e.id];
    if (!t) return e;
    return { ...e, name: t.n, instructions: t.i.length === e.instructions.length ? t.i : e.instructions };
  });
}

/** Search by name (Spanish or English), muscle or equipment, optionally within one filter. */
export function searchCatalog(all: CatalogExercise[], query: string, filter: CatalogFilter | null): CatalogExercise[] {
  const q = fold(query.trim());
  return all.filter((e) => {
    if (filter === 'Estiramientos' ? e.category !== 'stretching' : filter && (e.category === 'stretching' || groupFor(e) !== filter)) return false;
    if (!q) return true;
    const haystack = [e.name, e.nameEn, ...e.primaryMuscles.map(muscleLabel), equipmentLabel(e.equipment)].map(fold).join(' ');
    return q.split(/\s+/).every((word) => haystack.includes(word));
  });
}
