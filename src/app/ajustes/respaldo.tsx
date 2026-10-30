import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useAccount, type LinkChoice } from '@/auth/account';
import { cloudApi, type CloudBackupMeta } from '@/backup/api';
import { buildCsv, CSV_KINDS, type CsvKind } from '@/backup/csv';
import { exportCsv, exportJsonBackup, listSafetyCopies, pickJsonBackup, readSafetyCopy, saveSafetyCopy, shareSafetyCopy } from '@/backup/files';
import { backupNow, getCloudConfig, refreshSyncState, syncDeps, useSyncState } from '@/backup/service';
import { chooseBackupFolder, disableFolderBackup, getFolderBackupInfo, writeFolderCopy, type FolderBackupInfo } from '@/backup/folderBackup';
import { hasUserChanges } from '@/backup/snapshot';
import { prepareCloudRestore, setLinked } from '@/backup/sync';
import { LinkChoiceSheet, recordsIn, useRestore } from '@/components/CloudLink';
import { Sheet, confirm } from '@/components/ui/form';
import { ListRow, Screen } from '@/components/ui/layout';
import { Badge, Button, Card, Chip, Divider, Row, SectionHeader, T } from '@/components/ui/primitives';
import { resetAllData } from '@/data/reset';
import { addDays, formatDateTime, todayKey } from '@/lib/dates';
import { useDb, useMutation } from '@/state/db';
import { useToast } from '@/state/toast';
import { space } from '@/theme/tokens';

export default function BackupScreen() {
  const db = useDb();
  const run = useMutation();
  const toast = useToast();
  const sync = useSyncState();
  const { account } = useAccount();
  const restore = useRestore();
  const [busy, setBusy] = useState<string | null>(null);
  const [cloudList, setCloudList] = useState<CloudBackupMeta[] | null>(null);
  const [linkChoice, setLinkChoice] = useState<LinkChoice | null>(null);
  const [csvKind, setCsvKind] = useState<CsvKind>('comidas');
  const [csvRange, setCsvRange] = useState<'30' | '90' | 'all'>('all');
  const [copies, setCopies] = useState(listSafetyCopies());
  const [folder, setFolder] = useState<FolderBackupInfo>({ folderUri: null, lastAt: null, lastError: null });
  const refreshFolder = () => void getFolderBackupInfo(db).then(setFolder).catch(() => {});
  useEffect(refreshFolder, [db]);
  useEffect(() => void refreshSyncState(), [account?.id]);

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Algo salió mal', 'error');
    } finally {
      setBusy(null);
      setCopies(listSafetyCopies());
      refreshFolder();
      void refreshSyncState();
    }
  };

  /** Decides what happens with backups already in the cloud before automatic backups start. */
  const resumeLink = () =>
    withBusy('link', async () => {
      const cfg = await getCloudConfig();
      if (!cfg) return;
      const status = await cloudApi.status(cfg);
      if (status.count === 0 || !status.latest) {
        await setLinked(db, true);
        await backupNow(true);
      } else setLinkChoice({ count: status.count, latest: status.latest });
    });

  const status = (() => {
    if (!sync.configured) return { label: 'Sin cuenta', tone: 'muted' as const };
    if (!sync.info?.linked) return { label: 'En pausa', tone: 'weight' as const };
    if (sync.running) return { label: 'Respaldando…', tone: 'protein' as const };
    if (sync.info?.lastError && sync.info.pendingChanges) return { label: 'Error', tone: 'danger' as const };
    if (!sync.online && sync.info?.pendingChanges) return { label: 'Sin conexión', tone: 'weight' as const };
    if (sync.info?.pendingChanges) return { label: 'Cambios pendientes', tone: 'weight' as const };
    return { label: 'Al día', tone: 'accent' as const };
  })();

  return (
    <Screen title="Datos y respaldo">
      <Card style={{ marginBottom: space.xl }}>
        <T variant="h3">Tus datos están protegidos</T>
        <T variant="caption" tone="dim" style={{ marginTop: 2, marginBottom: space.md }}>Todo vive en este teléfono. Estas copias te cuidan si lo perdés o desinstalás la app.</T>
        <ProtectionRow on title="Copia de Android en Google Drive" detail="Automática cada noche, si tu teléfono tiene activada la copia de seguridad (Ajustes → Sistema → Copia de seguridad). Al reinstalar desde Play Store se restaura sola." />
        <ProtectionRow on={!!folder.folderUri} title="Copia semanal en una carpeta" detail={folder.folderUri ? 'Activada' : 'Desactivada: activala más abajo'} />
        <ProtectionRow on={sync.configured} title="Nube de FokDay" detail={sync.configured ? 'Activada' : 'Iniciá sesión para activarla'} last />
      </Card>

      <SectionHeader title="Respaldo en la nube" />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="h3">Nube de FokDay</T>
          <Badge label={status.label} tone={status.tone} />
        </Row>
        {sync.configured ? (
          <View style={{ gap: 4, marginTop: space.md }}>
            {account?.email ? <T variant="label" tone="muted">Cuenta: {account.email}</T> : null}
            <T variant="label" tone="muted">
              Último respaldo: {sync.info?.lastBackupAt ? formatDateTime(sync.info.lastBackupAt) : 'todavía ninguno'}
            </T>
            {sync.info?.lastError && sync.info.pendingChanges ? (
              <T variant="label" tone="danger">Último intento: {sync.info.lastError} Se reintenta solo.</T>
            ) : null}
            {!sync.info?.linked ? (
              <T variant="label" tone="weight">Los respaldos automáticos están en pausa hasta que decidas qué hacer con los respaldos que ya hay en la nube.</T>
            ) : (
              <T variant="caption" tone="dim">Se respalda solo cuando hay internet y hubo cambios. Tus datos nunca se borran del teléfono por un error de subida.</T>
            )}
            {!account ? (
              <T variant="label" tone="weight">Este teléfono usa el perfil anterior (con código de invitación). Iniciá sesión con una cuenta para conservarlo: tus respaldos pasan a la cuenta.</T>
            ) : null}
          </View>
        ) : (
          <T variant="label" tone="muted" style={{ marginTop: space.md }}>
            Iniciá sesión con Google o con tu email y tus datos se copian solos a la nube, para recuperarlos si cambiás de teléfono.
          </T>
        )}
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {!account ? (
            <Button label={sync.configured ? 'Pasar mi perfil a una cuenta' : 'Iniciar sesión o crear cuenta'} icon="log-in" onPress={() => router.push('/cuenta/entrar')} />
          ) : null}
          {sync.configured && !sync.info?.linked ? (
            <Button label="Revisar respaldos de la nube" icon="cloud" loading={busy === 'link'} onPress={resumeLink} />
          ) : null}
          {sync.configured && sync.info?.linked ? (
            <Button
              label="Respaldar ahora"
              icon="upload-cloud"
              variant={account ? 'primary' : 'secondary'}
              loading={sync.running || busy === 'backup'}
              onPress={() =>
                withBusy('backup', async () => {
                  const r = await backupNow(true);
                  if (!r) return;
                  if (r.status === 'uploaded') toast.show(r.duplicate ? 'Ese respaldo ya estaba en la nube' : 'Respaldo guardado en la nube');
                  else if (r.status === 'nothing_new') toast.show('Ya está todo respaldado', 'info');
                  else if (r.status === 'offline') toast.show('Sin conexión: se respalda cuando vuelva internet', 'info');
                  else if (r.status === 'error') toast.show(r.message, 'error');
                })
              }
            />
          ) : null}
          {sync.configured ? (
            <Button
              label="Restaurar desde la nube"
              icon="download-cloud"
              variant="secondary"
              loading={busy === 'list'}
              onPress={() =>
                withBusy('list', async () => {
                  const cfg = await getCloudConfig();
                  if (!cfg) return;
                  setCloudList((await cloudApi.list(cfg)).backups);
                })
              }
            />
          ) : null}
          {account ? <Button label="Mi cuenta" icon="user" variant="ghost" size="sm" onPress={() => router.push('/cuenta')} /> : null}
        </View>
      </Card>

      <SectionHeader title="Copia semanal automática" style={{ marginTop: space.xl }} />
      <Card>
        <T variant="label" tone="muted">
          Una vez por semana se guarda una copia completa en una carpeta que elijas, por ejemplo Documentos o una carpeta de Google Drive. Queda fuera de la app, así que no se borra si la desinstalás. Se guardan las últimas 4.
        </T>
        {folder.folderUri ? (
          <View style={{ gap: 4, marginTop: space.md }}>
            <T variant="label" tone="muted">Última copia: {folder.lastAt ? formatDateTime(folder.lastAt) : 'todavía ninguna'}</T>
            {folder.lastError ? <T variant="label" tone="danger">{folder.lastError}</T> : null}
          </View>
        ) : null}
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {folder.folderUri ? (
            <>
              <Button
                label="Hacer una copia ahora"
                icon="save"
                variant="secondary"
                loading={busy === 'folder-now'}
                onPress={() =>
                  withBusy('folder-now', async () => {
                    const r = await writeFolderCopy(db, { force: true });
                    toast.show(r === 'written' ? 'Copia guardada en tu carpeta' : 'No se pudo guardar la copia', r === 'written' ? 'success' : 'error');
                  })
                }
              />
              <Button label="Cambiar carpeta" icon="folder" variant="ghost" size="sm" onPress={() => withBusy('folder-pick', async () => void (await chooseBackupFolder(db)))} />
              <Button label="Desactivar" variant="ghost" size="sm" onPress={() => withBusy('folder-off', () => disableFolderBackup(db))} />
            </>
          ) : (
            <Button
              label="Elegir carpeta y activar"
              icon="folder-plus"
              loading={busy === 'folder-pick'}
              onPress={() =>
                withBusy('folder-pick', async () => {
                  if (await chooseBackupFolder(db)) toast.show('Listo: se guarda una copia cada semana');
                })
              }
            />
          )}
        </View>
      </Card>

      <SectionHeader title="Copia local" style={{ marginTop: space.xl }} />
      <Card padded={false} style={{ paddingVertical: space.xs }}>
        <ListRow
          icon="download"
          iconTone="accent"
          title="Exportar respaldo (JSON)"
          subtitle="Un archivo con todos tus datos, para guardarlo donde quieras"
          onPress={() => withBusy('export', () => exportJsonBackup(db))}
        />
        <Divider style={{ marginHorizontal: space.lg }} />
        <ListRow
          icon="upload"
          title="Importar respaldo (JSON)"
          subtitle="Se valida antes de reemplazar nada"
          onPress={() =>
            withBusy('import', async () => {
              const env = await pickJsonBackup();
              if (!env) return;
              await restore(env, null, await hasUserChanges(db));
            })
          }
        />
        {copies.length > 0 ? (
          <>
            <Divider style={{ marginHorizontal: space.lg }} />
            <T variant="overline" tone="dim" style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>Copias automáticas (antes de restaurar o borrar)</T>
            {copies.map((copy) => (
              <ListRow
                key={copy.uri}
                icon="archive"
                title={copy.name.replace('.json', '')}
                subtitle={`${Math.max(1, Math.round(copy.size / 1024))} KB`}
                right={<Button label="Compartir" size="sm" variant="ghost" onPress={() => void shareSafetyCopy(copy.uri)} />}
                onPress={() =>
                  withBusy('safety', async () => {
                    const env = await readSafetyCopy(copy.uri);
                    await restore(env, null, true);
                  })
                }
              />
            ))}
          </>
        ) : null}
      </Card>

      <SectionHeader title="Exportar CSV" style={{ marginTop: space.xl }} />
      <Card>
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {CSV_KINDS.map((k) => <Chip key={k.key} label={k.label} compact selected={csvKind === k.key} onPress={() => setCsvKind(k.key)} />)}
        </Row>
        <Row style={{ flexWrap: 'wrap', marginTop: space.md }} gap={6}>
          <Chip label="30 días" compact tone="protein" selected={csvRange === '30'} onPress={() => setCsvRange('30')} />
          <Chip label="90 días" compact tone="protein" selected={csvRange === '90'} onPress={() => setCsvRange('90')} />
          <Chip label="Todo" compact tone="protein" selected={csvRange === 'all'} onPress={() => setCsvRange('all')} />
        </Row>
        <Button
          label="Exportar CSV"
          icon="file-text"
          variant="secondary"
          style={{ marginTop: space.lg }}
          loading={busy === 'csv'}
          onPress={() =>
            withBusy('csv', async () => {
              const today = todayKey();
              const from = csvRange === 'all' ? null : addDays(today, -Number(csvRange) + 1);
              const { csv, rows } = await buildCsv(db, csvKind, from, today);
              if (rows === 0) {
                toast.show('No hay registros en ese período', 'info');
                return;
              }
              await exportCsv(`fokday-${csvKind}-${today}.csv`, csv);
            })
          }
        />
      </Card>

      <SectionHeader title="Zona de cuidado" style={{ marginTop: space.xl }} />
      <Card>
        <T variant="label" tone="muted">Borra comidas, entrenamientos, pesos, rutinas y ajustes de este teléfono y vuelve al plan original. Antes se guarda una copia automática. Los respaldos en la nube no se tocan.</T>
        <Button
          label="Borrar todos mis datos"
          icon="trash-2"
          variant="danger"
          style={{ marginTop: space.lg }}
          onPress={async () => {
            if (!(await confirm('Borrar todos los datos', 'Esta acción borra todo lo que registraste en este teléfono.', 'Continuar', true))) return;
            if (!(await confirm('¿Seguro?', 'Última confirmación: se borran todos los datos locales.', 'Borrar todo', true))) return;
            await withBusy('reset', async () => {
              await saveSafetyCopy(db, 'antes-de-borrar');
              await run((d) => resetAllData(d), { success: 'Datos borrados' });
            });
          }}
        />
      </Card>

      <LinkChoiceSheet choice={linkChoice} onClose={() => setLinkChoice(null)} />

      <Sheet visible={!!cloudList} onClose={() => setCloudList(null)} title="Respaldos en la nube">
        {cloudList?.length === 0 ? (
          <T variant="label" tone="muted">Todavía no hay respaldos en la nube.</T>
        ) : (
          <View>
            {(cloudList ?? []).slice(0, 12).map((b, i) => (
              <View key={b.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  icon="cloud"
                  iconTone={i === 0 ? 'accent' : 'muted'}
                  title={`${formatDateTime(b.createdAt)}${i === 0 ? ' · el más reciente' : ''}`}
                  subtitle={`${recordsIn(b.counts)} registros · ${Math.max(1, Math.round(b.sizeBytes / 1024))} KB`}
                  style={{ paddingHorizontal: 0 }}
                  onPress={() =>
                    withBusy('restore', async () => {
                      const check = await prepareCloudRestore(syncDeps(db), b.id);
                      const done = await restore(check.envelope, check.meta.id, check.localHasUnsavedChanges);
                      if (done) setCloudList(null);
                    })
                  }
                />
              </View>
            ))}
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

function ProtectionRow({ on, title, detail, last }: { on: boolean; title: string; detail: string; last?: boolean }) {
  return (
    <Row gap={space.md} align="flex-start" style={{ paddingVertical: space.sm, marginBottom: last ? 0 : 2 }}>
      <Badge label={on ? 'Activa' : 'No'} tone={on ? 'accent' : 'muted'} />
      <View style={{ flex: 1 }}>
        <T variant="bodyMedium">{title}</T>
        <T variant="caption" tone="dim">{detail}</T>
      </View>
    </Row>
  );
}
