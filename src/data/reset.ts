import { setMeta } from '@/backup/snapshot';
import { DATA_TABLES } from '@/db/schema';
import { seedDatabase } from '@/db/seed';
import type { Db } from '@/db/types';

/**
 * Deletes every record and restores factory defaults (catalog included).
 * Automatic cloud backups are paused afterwards so an empty phone never becomes
 * the newest cloud version without the user deciding so.
 */
export async function resetAllData(db: Db): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const table of [...DATA_TABLES].reverse()) await db.runAsync(`DELETE FROM ${table}`, []);
  });
  await setMeta(db, 'baseline_revision', null);
  await seedDatabase(db);
  await setMeta(db, 'cloud_linked', null);
  await setMeta(db, 'pending_backup_id', null);
  await setMeta(db, 'pending_backup_revision', null);
}
