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
import { MEAL_CATEGORIES, sumDailyTotals } from '@/domain/nutrition';
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
          <Card style={{ padding: space.xl }}>
            <NutritionBars calories={data.totals.calories} protein={data.totals.protein} calorieTarget={data.goal.calories} proteinTarget={data.goal.protein} />
          </Card>

          <View style={styles.grid}>
            {MEAL_CATEGORIES.filter((cat) => cat.key !== 'extra').map((cat, i) => {
              const bucket = data.totals.byCategory[cat.key];
              return (
                <Animated.View key={cat.key} entering={FadeInDown.delay(40 * i).duration(320)} style={styles.tileWrap}>
                  <PressableScale
                    onPress={() => router.push({ pathname: '/comida/categoria/[category]', params: { category: cat.key, date } })}
                    style={[styles.tile, { backgroundColor: c.surface }]}
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

          <Row style={{ marginTop: space.md, gap: space.md }}>
            <Button
              label="Snack o extra"
              icon="plus"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/comida/categoria/[category]', params: { category: 'extra', date } })}
            />
            <Button
              label="Otra comida"
              icon="edit-3"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/comida/manual', params: { date } })}
            />
          </Row>

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
                        onPress={() => run((db) => logMeal(db, { date, category: m.category, meal: m }), { success: `${m.name} registrado` })}
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
  tile: { borderRadius: radius.lg, padding: space.lg, minHeight: 128 },
  tileIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fav: { width: 158, borderRadius: radius.lg, padding: space.md, justifyContent: 'space-between' },
});
