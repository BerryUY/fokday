import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInRight, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { finishSignIn, signInWithGoogle, useAccount, type LinkChoice } from '@/auth/account';
import { authConfigured } from '@/auth/supabase';
import { LinkChoiceSheet } from '@/components/CloudLink';
import { FokDayMark } from '@/components/brand/FokDayMark';
import { Button, Chip, IconButton, Row, T } from '@/components/ui/primitives';
import { completeOnboarding, isOnboarded, updateProfile, type FeatureKey } from '@/data/settings';
import { EXTRA_NUTRIENTS } from '@/domain/nutrition';
import { suggestTarget, suggestTargets, targetMatchesGoal, type Goal } from '@/domain/onboarding';
import { DAY_SHORT, todayKey, WEEK_ORDER } from '@/lib/dates';
import { formatKg, formatNumber, parsePositive } from '@/lib/format';
import { useDb, useMutation, useQuery } from '@/state/db';
import { haptic, useToast } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type StepKey = 'hola' | 'nombre' | 'objetivo' | 'peso' | 'meta' | 'nutricion' | 'gym' | 'extras' | 'nube' | 'listo';

const GOALS: { key: Goal; title: string; subtitle: string; icon: IconName }[] = [
  { key: 'gain', title: 'Subir de peso', subtitle: 'Ganar masa muscular o kilos', icon: 'trending-up' },
  { key: 'lose', title: 'Bajar de peso', subtitle: 'Perder grasa de a poco', icon: 'trending-down' },
  { key: 'maintain', title: 'Mantenerme', subtitle: 'Sostener mi peso y mis hábitos', icon: 'scale-balance' },
];

const EXTRAS: { key: FeatureKey; title: string; icon: IconName }[] = [
  { key: 'water', title: 'Agua', icon: 'water-outline' },
  { key: 'creatine', title: 'Creatina', icon: 'flask-outline' },
  ...EXTRA_NUTRIENTS.map((n) => ({
    key: n.key as FeatureKey,
    title: n.label,
    icon: ({ carbs: 'bread-slice-outline', fat: 'water-opacity', fiber: 'leaf', dairy: 'cup-outline' } as Record<string, IconName>)[n.key],
  })),
];

const DAY_PRESETS: { label: string; days: number[] }[] = [
  { label: '3 días', days: [1, 3, 5] },
  { label: '4 días', days: [1, 2, 4, 5] },
  { label: '5 días', days: [1, 2, 3, 4, 5] },
  { label: 'Todavía no', days: [] },
];

/** First-run setup as short, one-question steps. Nothing is saved until the last step. */
export default function WelcomeScreen() {
  const c = useColors();
  const db = useDb();
  const run = useMutation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { account } = useAccount();
  const [signingIn, setSigningIn] = useState(false);
  const [choice, setChoice] = useState<LinkChoice | null>(null);
  const finishing = useRef(false);
  const { data: onboarded } = useQuery((d) => isOnboarded(d), []);

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [weight, setWeight] = useState(70);
  const [target, setTarget] = useState(75);
  const [targetTouched, setTargetTouched] = useState(false);
  const [calories, setCalories] = useState(2500);
  const [protein, setProtein] = useState(120);
  const [targetsTouched, setTargetsTouched] = useState(false);
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [saving, setSaving] = useState(false);

  // Restoring a backup from here marks setup as done: leave once that happens.
  useEffect(() => {
    if (onboarded && !finishing.current) router.replace('/');
  }, [onboarded]);

  const steps: StepKey[] = ['hola', 'nombre', 'objetivo', 'peso', ...(goal === 'maintain' ? [] : ['meta' as const]), 'nutricion', 'gym', 'extras', ...(authConfigured ? ['nube' as const] : []), 'listo'];
  const key = steps[Math.min(step, steps.length - 1)];
  const progress = step / (steps.length - 1);

  // Suggestions follow earlier answers until the person edits them.
  const effectiveTarget = goal === 'maintain' ? weight : targetTouched ? target : suggestTarget(weight, goal ?? 'gain');
  const suggested = suggestTargets(weight, goal ?? 'maintain');
  const effCalories = targetsTouched ? calories : suggested.calories;
  const effProtein = targetsTouched ? protein : suggested.protein;
  const targetOk = !goal || targetMatchesGoal(weight, effectiveTarget, goal);

  const next = () => {
    haptic('light');
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const finish = async () => {
    setSaving(true);
    finishing.current = true;
    const ok = await run(async (d) => {
      await completeOnboarding(
        d,
        { name, currentWeight: weight, targetWeight: effectiveTarget, calories: effCalories, protein: effProtein, trainingDays: days },
        todayKey(),
      );
      await updateProfile(d, { features });
    });
    if (ok === undefined) {
      finishing.current = false;
      setSaving(false);
      return;
    }
    haptic('success');
    router.replace('/');
  };

  /** Google right from the welcome; email opens the account screen and comes back here. */
  const google = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
      const pending = await finishSignIn(db);
      if (pending) setChoice(pending);
      else next();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No pudimos entrar.';
      if (msg !== 'cancelled') toast.show(msg, 'error');
    } finally {
      setSigningIn(false);
    }
  };

  const footer: Record<StepKey, ReactNode> = {
    hola: (
      <View style={{ gap: space.sm }}>
        <Button label="Empecemos" icon="arrow-right" size="lg" onPress={next} />
        <Button label="Ya tengo una cuenta" icon="log-in" variant="ghost" size="sm" onPress={() => router.push(authConfigured ? '/cuenta/entrar' : '/ajustes/respaldo')} />
      </View>
    ),
    nombre: <Button label="Continuar" size="lg" onPress={next} disabled={!name.trim()} />,
    objetivo: <Button label="Continuar" size="lg" onPress={next} disabled={!goal} />,
    peso: <Button label="Continuar" size="lg" onPress={next} />,
    meta: <Button label="Continuar" size="lg" onPress={next} disabled={!targetOk} />,
    nutricion: <Button label="Continuar" size="lg" onPress={next} />,
    gym: <Button label="Continuar" size="lg" onPress={next} />,
    extras: <Button label={features.length ? 'Continuar' : 'Por ahora nada más'} size="lg" variant={features.length ? 'primary' : 'secondary'} onPress={next} />,
    nube: account ? (
      <Button label="Continuar" size="lg" onPress={next} />
    ) : (
      <View style={{ gap: space.sm }}>
        <Button label="Continuar con Google" icon="log-in" size="lg" loading={signingIn} onPress={google} />
        <Button label="Con email" icon="mail" variant="secondary" onPress={() => router.push('/cuenta/entrar')} />
        <Button label="Ahora no" variant="ghost" size="sm" onPress={next} />
      </View>
    ),
    listo: <Button label="Empezar" icon="check" size="lg" onPress={finish} loading={saving} />,
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        {step > 0 && key !== 'listo' ? <IconButton icon="chevron-left" label="Atrás" onPress={back} /> : <View style={{ width: 40 }} />}
        <ProgressTrack progress={progress} />
        <View style={{ width: 40 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Animated.View key={key} entering={FadeInRight.duration(260)} style={{ gap: space.xl }}>
          {key === 'hola' ? (
            <View style={{ alignItems: 'center', gap: space.lg, paddingTop: space.xxxl }}>
              <BrandMark />
              <T variant="hero" style={{ textAlign: 'center' }}>¡Hola! Soy FokDay</T>
              <T variant="body" tone="muted" style={{ textAlign: 'center', maxWidth: 320 }}>
                Te ayudo a seguir tus comidas, tus entrenamientos y tu peso. Son unas preguntas cortitas y arrancamos.
              </T>
            </View>
          ) : null}

          {key === 'nombre' ? (
            <>
              <Question title="¿Cómo te llamás?" subtitle="Es para saludarte cada día." />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Tu nombre"
                placeholderTextColor={c.textDim}
                autoFocus
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => name.trim() && next()}
                maxFontSizeMultiplier={1.3}
                style={[styles.bigInput, { color: c.text, borderColor: name ? c.accent : c.border, backgroundColor: c.surface }]}
              />
            </>
          ) : null}

          {key === 'objetivo' ? (
            <>
              <Question title={`${name.trim() ? `${name.trim()}, ¿qué` : '¿Qué'} querés lograr?`} subtitle="Elegí una opción. Después la podés cambiar." />
              <View style={{ gap: space.md }}>
                {GOALS.map((g) => (
                  <OptionCard
                    key={g.key}
                    icon={g.icon}
                    title={g.title}
                    subtitle={g.subtitle}
                    selected={goal === g.key}
                    onPress={() => {
                      haptic('light');
                      setGoal(g.key);
                    }}
                  />
                ))}
              </View>
            </>
          ) : null}

          {key === 'peso' ? (
            <>
              <Question title="¿Cuánto pesás hoy?" subtitle="Con un número aproximado alcanza. Va a ser tu punto de partida." />
              <WeightPicker value={weight} onChange={setWeight} />
            </>
          ) : null}

          {key === 'meta' ? (
            <>
              <Question title="¿A qué peso querés llegar?" subtitle="Una meta realista. Después podés sumar hitos intermedios." />
              <WeightPicker
                value={effectiveTarget}
                onChange={(v) => {
                  setTargetTouched(true);
                  setTarget(v);
                }}
              />
              <View style={{ alignItems: 'center' }}>
                {targetOk ? (
                  <View style={[styles.delta, { backgroundColor: c.accentSoft }]}>
                    <T variant="bodyMedium" tone="accent">
                      {effectiveTarget > weight ? '+' : '−'}{formatKg(Math.abs(effectiveTarget - weight))} kg desde hoy
                    </T>
                  </View>
                ) : (
                  <T variant="label" tone="danger" style={{ textAlign: 'center' }}>
                    {goal === 'gain' ? 'Para subir, la meta tiene que ser mayor a tu peso de hoy.' : 'Para bajar, la meta tiene que ser menor a tu peso de hoy.'}
                  </T>
                )}
              </View>
            </>
          ) : null}

          {key === 'nutricion' ? (
            <>
              <Question title="Tus objetivos de cada día" subtitle="Te sugerimos estos valores según tu peso y tu meta. Ajustalos si ya tenés los tuyos." />
              <View style={{ gap: space.md }}>
                <TargetRow
                  icon="fire"
                  label="Calorías"
                  value={`${formatNumber(effCalories)} kcal`}
                  onMinus={() => {
                    setTargetsTouched(true);
                    setCalories(Math.max(800, effCalories - 50));
                    setProtein(effProtein);
                  }}
                  onPlus={() => {
                    setTargetsTouched(true);
                    setCalories(Math.min(6000, effCalories + 50));
                    setProtein(effProtein);
                  }}
                />
                <TargetRow
                  icon="food-steak"
                  label="Proteína"
                  value={`${formatNumber(effProtein)} g`}
                  onMinus={() => {
                    setTargetsTouched(true);
                    setProtein(Math.max(20, effProtein - 5));
                    setCalories(effCalories);
                  }}
                  onPlus={() => {
                    setTargetsTouched(true);
                    setProtein(Math.min(400, effProtein + 5));
                    setCalories(effCalories);
                  }}
                />
              </View>
              <T variant="caption" tone="dim">Es una guía aproximada, no una indicación médica. Si te acompaña un nutricionista, usá sus números.</T>
            </>
          ) : null}

          {key === 'gym' ? (
            <>
              <Question title="¿Qué días vas al gym?" subtitle="Tu racha se cuenta sobre estos días. Los demás son descanso." />
              <View style={styles.days}>
                {WEEK_ORDER.map((d) => {
                  const on = days.includes(d);
                  return (
                    <Pressable
                      key={d}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={DAY_SHORT[d]}
                      onPress={() => {
                        haptic('light');
                        setDays(on ? days.filter((x) => x !== d) : [...days, d]);
                      }}
                      style={[styles.day, { backgroundColor: on ? c.accent : c.surface, borderColor: on ? c.accent : c.border }]}
                    >
                      <T variant="bodyMedium" color={on ? c.accentText : c.text} maxFontSizeMultiplier={1.2}>{DAY_SHORT[d]}</T>
                    </Pressable>
                  );
                })}
              </View>
              <Row style={{ flexWrap: 'wrap', justifyContent: 'center' }} gap={6}>
                {DAY_PRESETS.map((p) => (
                  <Chip key={p.label} label={p.label} compact selected={p.days.join() === [...days].sort().join()} onPress={() => setDays(p.days)} />
                ))}
              </Row>
            </>
          ) : null}

          {key === 'extras' ? (
            <>
              <Question title="¿Querés seguir algo más?" subtitle="Opcional. Lo que no elijas no aparece en la app, así queda todo más limpio." />
              <View style={styles.grid}>
                {EXTRAS.map((x) => {
                  const on = features.includes(x.key);
                  return (
                    <Tile
                      key={x.key}
                      icon={x.icon}
                      title={x.title}
                      selected={on}
                      onPress={() => {
                        haptic('light');
                        setFeatures(on ? features.filter((k) => k !== x.key) : [...features, x.key]);
                      }}
                    />
                  );
                })}
              </View>
            </>
          ) : null}

          {key === 'nube' ? (
            <>
              <Question
                title="Guardá tu progreso"
                subtitle={account ? `Entraste como ${account.email ?? account.name ?? 'vos'}. Tus datos se respaldan solos.` : 'Con una cuenta tus datos se respaldan solos y los recuperás si cambiás de teléfono. Es opcional.'}
              />
              <View style={{ gap: space.md }}>
                {[
                  { icon: 'cloud-check-outline' as const, text: 'Respaldo automático en la nube' },
                  { icon: 'camera-outline' as const, text: 'Foto con IA y escáner de códigos' },
                  { icon: 'cellphone-arrow-down' as const, text: 'Tus datos en cualquier teléfono' },
                ].map((b) => (
                  <Row key={b.text} gap={space.md}>
                    <MaterialCommunityIcons name={b.icon} size={24} color={account ? c.accent : c.textMuted} />
                    <T variant="bodyMedium">{b.text}</T>
                  </Row>
                ))}
              </View>
            </>
          ) : null}

          {key === 'listo' ? (
            <View style={{ alignItems: 'center', gap: space.lg, paddingTop: space.xxl }}>
              <Animated.View entering={FadeIn.duration(400)} style={[styles.done, { backgroundColor: c.accent }]}>
                <Feather name="check" size={56} color={c.accentText} />
              </Animated.View>
              <T variant="hero" style={{ textAlign: 'center' }}>¡Listo{name.trim() ? `, ${name.trim()}` : ''}!</T>
              <T variant="body" tone="muted" style={{ textAlign: 'center', maxWidth: 320 }}>Tu plan está armado. Todo se puede cambiar después en Ajustes.</T>
              <View style={[styles.summary, { backgroundColor: c.surface, borderColor: c.border }]}>
                <SummaryRow icon="flag-checkered" label="Meta" value={goal === 'maintain' ? `Mantener ${formatKg(weight)} kg` : `${formatKg(weight)} → ${formatKg(effectiveTarget)} kg`} />
                <SummaryRow icon="fire" label="Cada día" value={`${formatNumber(effCalories)} kcal · ${formatNumber(effProtein)} g de proteína`} />
                <SummaryRow icon="dumbbell" label="Gym" value={days.length ? WEEK_ORDER.filter((d) => days.includes(d)).map((d) => DAY_SHORT[d]).join(' · ') : 'Sin días fijos'} />
                {features.length ? <SummaryRow icon="plus-circle-outline" label="Extras" value={EXTRAS.filter((x) => features.includes(x.key)).map((x) => x.title).join(', ')} /> : null}
              </View>
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>{footer[key]}</View>
      <LinkChoiceSheet
        choice={choice}
        onClose={() => {
          setChoice(null);
          next();
        }}
      />
    </KeyboardAvoidingView>
  );
}

function ProgressTrack({ progress }: { progress: number }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const fill = useAnimatedStyle(() => ({ width: withTiming(Math.max(10, width * progress), { duration: 300 }) }), [progress, width]);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: c.track }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <Animated.View style={[styles.trackFill, { backgroundColor: c.accent }, fill]} />
    </View>
  );
}

function Question({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: space.sm, paddingTop: space.lg }}>
      <T variant="display">{title}</T>
      {subtitle ? <T variant="body" tone="muted">{subtitle}</T> : null}
    </View>
  );
}

function OptionCard({ icon, title, subtitle, selected, onPress }: { icon: IconName; title: string; subtitle: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.option, { backgroundColor: selected ? c.accentSoft : c.surface, borderColor: selected ? c.accent : c.border }]}
    >
      <View style={[styles.optionIcon, { backgroundColor: selected ? c.accent : c.surfaceAlt }]}>
        <MaterialCommunityIcons name={icon} size={24} color={selected ? c.accentText : c.text} />
      </View>
      <View style={{ flex: 1 }}>
        <T variant="h3">{title}</T>
        <T variant="label" tone="muted">{subtitle}</T>
      </View>
      <View style={[styles.radio, { borderColor: selected ? c.accent : c.border, backgroundColor: selected ? c.accent : 'transparent' }]}>
        {selected ? <Feather name="check" size={14} color={c.accentText} /> : null}
      </View>
    </Pressable>
  );
}

function Tile({ icon, title, selected, onPress }: { icon: IconName; title: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.tile, { backgroundColor: selected ? c.accentSoft : c.surface, borderColor: selected ? c.accent : c.border }]}
    >
      <MaterialCommunityIcons name={icon} size={28} color={selected ? c.accent : c.textMuted} />
      <T variant="bodyMedium" numberOfLines={1} maxFontSizeMultiplier={1.2}>{title}</T>
      {selected ? (
        <View style={[styles.tileCheck, { backgroundColor: c.accent }]}>
          <Feather name="check" size={12} color={c.accentText} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Big number with −/+ (0,5 kg steps) that can also be typed. */
function WeightPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const c = useColors();
  // While typing, the field shows the draft; otherwise it always reflects the current value.
  const [draft, setDraft] = useState<string | null>(null);
  const set = (v: number) => {
    haptic('light');
    onChange(Math.min(300, Math.max(30, Math.round(v * 2) / 2)));
  };
  return (
    <Row style={{ justifyContent: 'center', gap: space.lg }}>
      <RoundButton icon="minus" label="Restar medio kilo" onPress={() => set(value - 0.5)} />
      <View style={{ alignItems: 'center', minWidth: 140 }}>
        <TextInput
          value={draft ?? formatKg(value)}
          onChangeText={setDraft}
          onFocus={() => setDraft(formatKg(value))}
          onEndEditing={() => {
            const v = parsePositive(draft ?? '');
            if (v) set(v);
            setDraft(null);
          }}
          keyboardType="decimal-pad"
          selectTextOnFocus
          maxFontSizeMultiplier={1.2}
          style={[styles.weightInput, { color: c.text }]}
          accessibilityLabel="Peso en kilos"
        />
        <T variant="label" tone="dim">kg</T>
      </View>
      <RoundButton icon="plus" label="Sumar medio kilo" onPress={() => set(value + 0.5)} />
    </Row>
  );
}

function RoundButton({ icon, label, onPress }: { icon: 'minus' | 'plus'; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.round, { backgroundColor: c.surfaceAlt }]}>
      <Feather name={icon} size={24} color={c.text} />
    </Pressable>
  );
}

function TargetRow({ icon, label, value, onMinus, onPlus }: { icon: IconName; label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  const c = useColors();
  return (
    <View style={[styles.targetRow, { backgroundColor: c.surface, borderColor: c.border }]}>
      <MaterialCommunityIcons name={icon} size={22} color={c.accent} />
      <View style={{ flex: 1 }}>
        <T variant="label" tone="muted">{label}</T>
        <T variant="h2" numberOfLines={1} adjustsFontSizeToFit>{value}</T>
      </View>
      <RoundButton icon="minus" label={`Bajar ${label.toLowerCase()}`} onPress={onMinus} />
      <RoundButton icon="plus" label={`Subir ${label.toLowerCase()}`} onPress={onPlus} />
    </View>
  );
}

function SummaryRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const c = useColors();
  return (
    <Row gap={space.md} align="flex-start">
      <MaterialCommunityIcons name={icon} size={20} color={c.accent} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <T variant="caption" tone="dim">{label}</T>
        <T variant="bodyMedium">{value}</T>
      </View>
    </Row>
  );
}

/** The app mark (three rising bars) drawn with views, so it needs no image. */
function BrandMark() {
  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <FokDayMark size={110} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.sm },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 5 },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md },
  bigInput: { height: 72, borderRadius: radius.lg, borderWidth: 2, paddingHorizontal: space.xl, fontSize: 28, fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 2 },
  optionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  weightInput: { fontSize: 64, fontWeight: '800', letterSpacing: -2, textAlign: 'center', minWidth: 140, padding: 0 },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  delta: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  days: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },
  day: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { width: '47%', flexGrow: 1, minHeight: 104, borderRadius: radius.lg, borderWidth: 2, padding: space.lg, gap: space.sm, justifyContent: 'space-between' },
  tileCheck: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  done: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center' },
  summary: { alignSelf: 'stretch', borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.md },
  mark: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, width: 120, height: 120, borderRadius: 36, borderWidth: 1, justifyContent: 'center', paddingBottom: 30 },
});
