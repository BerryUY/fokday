import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { DateChip } from '@/components/DatePicker';
import { CATEGORY_ICONS, LogItem, NutritionBars, approx } from '@/components/nutrition';
import { Field, Sheet, confirm } from '@/components/ui/form';
import { EmptyState, Loading, Screen, TabHeader } from '@/components/ui/layout';
import { Button, Card, Divider, IconButton, PressableScale, Row, SectionHeader, T } from '@/components/ui/primitives';
import { PLAN_FOOTNOTE } from '@/data/catalog';
import { duplicateDay, getLogsForDate, listMeals, logMeal } from '@/data/meals';
import { getGoalForDate, setGoalsFrom } from '@/data/settings';
import { guessCategory, MEAL_CATEGORIES, sumDailyTotals } from '@/domain/nutrition';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import { left } from '@/components/QuotaCard';
import { usePlan } from '@/billing/pro';
import { addDays, formatRelative, todayKey } from '@/lib/dates';
import { formatKcal, formatProtein, parsePositive, toInput } from '@/lib/format';
import { useMutation, useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export default function ComidasScreen() {
  const c = useColors();
  const run = useMutation();
  const [date, setDate] = useState(todayKey());
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const previous = addDays(date, -1);

  const { data } = useQuery(async (db) => {
    const [logs, goal, favorites, previousLogs] = await Promise.all([
      getLogsForDate(db, date),
      getGoalForDate(db, date),
      listMeals(db, { favoritesOnly: true }),
      getLogsForDate(db, previous),
    ]);
    return { logs, goal, favorites, previousCount: previousLogs.length, totals: sumDailyTotals(logs) };
  }, [date]);

  const duplicate = async () => {
    if (!data) return;
    const ok = await confirm(
      `Repetir comidas de ${formatRelative(previous).toLowerCase()}`,
      `Se van a copiar ${data.previousCount} registros a ${formatRelative(date).toLowerCase()}.${data.logs.length ? ' Ya hay comidas ese día; se suman a las existentes.' : ''}`,
      'Copiar',
    );
    if (!ok) return;
    await run((db) => duplicateDay(db, previous, date), { success: 'Comidas copiadas' });
  };

  return (
    <Screen tab>
      <TabHeader
        title="Comidas"
        subtitle="Plan de comidas"
        right={<IconButton icon="search" label="Buscar comida" onPress={() => router.push({ pathname: '/comida/buscar', params: { date } })} />}
      />
      <Row style={{ marginBottom: space.lg, justifyContent: 'space-between' }}>
        <DateChip value={date} onChange={setDate} />
        <IconButton icon="sliders" label="Objetivos diarios" onPress={() => setGoalsOpen(true)} />
      </Row>

      {!data ? (
        <Loading />
      ) : (
        <>
          <PhotoHero onPress={() => router.push({ pathname: '/comida/foto', params: { date } })} />
          <View style={styles.actions}>
            <QuickAction icon="maximize" label="Escanear" onPress={() => router.push({ pathname: '/comida/escanear', params: { date } })} />
            <QuickAction icon="zap" label="Rápido" onPress={() => setQuickOpen(true)} />
            <QuickAction icon="globe" label="Biblioteca" onPress={() => router.push({ pathname: '/comida/biblioteca', params: { date } })} />
          </View>

          <Card style={{ padding: space.xl }}>
            <NutritionBars calories={data.totals.calories} protein={data.totals.protein} calorieTarget={data.goal.calories} proteinTarget={data.goal.protein} />
          </Card>

          <View style={styles.grid}>
            {MEAL_CATEGORIES.map((cat, i) => {
              const bucket = data.totals.byCategory[cat.key];
              return (
                <Animated.View key={cat.key} entering={FadeInDown.delay(40 * i).duration(320)} style={cat.key === 'extra' ? styles.tileWide : styles.tileWrap}>
                  <PressableScale
                    onPress={() => router.push({ pathname: '/comida/categoria/[category]', params: { category: cat.key, date } })}
                    style={[styles.tile, { backgroundColor: c.surface, borderColor: bucket.entries ? c.accent : c.border }]}
                    accessibilityRole="button"
                    accessibilityLabel={cat.label}
                  >
                    <Row style={{ justifyContent: 'space-between' }}>
                      <View style={[styles.tileIcon, { backgroundColor: bucket.entries ? c.accentSoft : c.surfaceAlt }]}>
                        <Feather name={CATEGORY_ICONS[cat.key]} size={18} color={bucket.entries ? c.accent : c.textMuted} />
                      </View>
                      {bucket.entries ? <Feather name="check-circle" size={16} color={c.accent} /> : null}
                    </Row>
                    <T variant="h3" style={{ marginTop: space.md }}>{cat.label}</T>
                    <T variant="caption" tone={bucket.entries ? 'muted' : 'dim'}>
                      {bucket.entries ? `${formatKcal(bucket.calories)} kcal · ${formatProtein(bucket.protein)} g` : 'Sin registrar'}
                    </T>
                  </PressableScale>
                </Animated.View>
              );
            })}
          </View>

          <Button label="Algo que no está en la lista" icon="edit-3" variant="ghost" size="sm" style={{ marginTop: space.sm }} onPress={() => router.push({ pathname: '/comida/manual', params: { date } })} />

          {data.favorites.length > 0 ? (
            <View style={{ marginTop: space.xl }}>
              <SectionHeader title="Favoritas" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ marginHorizontal: -space.lg }}>
                <View style={{ width: space.lg - space.sm }} />
                {data.favorites.map((m) => (
                  <PressableScale
                    key={m.id}
                    onPress={() => router.push({ pathname: '/comida/[id]', params: { id: m.id, date } })}
                    style={[styles.fav, { backgroundColor: c.surface }]}
                  >
                    <T variant="bodyMedium" numberOfLines={2}>{m.name}</T>
                    <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
                      <T variant="caption" tone="accent">{approx(m.isEstimate)}{formatKcal(m.calories)} kcal</T>
                      <IconButton
                        icon="plus"
                        label={`Registrar ${m.name}`}
                        size={30}
                        tone="accent"
                        onPress={() => run((db) => logMeal(db, { date, category: date === todayKey() ? guessCategory() : m.category, meal: m }), { success: `${m.name} registrado` })}
                      />
                    </Row>
                  </PressableScale>
                ))}
                <View style={{ width: space.lg - space.sm }} />
              </ScrollView>
            </View>
          ) : null}

          <View style={{ marginTop: space.xl }}>
            <SectionHeader title={`Registrado · ${formatRelative(date)}`} />
            {data.logs.length === 0 ? (
              <Card>
                <EmptyState
                  icon="coffee"
                  title="Todavía no registraste comidas"
                  message="Elegí una categoría y tocá una opción del plan. Se guarda al instante, aunque no tengas internet."
                  action={data.previousCount > 0 ? <Button label={`Repetir lo de ${formatRelative(previous).toLowerCase()}`} icon="copy" variant="secondary" size="sm" onPress={duplicate} /> : undefined}
                />
              </Card>
            ) : (
              <Animated.View layout={LinearTransition}>
                {MEAL_CATEGORIES.map((cat) => {
                  const logs = data.logs.filter((l) => l.category === cat.key);
                  if (logs.length === 0) return null;
                  const bucket = data.totals.byCategory[cat.key];
                  return (
                    <Card key={cat.key} style={{ marginBottom: space.md, paddingVertical: space.md }}>
                      <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                        <Row gap={8}>
                          <Feather name={CATEGORY_ICONS[cat.key]} size={14} color={c.textMuted} />
                          <T variant="overline" tone="muted">{cat.label}</T>
                        </Row>
                        <T variant="caption" tone="dim">{formatKcal(bucket.calories)} kcal · {formatProtein(bucket.protein)} g</T>
                      </Row>
                      {logs.map((log, i) => (
                        <View key={log.id}>
                          {i > 0 ? <Divider /> : null}
                          <LogItem log={log} onPress={() => router.push({ pathname: '/comida/registro/[id]', params: { id: log.id } })} />
                        </View>
                      ))}
                    </Card>
                  );
                })}
                {data.previousCount > 0 ? (
                  <Button label={`Repetir comidas de ${formatRelative(previous).toLowerCase()}`} icon="copy" variant="ghost" size="sm" onPress={duplicate} />
                ) : null}
              </Animated.View>
            )}
          </View>

          <T variant="caption" tone="dim" style={{ marginTop: space.lg, textAlign: 'center' }}>{PLAN_FOOTNOTE}</T>

          <QuickAddSheet visible={quickOpen} onClose={() => setQuickOpen(false)} date={date} />
          <GoalsSheet
            key={`${data.goal.calories}-${data.goal.protein}-${goalsOpen}`}
            visible={goalsOpen}
            onClose={() => setGoalsOpen(false)}
            calories={data.goal.calories}
            protein={data.goal.protein}
          />
        </>
      )}
    </Screen>
  );
}

/** The main way to log food: one photo. Big, filled, impossible to miss; locked when today's are used. */
function PhotoHero({ onPress }: { onPress: () => void }) {
  const c = useColors();
  const out = left(usePlan().ai) === 0;
  const fg = out ? c.text : c.accentText;
  return (
    <PressableScale onPress={onPress} hapticFeedback accessibilityRole="button" accessibilityLabel={out ? 'Foto con IA, sin fotos por hoy' : 'Foto con IA'} style={[styles.hero, { backgroundColor: out ? c.surfaceAlt : c.accent }]}>
      <View style={[styles.heroIcon, { backgroundColor: out ? c.surface : 'rgba(0,0,0,0.12)' }]}>
        <Feather name={out ? 'lock' : 'camera'} size={30} color={out ? c.textMuted : c.accentText} />
      </View>
      <View style={{ flex: 1 }}>
        <T variant="title" color={fg}>Foto con IA</T>
        <T variant="label" color={out ? c.textMuted : c.accentText} style={{ opacity: out ? 1 : 0.75 }}>
          {out ? 'Ya usaste tus fotos de hoy. Ganá otra con un video o pasate a Pro.' : 'Sacale una foto al plato: la IA calcula calorías y macros.'}
        </T>
      </View>
      <Feather name="arrow-right" size={22} color={out ? c.textDim : c.accentText} />
    </PressableScale>
  );
}

/** The other ways to log, smaller: scanner, quick numbers, community library. */
function QuickAction({ icon, label, onPress }: { icon: 'zap' | 'globe' | 'maximize'; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <PressableScale onPress={onPress} hapticFeedback accessibilityRole="button" accessibilityLabel={label} style={[styles.action, { backgroundColor: c.surface }]}>
      <Feather name={icon} size={20} color={c.accent} />
      <T variant="label" numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontWeight: '600' }}>{label}</T>
    </PressableScale>
  );
}

function GoalsSheet({ visible, onClose, calories, protein }: { visible: boolean; onClose: () => void; calories: number; protein: number }) {
  const run = useMutation();
  const [kcal, setKcal] = useState(toInput(calories, 0));
  const [prot, setProt] = useState(toInput(protein, 1));
  const kcalValue = parsePositive(kcal);
  const protValue = parsePositive(prot);
  const save = async () => {
    if (!kcalValue || !protValue) return;
    const ok = await run((db) => setGoalsFrom(db, todayKey(), kcalValue, protValue), { success: 'Objetivos actualizados' });
    if (ok !== undefined) onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Objetivos diarios">
      <View style={{ gap: space.lg }}>
        <Field label="Calorías" value={kcal} onChangeText={setKcal} keyboardType="numeric" suffix="kcal" error={kcal && !kcalValue ? 'Ingresá un número válido' : null} />
        <Field label="Proteína" value={prot} onChangeText={setProt} keyboardType="decimal-pad" suffix="g" error={prot && !protValue ? 'Ingresá un número válido' : null} />
        <T variant="caption" tone="dim">Se aplican desde hoy. Los días anteriores conservan el objetivo que tenían. Son una guía, no una obligación.</T>
        <Button label="Guardar objetivos" onPress={save} disabled={!kcalValue || !protValue} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.lg },
  tileWrap: { width: '47.8%', flexGrow: 1 },
  tileWide: { width: '100%' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderRadius: radius.xl, padding: space.xl, marginBottom: space.sm },
  heroIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  action: { flex: 1, minHeight: 72, borderRadius: radius.lg, paddingHorizontal: space.sm, paddingVertical: space.md, gap: 6, alignItems: 'center', justifyContent: 'center' },
  // Bordered like the routine cards, lime once that meal has something logged.
  tile: { borderRadius: radius.lg, padding: space.lg, minHeight: 128, borderWidth: 1 },
  tileIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fav: { width: 158, borderRadius: radius.lg, padding: space.md, justifyContent: 'space-between' },
});
