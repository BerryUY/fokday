import type { MealCategory } from '@/domain/nutrition';

/**
 * Meal catalog taken from the personal plan at https://plancomidas.netlify.app/
 * (names, quantities, kcal, protein, prep times, tags and notes as published there).
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

export const DEFAULT_TARGETS = { calories: 2750, protein: 115 } as const;
export const DEFAULT_START_WEIGHT = 57;
export const DEFAULT_TARGET_WEIGHT = 65;
export const DEFAULT_NAME = 'Santiago';

export const CATALOG: CatalogMeal[] = [
  // ---- Desayuno ----
  {
    seedKey: 'desayuno-a', since: 1, code: 'A', name: 'Batido de avena', category: 'desayuno',
    calories: 720, protein: 22, isEstimate: false, prepMinutes: 5, prepLabel: 'Sin cocina', notes: null, tag: null,
    ingredients: ['4 cdas avena', '250 ml leche entera', '1 banana', '2 cdas maní', '2 cdas azúcar'],
  },
  {
    seedKey: 'desayuno-b', since: 1, code: 'B', name: 'Tostadas con huevo revuelto', category: 'desayuno',
    calories: 670, protein: 28, isEstimate: false, prepMinutes: 10, prepLabel: null, notes: null, tag: null,
    ingredients: ['3 huevos', '3 tostadas', '1 cda aceite', '1 vaso leche entera'],
  },
  {
    seedKey: 'desayuno-c', since: 1, code: 'C', name: 'Yogur griego + avena + banana', category: 'desayuno',
    calories: 550, protein: 25, isEstimate: false, prepMinutes: 3, prepLabel: null,
    notes: 'Agregar tostadas si querés más kcal', tag: null,
    ingredients: ['200 g yogur griego', '5 cdas avena', '1 banana'],
  },
  {
    seedKey: 'desayuno-d', since: 1, code: 'D', name: 'Sándwich proteico', category: 'desayuno',
    calories: 650, protein: 30, isEstimate: false, prepMinutes: 10, prepLabel: null, notes: null, tag: 'top prot',
    ingredients: ['2 panes de molde', '2 huevos fritos', '2 fetas queso', '2 fetas jamón'],
  },
  {
    seedKey: 'desayuno-e', since: 1, code: 'E', name: 'Leche con cocoa + pan con maní', category: 'desayuno',
    calories: 700, protein: 20, isEstimate: false, prepMinutes: 5, prepLabel: 'Sin cocina', notes: null, tag: null,
    ingredients: ['300 ml leche entera', '2 cdas cocoa', 'azúcar', '3 tostadas', '3 cdas maní'],
  },
  // ---- Almuerzo ----
  {
    seedKey: 'almuerzo-1', since: 1, code: '1', name: 'Arroz + pollo + huevo frito', category: 'almuerzo',
    calories: 700, protein: 45, isEstimate: false, prepMinutes: 15, prepLabel: null, notes: null, tag: 'mejor ratio',
    ingredients: ['1 taza arroz cocido', '150 g pechuga', '1 huevo frito', 'aceite y sal'],
  },
  {
    seedKey: 'almuerzo-2', since: 1, code: '2', name: 'Fideos + carne molida + queso', category: 'almuerzo',
    calories: 750, protein: 40, isEstimate: false, prepMinutes: 15, prepLabel: null, notes: null, tag: null,
    ingredients: ['200 g fideos cocidos', '150 g carne molida', '2 cdas queso rallado', 'salsa de tomate'],
  },
  {
    seedKey: 'almuerzo-3', since: 1, code: '3', name: 'Rapiditas + pollo + queso', category: 'almuerzo',
    calories: 600, protein: 35, isEstimate: false, prepMinutes: 10, prepLabel: null, notes: 'Opción más rápida', tag: null,
    ingredients: ['2-3 rapiditas', '150 g pollo cocido desmenuzado', '2 fetas queso', 'condimentos'],
  },
  {
    seedKey: 'almuerzo-4', since: 1, code: '4', name: 'Milanesa + arroz', category: 'almuerzo',
    calories: 750, protein: 40, isEstimate: false, prepMinutes: 15, prepLabel: null, notes: null, tag: null,
    ingredients: ['1 milanesa grande (~180 g)', '1 taza arroz cocido', 'condimentos'],
  },
  // ---- Merienda ----
  {
    seedKey: 'merienda-m1', since: 1, code: 'M1', name: 'Galletas de arroz + maní', category: 'merienda',
    calories: 350, protein: 12, isEstimate: false, prepMinutes: 0, prepLabel: 'Sin preparación', notes: null, tag: null,
    ingredients: ['4-5 galletas de arroz', '3 cdas mantequilla de maní'],
  },
  {
    seedKey: 'merienda-m2', since: 1, code: 'M2', name: 'Leche con cocoa + tostadas con maní', category: 'merienda',
    calories: 500, protein: 18, isEstimate: false, prepMinutes: 5, prepLabel: null, notes: null, tag: null,
    ingredients: ['250 ml leche entera', '2 cdas cocoa', 'azúcar', '2 tostadas', '2 cdas maní'],
  },
  {
    seedKey: 'merienda-m3', since: 1, code: 'M3', name: 'Yogur griego + fruta', category: 'merienda',
    calories: 250, protein: 15, isEstimate: false, prepMinutes: 0, prepLabel: 'Sin preparación',
    notes: 'Complementar con tostadas si quedás corto en kcal', tag: null,
    ingredients: ['200 g yogur griego', '1 fruta (banana, manzana, durazno)'],
  },
  {
    seedKey: 'merienda-m4', since: 1, code: 'M4', name: 'Sándwich jamón y queso ×2', category: 'merienda',
    calories: 400, protein: 20, isEstimate: false, prepMinutes: null, prepLabel: 'Sin cocina', notes: null, tag: 'más prot',
    ingredients: ['4 rebanadas pan de molde', '4 fetas jamón', '4 fetas queso'],
  },
  // ---- Cena (valores estimados en el plan) ----
  {
    seedKey: 'cena-c1', since: 1, code: 'C1', name: 'Pollo + arroz o fideos', category: 'cena',
    calories: 650, protein: 40, isEstimate: true, prepMinutes: null, prepLabel: null,
    notes: 'Si la ración es chica, complementá con pan o 1-2 huevos fritos encima', tag: 'ideal',
    ingredients: ['150 g pollo (cualquier corte)', '1 taza de carbohidrato', 'condimentos'],
  },
  {
    seedKey: 'cena-c2', since: 1, code: 'C2', name: 'Carne + acompañamiento', category: 'cena',
    calories: 700, protein: 38, isEstimate: true, prepMinutes: null, prepLabel: null,
    notes: 'Con puré de papa suma bastante en kcal', tag: null,
    ingredients: ['150 g carne vacuna o cerdo', 'arroz, fideos o puré'],
  },
  {
    seedKey: 'cena-c3', since: 1, code: 'C3', name: 'Milanesa + acompañamiento', category: 'cena',
    calories: 700, protein: 35, isEstimate: true, prepMinutes: null, prepLabel: null,
    notes: '2 milanesas en vez de 1 → diferencia enorme en proteína y calorías', tag: null,
    ingredients: ['1-2 milanesas', 'puré, arroz, fideos o ensalada'],
  },
];

/** Guidance shown with each category, from the same plan. */
export const CATEGORY_GUIDANCE: Partial<Record<MealCategory, string>> = {
  cena:
    'No podés elegir la cena: la estrategia es cargar bien el resto del día. Si podés repetir alguna opción del almuerzo, mejor. Si la cena es liviana, completá post-cena con un snack rápido.',
};

export const LIGHT_DINNER_GUIDE = {
  title: 'Cena liviana → compensar',
  description: 'Sopa, ensalada o verduras solas: menos de 400 kcal y menos de 20 g de proteína.',
  tip: 'Post-cena: 2 huevos + pan, sándwich de jamón y queso, o batido de avena reducido. No irse a dormir con el día corto.',
};

export const PLAN_FOOTNOTE = 'Valores aproximados del plan de comidas. Son guías, no mediciones exactas.';
