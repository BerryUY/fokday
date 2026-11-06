import { useEffect, useState, type ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { FokiMood } from '@/domain/mood';
import { useColors } from '@/theme/ThemeProvider';

/**
 * Foki, the FokDay mascot: a tiny creature made of characters, like a companion living in a terminal,
 * with a flame on its head. The flame is the streak, so it goes out when today doesn't count yet. It
 * changes face with the mood and collects gear as the longest streak grows.
 *
 * Six rows of 17 columns in a bundled monospace font, so it lines up the same on every phone.
 * Inside a row, «…» is drawn in the flame color and ‹…› in the color of whatever it's holding.
 */

export type { FokiMood };
export type FokiGear = 'none' | 'headband' | 'medal' | 'crown';

/** Gear earned with the longest streak ever reached. */
export const FOKI_GEAR: { gear: Exclude<FokiGear, 'none'>; days: number; label: string }[] = [
  { gear: 'headband', days: 7, label: 'Vincha' },
  { gear: 'medal', days: 30, label: 'Medalla' },
  { gear: 'crown', days: 100, label: 'Corona' },
];

export function gearFor(longestStreak: number): FokiGear {
  return [...FOKI_GEAR].reverse().find((g) => longestStreak >= g.days)?.gear ?? 'none';
}

type Face = { eyes: string; mouth: string };

const FACES: Record<FokiMood, Face> = {
  happy: { eyes: 'o o', mouth: 'u' },
  proud: { eyes: '^ ^', mouth: 'w' },
  cheer: { eyes: '^ ^', mouth: 'D' },
  worried: { eyes: 'O O', mouth: '~' },
  sad: { eyes: 'T T', mouth: 'n' },
  sleepy: { eyes: '- -', mouth: 'o' },
  strong: { eyes: '> <', mouth: 'w' },
  hungry: { eyes: 'O O', mouth: 'Q' },
  thirsty: { eyes: 'o o', mouth: 'o' },
};

/** The loop it idles through: 0 and 1 and 2 are small changes, 3 is a blink. */
const IDLE = [0, 0, 1, 0, 3, 0, 2, 0, 1, 0, 0, 3, 3, 0, 2, 0];

const WIDTH = 17;
const visible = (row: string) => row.replace(/[«»‹›]/g, '');
/** Adds a held item at a fixed column, whatever the row already has. */
const side = (row: string, column: number, prop: string) => row + ' '.repeat(Math.max(0, column - visible(row).length)) + `‹${prop}›`;

function rows(mood: FokiMood, frame: number, lit: boolean, gear: FokiGear): string[] {
  const face = FACES[mood];
  const blink = frame === 3 && !['proud', 'cheer', 'sleepy'].includes(mood);
  const eyes = blink ? '- -' : face.eyes;
  const band = gear === 'headband' ? '‹=›' : '-';
  const tip = lit ? `«${frame === 1 ? '(' : ')'}»` : frame === 1 ? '‹~›' : ' ';
  const seat = lit ? `«${frame === 1 ? ')' : '('}»` : '-';

  // The body is centered on column 8.
  let hat = '';
  let top = `        ${tip}`;
  let head = `      .${band}${seat}${band}.`;
  let eyeRow = `     ( ${eyes} )`;
  let mouthRow = `     (  ${face.mouth}  )`;
  let feet = frame === 2 ? `      "'-'"` : `      '"-"'`;

  if (gear === 'crown') hat = '      ‹\\/\\/\\/›';
  if (gear === 'medal') feet = frame === 2 ? '      "‹(*)›"' : "      '‹(*)›'";

  if (mood === 'cheer') eyeRow = frame === 1 ? `    _( ${eyes} )_` : `    \\( ${eyes} )/`;
  if (mood === 'strong') {
    hat = '    ‹o-=====-o›';
    eyeRow = `    |( ${eyes} )|`;
    mouthRow = `    '(  ${face.mouth}  )'`;
  }
  if (mood === 'worried') head = side(head, 13, "'");
  if (mood === 'sad') mouthRow = side(mouthRow, 13, ',');
  if (mood === 'sleepy') {
    hat = side(hat, frame === 1 ? 13 : 14, 'Z');
    top = side(top, 12, 'z');
  }
  if (mood === 'hungry') {
    head = side(head, 14, 'Y');
    eyeRow = side(eyeRow, 14, '|');
    mouthRow = side(mouthRow, 14, '|');
  }
  if (mood === 'thirsty') {
    head = side(head, 14, '^');
    eyeRow = side(eyeRow, 13, '( )');
    mouthRow = side(mouthRow, 14, "'");
  }
  return [hat, top, head, eyeRow, mouthRow, feet].map((row) => row + ' '.repeat(Math.max(0, WIDTH - visible(row).length)));
}

function parts(row: string): { text: string; kind: 'body' | 'flame' | 'prop' }[] {
  return row
    .split(/(«[^»]*»|‹[^›]*›)/)
    .filter(Boolean)
    .map((p) => (p[0] === '«' ? { text: p.slice(1, -1), kind: 'flame' as const } : p[0] === '‹' ? { text: p.slice(1, -1), kind: 'prop' as const } : { text: p, kind: 'body' as const }));
}

export function Foki({ mood = 'happy', size = 96, lit = true, gear = 'none', still = false, color, style, testID }: {
  mood?: FokiMood;
  /** About the width it takes, in points. */
  size?: number;
  /** The flame on its head: out while today doesn't count yet. */
  lit?: boolean;
  gear?: FokiGear;
  /** No idle motion (lists, exports). */
  still?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const c = useColors();
  const reduced = useReducedMotion();
  const moving = !still && !reduced;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!moving) return;
    const t = setInterval(() => setStep((s) => (s + 1) % IDLE.length), 420);
    return () => clearInterval(t);
  }, [moving]);

  const fontSize = size / 7.4;
  const lineHeight = fontSize * 1.08;
  const tint = { body: color ?? c.accent, flame: c.streak, prop: gear === 'none' && mood !== 'thirsty' && mood !== 'sad' ? c.textMuted : mood === 'thirsty' || mood === 'sad' ? c.protein : c.weight };

  return (
    <View testID={testID} accessibilityRole="image" accessibilityLabel="Foki, la mascota de FokDay" style={[{ width: size * 1.4, alignItems: 'center' }, style]}>
      {rows(mood, moving ? IDLE[step] : 0, lit, gear).map((row, i) => (
        <Text key={i} allowFontScaling={false} style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize, lineHeight, color: tint.body, includeFontPadding: false }}>
          {parts(row).map((p, j) => (
            <Text key={j} allowFontScaling={false} style={{ color: tint[p.kind] }}>{p.text}</Text>
          ))}
        </Text>
      ))}
    </View>
  );
}

/** Foki with something to say: the speech bubble used across the app. */
export function FokiSays({ mood, children, size = 64, lit, gear, bubble, style }: {
  mood?: FokiMood;
  children: ReactNode;
  size?: number;
  lit?: boolean;
  gear?: FokiGear;
  /** Bubble background. */
  bubble: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>
      <Foki mood={mood} size={size} lit={lit} gear={gear} />
      <View style={{ flex: 1, backgroundColor: bubble, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 }}>
        <View style={{ position: 'absolute', left: -6, top: '50%', marginTop: -7, width: 14, height: 14, backgroundColor: bubble, transform: [{ rotate: '45deg' }], borderRadius: 3 }} />
        {children}
      </View>
    </View>
  );
}
