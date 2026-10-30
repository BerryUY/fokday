import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { finishSignIn, signInWithGoogle, useAccount, type LinkChoice } from '@/auth/account';
import { PRO_LIST_PRICES, usePro } from '@/billing/pro';
import { getSetting } from '@/data/settings';
import { AVATAR_KEY, pickAvatar } from '@/lib/avatar';
import { useDb, useMutation, useQuery } from '@/state/db';
import { useToast } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Avatar } from './Avatar';
import { LinkChoiceSheet } from './CloudLink';
import { GoogleButton } from './GoogleButton';
import { Badge, Button, Card, PressableScale, Row, T } from './ui/primitives';

/**
 * Top of Ajustes: your picture (tap to change), name, account and plan. Without an account it
 * becomes the place to create one: Google first, email second.
 */
export function ProfileHeader({ name }: { name: string }) {
  const c = useColors();
  const db = useDb();
  const run = useMutation();
  const toast = useToast();
  const pro = usePro();
  const { account } = useAccount();
  const { data: avatar } = useQuery((d) => getSetting(d, AVATAR_KEY), []);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<LinkChoice | null>(null);

  const google = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
      const pending = await finishSignIn(db);
      toast.show('¡Listo! Tu progreso se guarda en tu cuenta');
      if (pending) setChoice(pending);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No pudimos iniciar sesión.';
      if (msg !== 'cancelled') toast.show(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const displayName = name || account?.name || 'Tu perfil';
  return (
    <>
      <Card style={{ padding: space.xl, marginBottom: space.md }}>
        <Row gap={space.lg}>
          <Avatar uri={avatar ?? account?.avatarUrl ?? null} name={displayName} onPress={() => void run((d) => pickAvatar(d), { silent: true })} />
          <PressableScale style={{ flex: 1 }} onPress={() => router.push(account ? '/cuenta' : '/cuenta/entrar')} accessibilityRole="button" accessibilityLabel="Tu cuenta">
            <Row gap={space.sm}>
              <View style={{ flex: 1 }}>
                <T variant="title" numberOfLines={1}>{displayName}</T>
                <T variant="label" tone="dim" numberOfLines={1}>{account ? account.email ?? 'Cuenta conectada' : 'Sin cuenta: tus datos viven en este teléfono'}</T>
                <View style={{ marginTop: 6 }}>{pro ? <Badge label="FokDay Pro" /> : <Badge label="Plan gratis" tone="muted" />}</View>
              </View>
              <Feather name="chevron-right" size={20} color={c.textDim} />
            </Row>
          </PressableScale>
        </Row>
        {!account ? (
          <View style={{ marginTop: space.xl, gap: space.sm }}>
            <T variant="label" tone="muted">Guardá tu progreso en la nube y activá la foto con IA.</T>
            <GoogleButton onPress={() => void google()} loading={busy} />
            <Button label="Con email" icon="mail" variant="secondary" onPress={() => router.push('/cuenta/entrar')} />
          </View>
        ) : null}
      </Card>

      {!pro ? (
        <Card tone="accent" onPress={() => router.push('/pro')} style={{ marginBottom: space.xl, gap: space.md }}>
          <Row gap={space.md}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="zap" size={22} color={c.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="h3">FokDay Pro</T>
              <T variant="caption" tone="muted">20 fotos con IA por día, escáner ilimitado, resumen semanal y sin videos</T>
            </View>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="bodyMedium" tone="accent">{PRO_LIST_PRICES.monthly} por mes</T>
            <Row gap={4}>
              <T variant="bodyMedium">Ver planes</T>
              <Feather name="chevron-right" size={18} color={c.text} />
            </Row>
          </Row>
        </Card>
      ) : (
        <View style={{ height: space.md }} />
      )}

      <LinkChoiceSheet choice={choice} onClose={() => setChoice(null)} />
    </>
  );
}
