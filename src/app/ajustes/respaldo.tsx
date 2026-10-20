import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { cloudApi, normalizeBaseUrl, type CloudBackupMeta } from '@/backup/api';
import { buildCsv, CSV_KINDS, type CsvKind } from '@/backup/csv';
import { exportCsv, exportJsonBackup, listSafetyCopies, pickJsonBackup, readSafetyCopy, saveSafetyCopy, shareSafetyCopy } from '@/backup/files';
import { backupNow, clearCloudConfig, getCloudConfig, refreshSyncState, saveCloudConfig, syncDeps, useSyncState } from '@/backup/service';
import { countUserRecords, hasUserChanges, type BackupEnvelope } from '@/backup/snapshot';
import { applyRestore, prepareCloudRestore, setLinked } from '@/backup/sync';
import { Field, Sheet, confirm } from '@/components/ui/form';
import { ListRow, Screen } from '@/components/ui/layout';
import { Badge, Button, Card, Chip, Divider, Row, SectionHeader, T } from '@/components/ui/primitives';
import { resetAllData } from '@/data/reset';
import { addDays, formatDateTime, todayKey } from '@/lib/dates';
import { useDb, useMutation } from '@/state/db';
import { notifyDataChanged } from '@/state/dataBus';
import { useToast } from '@/state/toast';
import { space } from '@/theme/tokens';

function describe(env: BackupEnvelope): string {
  const t = env.snapshot.counts;
  return `${t.meal_logs} comidas registradas, ${t.weight_entries} pesos, ${t.workout_sessions} entrenamientos, ${t.gym_attendance} días de gym y ${t.workout_routines} rutinas.`;
}

export default function BackupScreen() {
  const db = useDb();
  const run = useMutation();
  const toast = useToast();
  const sync = useSyncState();
  const [host, setHost] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [cloudList, setCloudList] = useState<CloudBackupMeta[] | null>(null);
  const [linkChoice, setLinkChoice] = useState<{ count: number; latest: CloudBackupMeta } | null>(null);
  const [csvKind, setCsvKind] = useState<CsvKind>('comidas');
  const [csvRange, setCsvRange] = useState<'30' | '90' | 'all'>('all');
  const [copies, setCopies] = useState(listSafetyCopies());

  useEffect(() => {
    getCloudConfig().then((cfg) => setHost(cfg ? cfg.url.replace(/^https?:\/\//, '').split('/')[0] : null)).catch(() => setHost(null));
    void refreshSyncState();
  }, [sync.configured]);

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Algo salió mal', 'error');
    } finally {
      setBusy(null);
      setCopies(listSafetyCopies());
      void refreshSyncState();
    }
  };

  /** Validated restore with a safety copy first; local data is untouched unless every step succeeds. */
  const restore = async (envelope: BackupEnvelope, sourceId: string | null, warnLocal: boolean) => {
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

  const connect = () =>
    withBusy('connect', async () => {
      const config = { url: normalizeBaseUrl(url), token: token.trim() };
      if (!/^https:\/\//.test(config.url)) throw new Error('La dirección tiene que empezar con https://');
      const status = await cloudApi.status(config);
      await saveCloudConfig(config);
      setSetupOpen(false);
      setToken('');
      toast.show('Conectado al servidor de respaldo');
      await startLink(status.count, status.latest);
    });

  /** Decides what happens with backups already in the cloud before automatic backups start. */
  const startLink = async (count: number, latest: CloudBackupMeta | null) => {
    if (count === 0 || !latest) {
      await setLinked(db, true);
      await backupNow(true);
      return;
    }
    setLinkChoice({ count, latest });
  };

  const resumeLink = () =>
    withBusy('link', async () => {
      const cfg = await getCloudConfig();
      if (!cfg) return;
      const status = await cloudApi.status(cfg);
      await startLink(status.count, status.latest);
    });

  const status = (() => {
    if (!sync.configured) return { label: 'Sin configurar', tone: 'muted' as const };
    if (!sync.info?.linked) return { label: 'En pausa', tone: 'weight' as const };
    if (sync.running) return { label: 'Respaldando…', tone: 'protein' as const };
    if (sync.info?.lastError && sync.info.pendingChanges) return { label: 'Error', tone: 'danger' as const };
    if (!sync.online && sync.info?.pendingChanges) return { label: 'Sin conexión', tone: 'weight' as const };
    if (sync.info?.pendingChanges) return { label: 'Cambios pendientes', tone: 'weight' as const };
    return { label: 'Al día', tone: 'accent' as const };
  })();

  return (
    <Screen title="Datos y respaldo">
      <SectionHeader title="Respaldo en la nube" />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="h3">Neon PostgreSQL</T>
          <Badge label={status.label} tone={status.tone} />
        </Row>
        {sync.configured ? (
          <View style={{ gap: 4, marginTop: space.md }}>
            <T variant="label" tone="muted">Servidor: {host ?? '—'}</T>
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
          </View>
        ) : (
          <T variant="label" tone="muted" style={{ marginTop: space.md }}>
            Conectá tu API personal (Vercel + Neon) con tu token para tener copias automáticas y poder recuperar todo si cambiás de teléfono. Los pasos están en el README.
          </T>
        )}
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {!sync.configured ? (
            <Button label="Configurar conexión" icon="link" onPress={() => setSetupOpen(true)} />
          ) : !sync.info?.linked ? (
            <Button label="Revisar respaldos de la nube" icon="cloud" loading={busy === 'link'} onPress={resumeLink} />
          ) : (
            <Button
              label="Respaldar ahora"
              icon="upload-cloud"
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
          )}
          {sync.configured ? (
            <>
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
              <Button
                label="Desconectar"
                variant="ghost"
                size="sm"
                onPress={async () => {
                  if (!(await confirm('Desconectar', 'Se borra la dirección y el token de este teléfono. Tus respaldos en la nube no se tocan.', 'Desconectar', true))) return;
                  await clearCloudConfig();
                  await setLinked(db, false);
                  void refreshSyncState();
                }}
              />
            </>
          ) : null}
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
              await exportCsv(`momentum-${csvKind}-${today}.csv`, csv);
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

      <Sheet visible={setupOpen} onClose={() => setSetupOpen(false)} title="Conectar respaldo">
        <View style={{ gap: space.lg }}>
          <Field label="Dirección de tu API" value={url} onChangeText={setUrl} placeholder="https://momentum-api-tuusuario.vercel.app" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <Field label="Token personal" value={token} onChangeText={setToken} placeholder="El valor de MOMENTUM_API_TOKEN" autoCapitalize="none" autoCorrect={false} secureTextEntry />
          <T variant="caption" tone="dim">El token se guarda cifrado en este teléfono (SecureStore) y nunca se incluye en los respaldos.</T>
          <Button label="Probar y conectar" icon="link" loading={busy === 'connect'} disabled={!url.trim() || !token.trim()} onPress={connect} />
        </View>
      </Sheet>

      <Sheet visible={!!linkChoice} onClose={() => setLinkChoice(null)} title="Ya tenés respaldos en la nube">
        {linkChoice ? (
          <View style={{ gap: space.md }}>
            <T variant="label" tone="muted">
              Hay {linkChoice.count} {linkChoice.count === 1 ? 'respaldo' : 'respaldos'}. El último es del {formatDateTime(linkChoice.latest.createdAt)} con{' '}
              {countUserRecordsFromCounts(linkChoice.latest.counts)} registros.
            </T>
            <Button
              label="Restaurar el último respaldo"
              icon="download-cloud"
              loading={busy === 'restore-link'}
              onPress={() =>
                withBusy('restore-link', async () => {
                  const check = await prepareCloudRestore(syncDeps(db), linkChoice.latest.id);
                  const done = await restore(check.envelope, check.meta.id, check.localHasUnsavedChanges);
                  if (done) setLinkChoice(null);
                })
              }
            />
            <Button
              label="Mantener los datos de este teléfono"
              variant="secondary"
              onPress={async () => {
                const yes = await confirm(
                  'Mantener datos locales',
                  'Los datos de este teléfono se suben como una versión nueva. Los respaldos anteriores siguen guardados en la nube.',
                  'Mantener',
                );
                if (!yes) return;
                await setLinked(db, true);
                setLinkChoice(null);
                await backupNow(true);
              }}
            />
            <Button label="Decidir después" variant="ghost" onPress={() => setLinkChoice(null)} />
          </View>
        ) : null}
      </Sheet>

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
                  subtitle={`${countUserRecordsFromCounts(b.counts)} registros · ${Math.max(1, Math.round(b.sizeBytes / 1024))} KB`}
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

function countUserRecordsFromCounts(counts: CloudBackupMeta['counts']): number {
  return countUserRecords({ counts } as Parameters<typeof countUserRecords>[0]);
}
