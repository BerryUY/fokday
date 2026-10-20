/**
 * Versioned migrations. Each entry runs once, in order, inside a transaction,
 * and bumps PRAGMA user_version. Never edit a released migration: append a new one.
 */

/** User data tables, in foreign-key dependency order (parents first). Backups cover exactly these. */
export const DATA_TABLES = [
  'settings',
  'nutrition_goals',
  'meals',
  'meal_ingredients',
  'meal_logs',
  'exercises',
  'workout_routines',
  'routine_exercises',
  'routine_schedule',
  'workout_sessions',
  'workout_exercises',
  'workout_sets',
  'gym_attendance',
  'weight_entries',
  'milestones',
  'daily_notes',
] as const;

export type DataTable = (typeof DATA_TABLES)[number];

const V1 = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE nutrition_goals (
  id TEXT PRIMARY KEY NOT NULL,
  effective_from TEXT NOT NULL UNIQUE,
  calories REAL NOT NULL CHECK (calories > 0),
  protein REAL NOT NULL CHECK (protein > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE meals (
  id TEXT PRIMARY KEY NOT NULL,
  seed_key TEXT UNIQUE,
  code TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('desayuno','almuerzo','merienda','cena','extra')),
  calories REAL NOT NULL CHECK (calories >= 0),
  protein REAL NOT NULL CHECK (protein >= 0),
  is_estimate INTEGER NOT NULL DEFAULT 1,
  prep_minutes INTEGER,
  prep_label TEXT,
  notes TEXT,
  tag TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_custom INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_meals_category ON meals (category, is_archived, sort_order);

CREATE TABLE meal_ingredients (
  id TEXT PRIMARY KEY NOT NULL,
  meal_id TEXT NOT NULL REFERENCES meals (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX idx_meal_ingredients_meal ON meal_ingredients (meal_id, position);

-- Logged meals keep their own copy of name and nutrition: editing a template never changes history.
CREATE TABLE meal_logs (
  id TEXT PRIMARY KEY NOT NULL,
  log_date TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('desayuno','almuerzo','merienda','cena','extra')),
  meal_id TEXT REFERENCES meals (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  portion REAL NOT NULL DEFAULT 1 CHECK (portion > 0),
  base_calories REAL NOT NULL,
  base_protein REAL NOT NULL,
  calories REAL NOT NULL CHECK (calories >= 0),
  protein REAL NOT NULL CHECK (protein >= 0),
  is_estimate INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  logged_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_meal_logs_date ON meal_logs (log_date, category);
CREATE INDEX idx_meal_logs_meal ON meal_logs (meal_id);

CREATE TABLE exercises (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  notes TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_exercises_group ON exercises (muscle_group, name);

CREATE TABLE workout_routines (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE routine_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  routine_id TEXT NOT NULL REFERENCES workout_routines (id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  sets INTEGER NOT NULL CHECK (sets > 0),
  reps_min INTEGER,
  reps_max INTEGER,
  rest_seconds INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_routine_exercises_routine ON routine_exercises (routine_id, position);

-- One routine per weekday (0 = domingo … 6 = sábado).
CREATE TABLE routine_schedule (
  weekday INTEGER PRIMARY KEY NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  routine_id TEXT NOT NULL REFERENCES workout_routines (id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL
);

-- Sessions copy routine and exercise names so history survives routine edits.
CREATE TABLE workout_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  routine_id TEXT REFERENCES workout_routines (id) ON DELETE SET NULL,
  routine_name TEXT,
  session_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress','completed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_seconds INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_workout_sessions_date ON workout_sessions (session_date);
CREATE INDEX idx_workout_sessions_status ON workout_sessions (status);

CREATE TABLE workout_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES workout_sessions (id) ON DELETE CASCADE,
  exercise_id TEXT REFERENCES exercises (id) ON DELETE SET NULL,
  exercise_name TEXT NOT NULL,
  muscle_group TEXT,
  position INTEGER NOT NULL,
  target_sets INTEGER,
  reps_min INTEGER,
  reps_max INTEGER,
  rest_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','skipped')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_workout_exercises_session ON workout_exercises (session_id, position);
CREATE INDEX idx_workout_exercises_exercise ON workout_exercises (exercise_id);

CREATE TABLE workout_sets (
  id TEXT PRIMARY KEY NOT NULL,
  workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  reps INTEGER,
  weight_kg REAL,
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_workout_sets_exercise ON workout_sets (workout_exercise_id, position);

-- The date is the key: the same day can never be counted twice.
CREATE TABLE gym_attendance (
  date TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual','workout')),
  session_id TEXT REFERENCES workout_sessions (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE weight_entries (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL UNIQUE,
  weight_kg REAL NOT NULL CHECK (weight_kg > 0),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY NOT NULL,
  weight_kg REAL NOT NULL UNIQUE CHECK (weight_kg > 0),
  label TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE daily_notes (
  date TEXT PRIMARY KEY NOT NULL,
  text TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Local-only bookkeeping for backups; never included in a backup.
CREATE TABLE sync_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
INSERT INTO sync_metadata (key, value) VALUES ('local_revision', '0');
INSERT INTO sync_metadata (key, value) VALUES ('backed_up_revision', '0');
`;

/** Every write to a data table bumps local_revision, so the backup service knows exactly when there is something new. */
function revisionTriggers(tables: readonly string[]): string {
  const bump = `UPDATE sync_metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'local_revision';`;
  return tables
    .flatMap((t) =>
      (['INSERT', 'UPDATE', 'DELETE'] as const).map(
        (op) => `CREATE TRIGGER IF NOT EXISTS trg_${t}_${op.toLowerCase()}_rev AFTER ${op} ON ${t} BEGIN ${bump} END;`,
      ),
    )
    .join('\n');
}

export type Migration = { version: number; name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  { version: 1, name: 'initial schema', sql: V1 + '\n' + revisionTriggers(DATA_TABLES) },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
