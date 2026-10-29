import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInRight, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setMeta } from '@/backup/snapshot';
import { Button, Row, T } from '@/components/ui/primitives';
import { goBack } from '@/lib/nav';
import { useDb } from '@/state/db';
import { haptic } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const TOUR_META = 'tour_state';

const STEPS: { icon: IconName; title: string; text: string; tip: string }[] = [
  {
    icon: 'home-variant',
    title: 'Tu día de un vistazo',
    text: 'En Inicio ves las calorías y la proteína de hoy, tu peso, el agua y tus tareas. Todo lo importante, arriba de todo.',
    tip: 'Tocá los anillos para ver tus comidas del día.',
  },
  {
    icon: 'camera',
    title: 'Calorías con una foto',
    text: 'Sacale una foto al plato y la IA estima calorías, proteína y macros. Antes de guardar podés corregir cualquier número.',
    tip: 'Que se vea todo el plato, y si podés un cubierto al lado.',
  },
  {
    icon: 'fire',
    title: 'Tu racha',
    text: 'Cada día que registrás algo (una comida, tu peso o un entreno) suma a tu racha. Arriba a la derecha ves cuántos días llevás.',
    tip: 'Si se te pasa, te avisamos a la noche antes de que se corte.',
  },
  {
    icon: 'dumbbell',
    title: 'Entrenar',
    text: 'Tu rutina del día aparece primero, con sus ejercicios. Tocá Empezar, anotá kilos y repeticiones, y deslizá para terminar.',
    tip: '¿Fuiste y no anotaste nada? Tocá “Ya fui” y cuenta igual.',
  },
  {
    icon: 'chart-line-variant',
    title: 'Mirá cómo avanzás',
    text: 'En Progreso tenés tu peso, tus calorías y proteína contra la meta, y un calendario con todo lo que hiciste cada día.',
    tip: 'Tocá un día del calendario para ver el detalle.',
  },
  {
    icon: 'cog-outline',
    title: 'A tu medida',
    text: 'En Ajustes cambiás tus objetivos, tus días de gym, qué querés seguir (agua, creatina, macros) y tu cuenta.',
    tip: 'Este tour lo podés volver a ver desde Ajustes.',
  },
];

/** A short, skippable tour of the app: one idea per step. */
export default function TourScreen() {
  const c = useColors();
  const db = useDb();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const close = () => {
    void setMeta(db, TOUR_META, 'done');
    goBack();
  };

  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }]}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.xl }}>
        <T variant="label" tone="dim">{i + 1} de {STEPS.length}</T>
        <Button label="Saltar" variant="ghost" size="sm" onPress={close} />
      </Row>

      <Animated.View key={i} entering={FadeInRight.duration(260)} style={styles.body}>
        <Animated.View entering={ZoomIn.springify().damping(13)} style={[styles.icon, { backgroundColor: c.accentSoft }]}>
          <MaterialCommunityIcons name={step.icon} size={64} color={step.icon === 'fire' ? c.streak : c.accent} />
        </Animated.View>
        <T variant="display" style={{ textAlign: 'center' }}>{step.title}</T>
        <T variant="body" tone="muted" style={{ textAlign: 'center', maxWidth: 340 }}>{step.text}</T>
        <View style={[styles.tip, { backgroundColor: c.surface, borderColor: c.border }]}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={c.accent} />
          <T variant="label" style={{ flex: 1 }}>{step.tip}</T>
        </View>
      </Animated.View>

      <View style={{ paddingHorizontal: space.xl, gap: space.lg }}>
        <Row style={{ justifyContent: 'center' }} gap={6}>
          {STEPS.map((_, k) => (
            <View key={k} style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? c.accent : c.track }} />
          ))}
        </Row>
        <Row gap={space.sm}>
          {i > 0 ? <Button label="Atrás" variant="secondary" size="lg" style={{ flex: 1 }} onPress={() => setI(i - 1)} /> : null}
          <Button
            label={last ? '¡Listo!' : 'Siguiente'}
            icon={last ? 'check' : 'arrow-right'}
            size="lg"
            style={{ flex: 2 }}
            onPress={() => {
              haptic('light');
              if (last) close();
              else setI(i + 1);
            }}
          />
        </Row>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingHorizontal: space.xl },
  icon: { width: 140, height: 140, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  tip: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.lg, borderWidth: 1, padding: space.md, alignSelf: 'stretch' },
});
