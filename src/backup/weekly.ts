/** Rules for the automatic copies saved to a folder the person picks (kept outside the app, so they survive uninstalling it). */

export const WEEKLY_INTERVAL_MS = 7 * 86_400_000;
export const KEEP_FOLDER_COPIES = 4;
export const FOLDER_FILE_PREFIX = 'momentum-respaldo-';

/** Due when never done, a week has passed, or the clock went backwards. */
export function isWeeklyDue(lastAt: string | null, now: Date): boolean {
  if (!lastAt) return true;
  const last = Date.parse(lastAt);
  if (Number.isNaN(last)) return true;
  const elapsed = now.getTime() - last;
  return elapsed >= WEEKLY_INTERVAL_MS || elapsed < 0;
}

/** File name that sorts chronologically: momentum-respaldo-2026-10-21-1830.json */
export function folderFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${FOLDER_FILE_PREFIX}${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

/** Our copies beyond the newest `keep`; other files in the folder are never touched. */
export function copiesToDelete(names: string[], keep = KEEP_FOLDER_COPIES): string[] {
  return names
    .filter((n) => n.startsWith(FOLDER_FILE_PREFIX) && n.endsWith('.json'))
    .sort()
    .reverse()
    .slice(keep);
}
