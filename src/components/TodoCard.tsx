import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MOTION } from '@/components/ui/motion';
import { Card, IconButton, PressableScale, Row, T } from '@/components/ui/primitives';
import { addTodo, bringPending, deleteTodo, listTodos, pendingFromYesterday, setTodoDone, type Todo } from '@/data/todos';
import { useMutation, useQuery } from '@/state/db';
import { haptic } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';

/** "Para hoy": one list for the day. Type, tap to check, done. */
export function TodoCard({ date }: { date: string }) {
  const c = useColors();
  const run = useMutation();
  const [text, setText] = useState('');
  const { data } = useQuery(async (db) => ({ todos: await listTodos(db, date), pending: (await pendingFromYesterday(db, date)).length }), [date]);
  const todos = data?.todos ?? [];
  const done = todos.filter((t) => t.done).length;
  const allDone = todos.length > 0 && done === todos.length;

  const add = async () => {
    if (!text.trim()) return;
    const value = text;
    setText('');
    await run((db) => addTodo(db, date, value), { silent: true });
  };

  return (
    <Card style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="overline" tone="dim">Para hoy</T>
        {todos.length ? <T variant="label" tone={allDone ? 'accent' : 'muted'}>{done}/{todos.length}</T> : null}
      </Row>

      {allDone ? (
        <Animated.View entering={FadeIn.duration(350)} style={[styles.celebrate, { backgroundColor: c.accentSoft }]}>
          <Feather name="award" size={18} color={c.accent} />
          <T variant="bodyMedium" tone="accent">¡Todo listo por hoy!</T>
        </Animated.View>
      ) : null}

      <View>
        {todos.map((t) => (
          <Animated.View key={t.id} entering={FadeInDown.duration(220)} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(200)}>
            <TodoRow todo={t} onToggle={() => run((db) => setTodoDone(db, t.id, !t.done), { silent: true })} onDelete={() => run((db) => deleteTodo(db, t.id), { silent: true })} />
          </Animated.View>
        ))}
      </View>

      <View style={[styles.input, { backgroundColor: c.surfaceAlt }]}>
        <Feather name="plus" size={18} color={c.accent} />
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={add}
          placeholder="Agregar una tarea"
          placeholderTextColor={c.textDim}
          returnKeyType="done"
          blurOnSubmit={false}
          style={[styles.textInput, { color: c.text }]}
          maxFontSizeMultiplier={1.3}
        />
        {text.trim() ? <IconButton icon="arrow-up" label="Agregar" size={32} tone="accent" onPress={add} /> : null}
      </View>

      {data?.pending ? (
        <PressableScale
          onPress={() => run((db) => bringPending(db, date), { success: 'Pendientes de ayer agregados' })}
          style={[styles.bring, { borderColor: c.border }]}
          accessibilityRole="button"
        >
          <Feather name="corner-down-right" size={16} color={c.textMuted} />
          <T variant="label" tone="muted">Traer {data.pending} {data.pending === 1 ? 'pendiente' : 'pendientes'} de ayer</T>
        </PressableScale>
      ) : null}
    </Card>
  );
}

function TodoRow({ todo, onToggle, onDelete }: { todo: Todo; onToggle: () => void; onDelete: () => void }) {
  const c = useColors();
  const progress = useSharedValue(todo.done ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(todo.done ? 1 : 0, MOTION.enter);
  }, [todo.done, progress]);
  const circle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const check = useAnimatedStyle(() => ({ transform: [{ scale: 0.5 + progress.value * 0.5 }], opacity: progress.value }));
  const label = useAnimatedStyle(() => ({ opacity: 1 - progress.value * 0.5 }));

  return (
    <Row gap={space.md} style={styles.row}>
      <PressableScale
        onPress={() => {
          haptic(todo.done ? 'light' : 'success');
          onToggle();
        }}
        scaleTo={0.85}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: todo.done }}
        accessibilityLabel={todo.text}
        style={[styles.check, { borderColor: todo.done ? c.accent : c.border }]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.accent, borderRadius: 13 }, circle]} />
        <Animated.View style={check}>
          <Feather name="check" size={15} color={c.accentText} />
        </Animated.View>
      </PressableScale>
      <PressableScale onPress={onToggle} style={{ flex: 1 }} scaleTo={0.99}>
        <Animated.Text style={[styles.text, { color: c.text, textDecorationLine: todo.done ? 'line-through' : 'none' }, label]} maxFontSizeMultiplier={1.3}>
          {todo.text}
        </Animated.Text>
      </PressableScale>
      <IconButton icon="x" label={`Borrar ${todo.text}`} size={28} filled={false} onPress={onDelete} />
    </Row>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 6 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  text: { fontFamily: font.medium, fontSize: 15 },
  input: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, paddingLeft: space.md, paddingRight: 6, minHeight: 46 },
  textInput: { flex: 1, height: 46, fontFamily: font.medium, fontSize: 15 },
  celebrate: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md },
  bring: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed' },
});
