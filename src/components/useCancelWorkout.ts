import { choose } from '@/components/ui/dialog';
import { cancelSession, countDoneSets } from '@/data/workouts';
import { cancelRestEnd } from '@/notifications/rest';
import { useDb, useMutation } from '@/state/db';

/** Asks once and throws the running workout away. Resolves true when it was cancelled. */
export function useCancelWorkout() {
  const db = useDb();
  const run = useMutation();
  return async (sessionId: string): Promise<boolean> => {
    const done = await countDoneSets(db, sessionId);
    const lost = done === 0 ? 'No se guarda nada.' : `Se ${done === 1 ? 'pierde la serie que hiciste' : `pierden las ${done} series que hiciste`} y este entrenamiento no cuenta.`;
    const answer = await choose('¿Cancelar el entrenamiento?', lost, [
      { key: 'cancel', label: 'Sí, cancelarlo', variant: 'dangerSolid' },
      { key: 'keep', label: 'No, seguir con él', variant: 'secondary' },
    ]);
    if (answer !== 'cancel') return false;
    const ok = await run((d) => cancelSession(d, sessionId), { success: 'Entrenamiento cancelado' });
    if (ok === undefined) return false;
    void cancelRestEnd();
    return true;
  };
}
