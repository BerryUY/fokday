import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { applySpanish, CATALOG_URL, parseCatalog, type CatalogExercise, type CatalogTranslations } from '@/domain/exerciseCatalog';

/**
 * Loads the exercise guide once (~1 MB) and keeps a copy on the phone, so it opens instantly
 * and works without internet afterwards. Refreshed at most once a month.
 */

const MAX_AGE_MS = 30 * 86_400_000;
let memory: CatalogExercise[] | null = null;

// Required lazily so the ~600 KB translation only loads when the guide is opened.
const spanish = (all: CatalogExercise[]) => applySpanish(all, require('./exercises-es.json') as CatalogTranslations);

function cacheFile(): File | null {
  return Platform.OS === 'web' ? null : new File(Paths.document, 'exercise-guide.json');
}

export async function loadExerciseCatalog(): Promise<CatalogExercise[]> {
  if (memory) return memory;
  const file = cacheFile();
  let cached: CatalogExercise[] | null = null;
  if (file?.exists) {
    try {
      cached = parseCatalog(JSON.parse(await file.text()));
      const fresh = file.modificationTime && Date.now() - file.modificationTime < MAX_AGE_MS;
      if (cached.length && fresh) return (memory = spanish(cached));
    } catch {
      cached = null;
    }
  }
  try {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    const parsed = parseCatalog(JSON.parse(text));
    if (!parsed.length) throw new Error('vacío');
    if (file) {
      if (file.exists) file.delete();
      file.create();
      file.write(text);
    }
    return (memory = spanish(parsed));
  } catch {
    if (cached?.length) return (memory = spanish(cached));
    throw new Error('No pudimos cargar la guía de ejercicios. Revisá tu conexión e intentá de nuevo.');
  }
}
