import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { createCloudProfile, defaultApiUrl } from '@/backup/service';
import { Field } from '@/components/ui/form';
import { Screen } from '@/components/ui/layout';
import { Button, Card, Chip, Row, T } from '@/components/ui/primitives';
import { completeOnboarding, isOnboarded } from '@/data/settings';
import { DAY_SHORT, todayKey, WEEK_ORDER } from '@/lib/dates';
import { parsePositive } from '@/lib/format';
import { useDb, useMutation, useQuery } from '@/state/db';
import { useToast } from '@/state/toast';
import { space } from '@/theme/tokens';

export default function WelcomeScreen() {
  const db = useDb();
  const run = useMutation();
  const toast = useToast();
  const apiUrl = defaultApiUrl();
  const finishing = useRef(false);
  const [invite, setInvite] = useState('');
  const { data: onboarded } = useQuery((db) => isOnboarded(db), []);
  const [name, setName] = useState('');
  const [current, setCurrent] = useState('');
  const [target, setTarget] = useState('');
  const [kcal, setKcal] = useState('2500');
  const [prot, setProt] = useState('100');
  const [days, setDays] = useState<number[]>([1, 3, 5]);

  // Restoring a backup from this screen marks setup as done: leave once that happens.
  useEffect(() => {
    if (onboarded && !finishing.current) router.replace('/');
  }, [onboarded]);

  const currentValue = parsePositive(current);
  const targetValue = parsePositive(target);
  const kcalValue = parsePositive(kcal);
  const protValue = parsePositive(prot);
  const valid = !!currentValue && !!targetValue && !!kcalValue && !!protValue && currentValue >= 20 && currentValue <= 300 && targetValue >= 20 && targetValue <= 300;

  const toggleDay = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const start = async () => {
    if (!valid) return;
    finishing.current = true;
    const ok = await run(
      (db) => completeOnboarding(db, { name, currentWeight: currentValue!, targetWeight: targetValue!, calories: kcalValue!, protein: protValue!, trainingDays: days }, todayKey()),
      { success: '¡Listo! Empecemos' },
    );
    if (ok === undefined) {
      finishing.current = false;
      return;
    }
    if (invite.trim() && apiUrl) {
      try {
        await createCloudProfile(db, { url: apiUrl, inviteCode: invite, name });
        router.replace({ pathname: '/ajustes/respaldo', params: { nuevo: '1' } });
        return;
      } catch (e) {
        toast.show(`${e instanceof Error ? e.message : 'No se pudo crear el perfil.'} Podés crearlo después en Ajustes → Datos y respaldo.`, 'error');
      }
    }
    router.replace('/');
  };

  return (
    <Screen
      title="Bienvenido a Momentum"
      subtitle="Contanos de vos para armar tu seguimiento. Todo se puede cambiar después en Ajustes."
      footer={<Button label="Empezar" icon="check" size="lg" onPress={start} disabled={!valid} />}
    >
      <View style={{ gap: space.lg }}>
        <Field label="¿Cómo te llamás?" value={name} onChangeText={setName} placeholder="Para el saludo" autoFocus />
        <Row gap={space.md} align="flex-start">
          <View style={{ flex: 1 }}>
            <Field label="Peso actual" value={current} onChangeText={setCurrent} keyboardType="decimal-pad" suffix="kg" placeholder="70,0" error={current && !currentValue ? 'Inválido' : null} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Peso meta" value={target} onChangeText={setTarget} keyboardType="decimal-pad" suffix="kg" placeholder="75,0" error={target && !targetValue ? 'Inválido' : null} />
          </View>
        </Row>
        <Row gap={space.md} align="flex-start">
          <View style={{ flex: 1 }}>
            <Field label="Calorías diarias" value={kcal} onChangeText={setKcal} keyboardType="numeric" suffix="kcal" error={kcal && !kcalValue ? 'Inválido' : null} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Proteína diaria" value={prot} onChangeText={setProt} keyboardType="decimal-pad" suffix="g" error={prot && !protValue ? 'Inválido' : null} />
          </View>
        </Row>
        <View style={{ gap: 6 }}>
          <T variant="bodyMedium">Días de gym</T>
          <T variant="caption" tone="dim">La racha y la constancia se calculan sobre estos días.</T>
          <Row style={{ flexWrap: 'wrap', marginTop: space.sm }} gap={6}>
            {WEEK_ORDER.map((d) => (
              <Chip key={d} label={DAY_SHORT[d]} compact selected={days.includes(d)} onPress={() => toggleDay(d)} />
            ))}
          </Row>
        </View>
        {apiUrl ? (
          <Field
            label="Código de invitación (opcional)"
            value={invite}
            onChangeText={setInvite}
            placeholder="Para guardar tus datos en la nube"
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}
        <Card tone="alt">
          <T variant="caption" tone="muted">
            Las calorías y la proteína de arriba son valores de ejemplo: cambialos por los tuyos. Tus datos viven en este teléfono y funcionan sin internet.
          </T>
        </Card>
        <Button label="Ya tengo un respaldo" icon="cloud" variant="ghost" onPress={() => router.push('/ajustes/respaldo')} />
      </View>
    </Screen>
  );
}
