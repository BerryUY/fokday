import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { deleteAccount, signOut, useAccount } from '@/auth/account';
import { confirm } from '@/components/ui/form';
import { EmptyState, ListRow, Loading, Screen } from '@/components/ui/layout';
import { Button, Card, Divider, T } from '@/components/ui/primitives';
import { useDb } from '@/state/db';
import { useToast } from '@/state/toast';
import { space } from '@/theme/tokens';

/** The signed-in account: who you are, your plan, sign out and delete everything in the cloud. */
export default function AccountScreen() {
  const db = useDb();
  const toast = useToast();
  const { account, loading } = useAccount();
  const [busy, setBusy] = useState<string | null>(null);

  if (loading) return <Screen title="Tu cuenta"><Loading /></Screen>;
  if (!account) {
    return (
      <Screen title="Tu cuenta">
        <EmptyState
          icon="user"
          title="No entraste con ninguna cuenta"
          message="Todo funciona en este teléfono. Con una cuenta tus datos se respaldan solos y se activan la foto con IA y el escáner."
          action={<Button label="Iniciar sesión o crear cuenta" icon="log-in" onPress={() => router.push('/cuenta/entrar')} />}
        />
      </Screen>
    );
  }

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Algo salió mal', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="Tu cuenta">
      <Card style={{ gap: 4 }}>
        <T variant="h3">{account.name ?? account.email ?? 'Tu cuenta'}</T>
        {account.email ? <T variant="label" tone="muted">{account.email}</T> : null}
        <T variant="caption" tone="dim">{account.provider === 'google' ? 'Entraste con Google' : 'Entraste con email'}</T>
      </Card>

      <Card padded={false} style={{ marginTop: space.md, paddingVertical: space.xs }}>
        <ListRow icon="cloud" iconTone="accent" title="Datos y respaldo" subtitle="Respaldos en la nube, exportar y restaurar" onPress={() => router.push('/ajustes/respaldo')} />
      </Card>

      <View style={{ gap: space.sm, marginTop: space.xl }}>
        <Button
          label="Cerrar sesión"
          icon="log-out"
          variant="secondary"
          loading={busy === 'out'}
          onPress={async () => {
            if (!(await confirm('Cerrar sesión', 'Tus datos siguen en este teléfono. Los respaldos automáticos se pausan hasta que vuelvas a iniciar sesión.', 'Cerrar sesión'))) return;
            await run('out', async () => {
              await signOut(db);
              toast.show('Sesión cerrada');
              router.back();
            });
          }}
        />
        <Divider style={{ marginVertical: space.md }} />
        <T variant="caption" tone="dim">
          Eliminar la cuenta borra tu perfil, todos tus respaldos en la nube y las comidas que compartiste. Los datos de este teléfono no se tocan. Si tenés Pro, cancelá la suscripción desde Google Play.
        </T>
        <Button
          label="Eliminar mi cuenta"
          icon="trash-2"
          variant="danger"
          loading={busy === 'delete'}
          onPress={async () => {
            if (!(await confirm('Eliminar cuenta', 'Se borran tu cuenta, tu perfil y todos tus respaldos en la nube.', 'Continuar', true))) return;
            if (!(await confirm('¿Seguro?', 'No se puede deshacer.', 'Eliminar', true))) return;
            await run('delete', async () => {
              await deleteAccount(db);
              toast.show('Cuenta eliminada');
              router.back();
            });
          }}
        />
      </View>
    </Screen>
  );
}
