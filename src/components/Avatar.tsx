import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useColors } from '@/theme/ThemeProvider';
import { PressableScale, T } from './ui/primitives';

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

/** Profile picture (or initials), with a pencil badge when it can be changed. */
export function Avatar({ uri, name, size = 72, onPress }: { uri: string | null; name: string; size?: number; onPress?: () => void }) {
  const c = useColors();
  const [broken, setBroken] = useState(false);
  const r = size * 0.3;
  const face =
    uri && !broken ? (
      <Image source={{ uri }} onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: r }} />
    ) : (
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <T variant="title" tone="accent" style={{ fontSize: size * 0.36, lineHeight: size * 0.44 }}>{initials(name)}</T>
      </View>
    );
  if (!onPress) return face;
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel="Cambiar foto de perfil" style={{ width: size, height: size }}>
      {face}
      <View style={[styles.badge, { backgroundColor: c.accent, borderColor: c.surface }]}>
        <Feather name="edit-2" size={13} color={c.accentText} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', right: -4, bottom: -4, width: 28, height: 28, borderRadius: 10, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
});
