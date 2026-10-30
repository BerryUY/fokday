import type { MealCategory } from '@/domain/nutrition';

/**
 * Starter meals every new install gets: common, everyday dishes with approximate values, so the
 * app is useful from the first day. People edit, archive or add their own.
 *
 * `since` is the catalog version that introduced the meal. The seeder only inserts
 * meals newer than the catalog version already applied, and never touches rows
 * that exist, so edits and deletions survive app updates.
 */
export type CatalogMeal = {
  seedKey: string;
  since: number;
  code: string;
  name: string;
  category: MealCategory;
  calories: number;
  protein: number;
  /** The plan marks these values as estimates ("~650 kcal"). */
  isEstimate: boolean;
  prepMinutes: number | null;
  prepLabel: string | null;
  notes: string | null;
  tag: string | null;
  ingredients: string[];
};

export const CATALOG_VERSION = 1;

/** Neutral placeholders until the welcome screen asks for the real ones. */
export const DEFAULT_TARGETS = { calories: 2000, protein: 100 } as const;
export const DEFAULT_START_WEIGHT = 70;
export const DEFAULT_TARGET_WEIGHT = 70;
export const DEFAULT_NAME = '';

export const CATALOG: CatalogMeal[] = [
  // ---- Desayuno ----
  {
    seedKey: 'desayuno-a', since: 1, code: 'D1', name: 'Avena con leche y banana', category: 'desayuno',
    calories: 420, protein: 16, isEstimate: true, prepMinutes: 5, prepLabel: null, notes: null, tag: null,
    ingredients: ['50 g avena', '250 ml leche', '1 banana'],
  },
  {
    seedKey: 'desayuno-b', since: 1, code: 'D2', name: 'Tostadas con huevo revuelto', category: 'desayuno',
    calories: 400, protein: 20, isEstimate: true, prepMinutes: 10, prepLabel: null, notes: null, tag: null,
    ingredients: ['2 tostadas', '2 huevos', '1 cdita aceite'],
  },
  {
    seedKey: 'desayuno-c', since: 1, code: 'D3', name: 'Yogur con granola y fruta', category: 'desayuno',
    calories: 350, protein: 15, isEstimate: true, prepMinutes: 3, prepLabel: 'Sin cocina', notes: null, tag: null,
    ingredients: ['200 g yogur', '30 g granola', '1 fruta'],
  },
  {
    seedKey: 'desayuno-d', since: 1, code: 'D4', name: 'Café con leche y tostadas con queso', category: 'desayuno',
    calories: 380, protein: 18, isEstimate: true, prepMinutes: 5, prepLabel: null, notes: null, tag: null,
    ingredients: ['1 taza de café con leche', '2 tostadas', '2 fetas de queso'],
  },
  // ---- Almuerzo ----
  {
    seedKey: 'almuerzo-1', since: 1, code: 'A1', name: 'Pollo con arroz y ensalada', category: 'almuerzo',
    calories: 600, protein: 40, isEstimate: true, prepMinutes: 25, prepLabel: null, notes: null, tag: null,
    ingredients: ['150 g pollo', '1 taza de arroz cocido', 'ensalada a gusto'],
  },
  {
    seedKey: 'almuerzo-2', since: 1, code: 'A2', name: 'Fideos con salsa y carne picada', category: 'almuerzo',
    calories: 650, protein: 32, isEstimate: true, prepMinutes: 25, prepLabel: null, notes: null, tag: null,
    ingredients: ['1 plato de fideos cocidos', '100 g carne picada', 'salsa de tomate'],
  },
  {
    seedKey: 'almuerzo-3', since: 1, code: 'A3', name: 'Milanesa con puré', category: 'almuerzo',
    calories: 700, protein: 35, isEstimate: true, prepMinutes: 30, prepLabel: null, notes: null, tag: null,
    ingredients: ['1 milanesa', '1 porción de puré de papas'],
  },
  {
    seedKey: 'almuerzo-4', since: 1, code: 'A4', name: 'Ensalada completa con atún y huevo', category: 'almuerzo',
    calories: 450, protein: 35, isEstimate: true, prepMinutes: 10, prepLabel: 'Sin cocina', notes: null, tag: null,
    ingredients: ['1 lata de atún', '1 huevo duro', 'lechuga, tomate y zanahoria', '1 cda aceite'],
  },
  // ---- Merienda ----
  {
    seedKey: 'merienda-m1', since: 1, code: 'M1', name: 'Fruta y frutos secos', category: 'merienda',
    calories: 250, protein: 6, isEstimate: true, prepMinutes: null, prepLabel: 'Sin preparación', notes: null, tag: null,
    ingredients: ['1 fruta', '1 puñado de frutos secos'],
  },
  {
    seedKey: 'merienda-m2', since: 1, code: 'M2', name: 'Sándwich de jamón y queso', category: 'merienda',
    calories: 350, protein: 18, isEstimate: true, prepMinutes: 5, prepLabel: 'Sin cocina', notes: null, tag: null,
    ingredients: ['2 panes de molde', '2 fetas de jamón', '2 fetas de queso'],
  },
  {
    seedKey: 'merienda-m3', since: 1, code: 'M3', name: 'Yogur griego con miel', category: 'merienda',
    calories: 220, protein: 15, isEstimate: true, prepMinutes: null, prepLabel: 'Sin preparación', notes: null, tag: null,
    ingredients: ['170 g yogur griego', '1 cdita de miel'],
  },
  // ---- Cena ----
  {
    seedKey: 'cena-c1', since: 1, code: 'C1', name: 'Pescado con verduras', category: 'cena',
    calories: 450, protein: 35, isEstimate: true, prepMinutes: 25, prepLabel: null, notes: null, tag: null,
    ingredients: ['150 g pescado', 'verduras al horno o salteadas'],
  },
  {
    seedKey: 'cena-c2', since: 1, code: 'C2', name: 'Tarta de verduras con ensalada', category: 'cena',
    calories: 550, protein: 18, isEstimate: true, prepMinutes: null, prepLabel: null, notes: null, tag: null,
    ingredients: ['1 porción de tarta de verduras', 'ensalada a gusto'],
  },
  {
    seedKey: 'cena-c3', since: 1, code: 'C3', name: 'Omelette con verduras', category: 'cena',
    calories: 380, protein: 25, isEstimate: true, prepMinutes: 10, prepLabel: null, notes: null, tag: null,
    ingredients: ['3 huevos', 'verduras a gusto', '1 cdita aceite'],
  },
  // ---- Extra ----
  {
    seedKey: 'extra-e1', since: 1, code: 'E1', name: 'Batido de proteína con leche', category: 'extra',
    calories: 280, protein: 30, isEstimate: true, prepMinutes: 2, prepLabel: 'Sin cocina', notes: null, tag: null,
    ingredients: ['1 medida de proteína en polvo', '250 ml leche'],
  },
  {
    seedKey: 'extra-e2', since: 1, code: 'E2', name: 'Barrita de cereal', category: 'extra',
    calories: 120, protein: 3, isEstimate: true, prepMinutes: null, prepLabel: 'Sin preparación', notes: null, tag: null,
    ingredients: ['1 barrita'],
  },
];

/** Shown at dinner only to people whose goal is to gain weight, where a light dinner leaves the day short. */
export const LIGHT_DINNER_GUIDE = {
  title: '¿Cena liviana?',
  description: 'Una sopa, una ensalada o verduras solas suelen quedar por debajo de 400 kcal y 20 g de proteína.',
  tip: 'Si querés subir de peso, sumá un snack con proteína antes de dormir: huevos, un sándwich o un batido.',
};

export const PLAN_FOOTNOTE = 'Valores aproximados. Son guías, no mediciones exactas.';
