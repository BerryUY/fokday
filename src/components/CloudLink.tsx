import { useState } from 'react';
import { View } from 'react-native';
import type { CloudBackupMeta } from '@/backup/api';
import { saveSafetyCopy } from '@/backup/files';
import { backupNow, syncDeps } from '@/backup/service';
import { countUserRecords, type BackupEnvelope } from '@/backup/snapshot';
import { applyRestore, prepareCloudRestore, setLinked } from '@/backup/sync';
import type { LinkChoice } from '@/auth/account';
import { confirm, Sheet } from '@/components/ui/form';
import { Button, T } from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/dates';
import { notifyDataChanged } from '@/state/dataBus';
import { useDb } from '@/state/db';
import { useToast } from '@/state/toast';
import { space } from '@/theme/tokens';

function describe(env: BackupEnvelope): string {
  const t = env.snapshot.counts;
  return `${t.meal_logs} comidas registradas, ${t.weight_entries} pesos, ${t.workout_sessions} entrenamientos, ${t.gym_attendance} días de gym y ${t.workout_routines} rutinas.`;
}

export const recordsIn = (counts: CloudBackupMeta['counts']): number => countUserRecords({ counts } as Parameters<typeof countUserRecords>[0]);

/** Validated restore with a safety copy first; local data is untouched unless every step succeeds. */
export function useRestore() {
  const db = useDb();
  const toast = useToast();
  return async (envelope: BackupEnvelope, sourceId: string | null, warnLocal: boolean): Promise<boolean> => {
    const ok = await confirm(
      'Restaurar respaldo',
      `Respaldo del ${formatDateTime(envelope.snapshot.createdAt)}: ${describe(envelope)}\n\nSe reemplazan los datos de este teléfono. Antes se guarda una copia automática.${warnLocal ? '\n\nAtención: tenés cambios en este teléfono que no están en ese respaldo y se perderían.' : ''}`,
      'Restaurar',
      true,
    );
    if (!ok) return false;
    await saveSafetyCopy(db, 'antes-de-restaurar');
    await applyRestore(db, envelope, sourceId);
    await setLinked(db, true);
    notifyDataChanged();
    toast.show('Datos restaurados');
    return true;
  };
}

/** The account already has backups: restore the latest, or keep this phone's data as a new version. */
export function LinkChoiceSheet({ choice, onClose }: { choice: LinkChoice | null; onClose: () => void }) {
  const db = useDb();
  const toast = useToast();
  const restore = useRestore();
  const [busy, setBusy] = useState(false);
  return (
    <Sheet visible={!!choice} onClose={onClose} title="Ya tenés respaldos en la nube">
      {choice ? (
        <View style={{ gap: space.md }}>
          <T variant="label" tone="muted">
            Hay {choice.count} {choice.count === 1 ? 'respaldo' : 'respaldos'}. El último es del {formatDateTime(choice.latest.createdAt)} con {recordsIn(choice.latest.counts)} registros.
          </T>
          <Button
            label="Restaurar el último respaldo"
            icon="download-cloud"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              try {
                const check = await prepareCloudRestore(syncDeps(db), choice.latest.id);
                if (await restore(check.envelope, check.meta.id, check.localHasUnsavedChanges)) onClose();
              } catch (e) {
                toast.show(e instanceof Error ? e.message : 'No se pudo restaurar', 'error');
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button
            label="Mantener los datos de este teléfono"
            variant="secondary"
            onPress={async () => {
              const yes = await confirm('Mantener datos locales', 'Los datos de este teléfono se suben como una versión nueva. Los respaldos anteriores siguen guardados en la nube.', 'Mantener');
              if (!yes) return;
              await setLinked(db, true);
              onClose();
              await backupNow(true);
            }}
          />
          <Button label="Decidir después" variant="ghost" onPress={onClose} />
        </View>
      ) : null}
    </Sheet>
  );
}
