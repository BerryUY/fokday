/**
 * Date helpers. Every day-based record is stored as a `YYYY-MM-DD` key in
 * America/Montevideo time, so "today" never drifts with UTC.
 */
export const TIME_ZONE = 'America/Montevideo';
/** Uruguay has observed UTC-3 all year since 2015 (no DST). Used only as a fallback. */
const FALLBACK_OFFSET_MINUTES = -180;

export type DateKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

let formatter: Intl.DateTimeFormat | null | undefined;

function getFormatter(): Intl.DateTimeFormat | null {
  if (formatter !== undefined) return formatter;
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    // Sanity check: some JS engines silently ignore timeZone.
    const probe = partsFrom(f, new Date(Date.UTC(2024, 0, 1, 1, 0)));
    formatter = probe && probe.day === 31 && probe.hour === 22 ? f : null;
  } catch {
    formatter = null;
  }
  return formatter;
}

function partsFrom(f: Intl.DateTimeFormat, date: Date): Parts | null {
  try {
    const out: Record<string, number> = {};
    for (const p of f.formatToParts(date)) {
      if (p.type !== 'literal') out[p.type] = Number(p.value);
    }
    if (!out.year || !out.month || !out.day) return null;
    return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute };
  } catch {
    return null;
  }
}

export function zonedParts(date: Date = new Date()): Parts {
  const f = getFormatter();
  const parts = f ? partsFrom(f, date) : null;
  if (parts) return parts;
  const shifted = new Date(date.getTime() + FALLBACK_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function toDateKey(date: Date = new Date()): DateKey {
  const p = zonedParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export const todayKey = (): DateKey => toDateKey(new Date());
export const nowIso = (): string => new Date().toISOString();

export function isDateKey(value: unknown): value is DateKey {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Midnight UTC of the key; only for calendar arithmetic, never for display. */
function keyToUtc(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcToKey(date: Date): DateKey {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = keyToUtc(key);
  d.setUTCDate(d.getUTCDate() + days);
  return utcToKey(d);
}

export function addMonths(key: DateKey, months: number): DateKey {
  const d = keyToUtc(key);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const maxDay = daysInMonth(target.getUTCFullYear(), target.getUTCMonth() + 1);
  target.setUTCDate(Math.min(d.getUTCDate(), maxDay));
  return utcToKey(target);
}

export function diffDays(from: DateKey, to: DateKey): number {
  return Math.round((keyToUtc(to).getTime() - keyToUtc(from).getTime()) / 86_400_000);
}

/** 0 = domingo … 6 = sábado */
export function weekday(key: DateKey): number {
  return keyToUtc(key).getUTCDay();
}

/** Weeks start on Monday, as in Uruguay. */
export function startOfWeek(key: DateKey): DateKey {
  const wd = weekday(key);
  return addDays(key, wd === 0 ? -6 : 1 - wd);
}

export function startOfMonth(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`;
}

export function endOfMonth(key: DateKey): DateKey {
  const [y, m] = key.split('-').map(Number);
  return `${key.slice(0, 7)}-${pad(daysInMonth(y, m))}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function eachDay(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const minKey = (a: DateKey, b: DateKey) => (a < b ? a : b);
export const maxKey = (a: DateKey, b: DateKey) => (a > b ? a : b);

// ---- Spanish (Uruguay) labels ----

export const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const DAY_LETTER = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const DAY_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre',
];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
/** Monday-first ordering used across the UI. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatLong(key: DateKey): string {
  const [, m, d] = key.split('-').map(Number);
  return `${DAY_LONG[weekday(key)]} ${d} de ${MONTHS[m - 1]}`;
}

export function formatShort(key: DateKey): string {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function formatShortWithYear(key: DateKey): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

export function formatMonth(key: DateKey): string {
  const [y, m] = key.split('-').map(Number);
  return `${capitalize(MONTHS[m - 1])} ${y}`;
}

/** "Hoy", "Ayer", "Mañana" or "Lunes 3 de marzo". */
export function formatRelative(key: DateKey, today: DateKey = todayKey()): string {
  const diff = diffDays(today, key);
  if (diff === 0) return 'Hoy';
  if (diff === -1) return 'Ayer';
  if (diff === 1) return 'Mañana';
  return capitalize(formatLong(key));
}

export function formatTime(iso: string): string {
  const p = zonedParts(new Date(iso));
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function greeting(date: Date = new Date()): string {
  const h = zonedParts(date).hour;
  if (h >= 5 && h < 12) return 'Buen día';
  if (h >= 12 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

export function formatMinutes(totalSeconds: number): string {
  const m = Math.round(totalSeconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
}

/** "20 oct 14:05" in Montevideo time, for timestamps such as the last backup. */
export function formatDateTime(iso: string): string {
  return `${formatShort(toDateKey(new Date(iso)))} ${formatTime(iso)}`;
}
