/** Number formatting for es-UY: "." for thousands, "," for decimals. Hand-rolled so it does not depend on Intl locale data. */
export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = value < 0 && Number(fixed) !== 0 ? '−' : '';
  return sign + grouped + (frac ? ',' + frac : '');
}

/** Drops a trailing ",0" so 57.0 reads "57" but 57.4 reads "57,4". */
export function formatDecimal(value: number, maxDecimals = 1): string {
  const rounded = Number(value.toFixed(maxDecimals));
  return formatNumber(rounded, Number.isInteger(rounded) ? 0 : maxDecimals);
}

export const formatKcal = (v: number) => formatNumber(Math.round(v));
export const formatProtein = (v: number) => formatDecimal(v, 1);
export const formatKg = (v: number) => formatDecimal(v, 1);

export function formatSigned(value: number, decimals = 1): string {
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return '0';
  return (rounded > 0 ? '+' : '−') + formatDecimal(Math.abs(rounded), decimals);
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** Accepts "57,5", "57.5" or " 57 ". Returns null for anything that is not a finite number. */
export function parseDecimal(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parsePositive(input: string): number | null {
  const n = parseDecimal(input);
  return n !== null && n > 0 ? n : null;
}

export function parseNonNegative(input: string): number | null {
  const n = parseDecimal(input);
  return n !== null && n >= 0 ? n : null;
}

/** Inputs show numbers with a comma decimal separator. */
export function toInput(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(Number(value.toFixed(decimals))).replace('.', ',');
}

export const round1 = (v: number) => Math.round(v * 10) / 10;
