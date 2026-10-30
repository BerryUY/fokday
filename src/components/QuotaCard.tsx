import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { videosAvailable, watchRewardedVideo, type RewardKind } from '@/ads/rewarded';
import { useAccount } from '@/auth/account';
import type { Quota } from '@/backup/api';
import { getPlan, refreshPlan, usePlan } from '@/billing/pro';
import { ProgressBar } from '@/components/ui/progress';
import { Button, Card, Row, T } from '@/components/ui/primitives';
import { haptic, useToast } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const WORDS: Record<RewardKind, { one: string; many: string; unit: string }> = {
  photo: { one: 'foto', many: 'fotos', unit: 'una foto más' },
  barcode: { one: 'escaneo', many: 'escaneos', unit: 'un escaneo más' },
};

export const left = (q: Quota | null) => (q ? Math.max(0, q.limit - q.used) : null);

/** Waits for the server to credit a watched video (AdMob calls it back within seconds). */
async function waitForCredit(kind: RewardKind, before: number): Promise<boolean> {
  const field = kind === 'photo' ? 'ai' : 'barcode';
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 1500 : 2000));
    await refreshPlan();
    const q = getPlan()[field];
    if (q && q.videos > before) return true;
  }
  return false;
}

/**
 * Today's allowance of a limited feature: how many are left and, when they run out, a short
 * rewarded video to earn more (free accounts) or the way to Pro.
 */
export function QuotaCard({ kind }: { kind: RewardKind }) {
  const c = useColors();
  const toast = useToast();
  const { account } = useAccount();
  const plan = usePlan();
  const q = kind === 'photo' ? plan.ai : plan.barcode;
  const [busy, setBusy] = useState(false);
  const w = WORDS[kind];
  if (!q) return null;
  const remaining = left(q) ?? 0;

  if (q.pro || remaining > 0) {
    return (
      <T variant="caption" tone="dim" style={{ textAlign: 'center' }}>
        {q.pro && kind === 'barcode' ? 'Escaneos ilimitados con Pro' : `Te ${remaining === 1 ? 'queda' : 'quedan'} ${remaining} ${remaining === 1 ? w.one : w.many} hoy`}
      </T>
    );
  }

  const watch = async () => {
    if (!account) return;
    setBusy(true);
    try {
      const before = q.videos;
      if (!(await watchRewardedVideo(kind, account.id))) {
        toast.show('Para ganar el premio hay que ver el video hasta el final.', 'info');
        return;
      }
      if (await waitForCredit(kind, before)) {
        haptic('success');
        const fresh = getPlan()[kind === 'photo' ? 'ai' : 'barcode'];
        toast.show(fresh && left(fresh)! > 0 ? `¡Ganaste ${w.unit}!` : '¡Video sumado! Uno más y ganás el premio.');
      } else {
        toast.show('Tu video se está acreditando. Probá de nuevo en un minuto.', 'info');
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo mostrar el video.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const progress = (q.videos % q.videosPerExtra) / q.videosPerExtra;
  return (
    <Card style={{ gap: space.md }}>
      <Row gap={space.sm}>
        <Feather name="gift" size={18} color={c.accent} />
        <T variant="h3" style={{ flex: 1 }}>Ya usaste tus {w.many} de hoy</T>
      </Row>
      {q.bonusLeft > 0 && account && videosAvailable() ? (
        <>
          <T variant="label" tone="muted">
            {q.videosPerExtra === 1 ? `Mirá un video corto y ganá ${w.unit}.` : `Mirá ${q.videosPerExtra} videos cortos y ganá ${w.unit}.`} Podés ganar {q.bonusLeft} más hoy.
          </T>
          {q.videosPerExtra > 1 ? (
            <View style={{ gap: 4 }}>
              <ProgressBar progress={progress} color={c.accent} height={6} />
              <T variant="caption" tone="dim">{q.videos % q.videosPerExtra} de {q.videosPerExtra} videos</T>
            </View>
          ) : null}
          <Button label="Mirar un video" icon="play" loading={busy} onPress={watch} />
        </>
      ) : (
        <T variant="label" tone="muted">{q.bonusLeft > 0 && !account ? 'Iniciá sesión para ganar más mirando videos.' : 'Mañana se renuevan.'}</T>
      )}
      <Button label="Pasate a Pro" icon="zap" variant="secondary" size="sm" onPress={() => router.push('/pro')} />
    </Card>
  );
}
