import { useEffect, useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { FokiMood } from '@/domain/mood';

/**
 * Foki, the FokDay mascot: a two-tier lime gelatin with a flame on top. The flame is the streak, so
 * it's out until today counts. Flat shapes with hard shading and no outlines, big eyes that carry the
 * mood through their lids, and gear earned with the longest streak. Drawn in a 200 × 200 box.
 * It only jiggles, as a gelatin does: slow eased loops, no bounce.
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

const C = {
  base: '#C4F24B',
  shade: '#9BD926',
  deep: '#7CBB14',
  light: '#EEFFB8',
  ink: '#1C2A0E',
  mouth: '#23340F',
  tongue: '#FF7A70',
  water: '#4DB5F5',
  waterLight: '#BFE6FF',
  steel: '#A7AEB8',
  iron: '#4A5059',
  gold: '#FFC83D',
  goldDark: '#E09A00',
  red: '#FF5A4F',
  redDark: '#D93A30',
  blue: '#3E7BFA',
};

const BODY = 'M100 40 C118 40 132 47 134 62 C134 65 134 67 133 69 C153 73 165 87 168 106 C169 114 176 124 178 138 C181 160 168 178 146 178 L54 178 C32 178 19 160 22 138 C24 124 31 114 32 106 C35 87 47 73 67 69 C66 67 66 65 66 62 C68 47 82 40 100 40 Z';
const FLAME = 'M100 2 C103 10 114 15 115 27 C116 37 109 44 100 44 C91 44 84 37 85 28 C86 22 90 19 93 14 C94 18 96 20 98 20 C97 14 98 8 100 2 Z';
const FLAME_CORE = 'M100 19 C102 24 107 27 107 33 C107 39 104 43 100 43 C96 43 93 39 93 34 C93 30 96 28 98 25 C99 27 99.5 28 100 28 C100 25 99.5 22 100 19 Z';

const EYE_L = 77;
const EYE_R = 123;
const EYE_Y = 104;
const EYE_SIZE = 25;

/** Where the pupils look, and how big they are. `same` moves both the same way instead of toward the center. */
const LOOK: Partial<Record<FokiMood, { dx: number; dy: number; r: number; same?: boolean }>> = {
  happy: { dx: 5, dy: 3, r: 15 },
  strong: { dx: 4, dy: 2, r: 13 },
  worried: { dx: 3, dy: 5, r: 12 },
  sad: { dx: 3, dy: 8, r: 13 },
  hungry: { dx: 7, dy: -5, r: 15, same: true },
  thirsty: { dx: 8, dy: 2, r: 14, same: true },
};

/** The upper lid as a straight edge: y at the outer and at the inner side of the eye. */
const LIDS: Partial<Record<FokiMood, { outer: number; inner: number }>> = {
  worried: { outer: 96, inner: 80 },
  sad: { outer: 106, inner: 88 },
  strong: { outer: 84, inner: 100 },
  thirsty: { outer: 97, inner: 97 },
};

function Eyes({ mood, id }: { mood: FokiMood; id: string }) {
  if (mood === 'proud' || mood === 'cheer') {
    return (
      <G stroke={C.ink} strokeWidth={8} strokeLinecap="round" fill="none">
        <Path d="M59 112 Q77 87 95 112" />
        <Path d="M105 112 Q123 87 141 112" />
      </G>
    );
  }
  if (mood === 'sleepy') {
    return (
      <G stroke={C.ink} strokeWidth={8} strokeLinecap="round" fill="none">
        <Path d="M59 104 Q77 122 95 104" />
        <Path d="M105 104 Q123 122 141 104" />
      </G>
    );
  }
  const look = LOOK[mood] ?? LOOK.happy!;
  const lid = LIDS[mood];
  const rightX = EYE_R + (look.same ? look.dx : -look.dx);
  const left = lid ? `M46 70 L108 70 L108 ${lid.inner - 4} L${EYE_L + EYE_SIZE} ${lid.inner} L${EYE_L - EYE_SIZE} ${lid.outer} L46 ${lid.outer} Z` : '';
  const right = lid ? `M154 70 L92 70 L92 ${lid.inner - 4} L${EYE_R - EYE_SIZE} ${lid.inner} L${EYE_R + EYE_SIZE} ${lid.outer} L154 ${lid.outer} Z` : '';
  return (
    <>
      <Defs>
        <ClipPath id={`${id}-eyes`}>
          <Circle cx={EYE_L} cy={EYE_Y} r={EYE_SIZE} />
          <Circle cx={EYE_R} cy={EYE_Y} r={EYE_SIZE} />
        </ClipPath>
      </Defs>
      <Circle cx={EYE_L} cy={EYE_Y} r={EYE_SIZE} fill="#FFFFFF" />
      <Circle cx={EYE_R} cy={EYE_Y} r={EYE_SIZE} fill="#FFFFFF" />
      <Circle cx={EYE_L + look.dx} cy={EYE_Y + look.dy} r={look.r} fill={C.ink} />
      <Circle cx={rightX} cy={EYE_Y + look.dy} r={look.r} fill={C.ink} />
      <Circle cx={EYE_L + look.dx + 6} cy={EYE_Y + look.dy - 7} r={5.5} fill="#FFFFFF" />
      <Circle cx={rightX + 6} cy={EYE_Y + look.dy - 7} r={5.5} fill="#FFFFFF" />
      {lid ? (
        <G clipPath={`url(#${id}-eyes)`}>
          <Path d={left} fill={C.shade} />
          <Path d={right} fill={C.shade} />
        </G>
      ) : null}
    </>
  );
}

const BLINK = (
  <G>
    <Circle cx={EYE_L} cy={EYE_Y} r={EYE_SIZE + 0.5} fill={C.base} />
    <Circle cx={EYE_R} cy={EYE_Y} r={EYE_SIZE + 0.5} fill={C.base} />
    <G stroke={C.ink} strokeWidth={7} strokeLinecap="round" fill="none">
      <Path d="M57 106 Q77 116 97 106" />
      <Path d="M103 106 Q123 116 143 106" />
    </G>
  </G>
);

function Mouth({ mood }: { mood: FokiMood }) {
  const line = { stroke: C.mouth, strokeWidth: 7, strokeLinecap: 'round' as const, fill: 'none' };
  switch (mood) {
    case 'cheer':
      return (
        <G>
          <Path d="M76 134 Q100 144 124 134 Q124 168 100 168 Q76 168 76 134 Z" fill={C.mouth} />
          <Path d="M85 160 Q100 148 115 160 Q109 168 100 168 Q91 168 85 160 Z" fill={C.tongue} />
        </G>
      );
    case 'worried':
      return <Path d="M85 150 Q92 142 100 148 Q108 154 115 146" {...line} />;
    case 'sad':
      return <Path d="M84 156 Q100 138 116 156" {...line} />;
    case 'sleepy':
      return <Ellipse cx={100} cy={148} rx={7} ry={9} fill={C.mouth} />;
    case 'strong':
      return (
        <G>
          <Rect x={80} y={137} width={40} height={20} rx={10} fill={C.mouth} />
          <Rect x={85} y={141} width={30} height={12} rx={4} fill="#FFFFFF" />
          <Path d="M95 141 L95 153 M105 141 L105 153" stroke={C.mouth} strokeWidth={2.5} />
        </G>
      );
    case 'hungry':
      return (
        <G>
          <Path d="M80 136 Q100 146 120 136 Q120 164 100 164 Q80 164 80 136 Z" fill={C.mouth} />
          <Path d="M92 152 Q104 146 114 152 L114 166 Q114 174 104 174 Q94 174 94 166 Z" fill={C.tongue} />
        </G>
      );
    case 'thirsty':
      return (
        <G>
          <Ellipse cx={100} cy={146} rx={13} ry={10} fill={C.mouth} />
          <Path d="M92 150 Q100 146 108 150 L108 164 Q108 171 100 171 Q92 171 92 164 Z" fill={C.tongue} />
        </G>
      );
    default:
      return (
        <G>
          <Path d="M84 137 Q100 144 116 137 Q115 158 100 158 Q85 158 84 137 Z" fill={C.mouth} />
          <Path d="M90 153 Q100 145 110 153 Q106 158 100 158 Q94 158 90 153 Z" fill={C.tongue} />
        </G>
      );
  }
}

function Arms({ mood }: { mood: FokiMood }) {
  if (mood === 'cheer') {
    return (
      <G>
        <Path d="M34 128 C22 116 10 100 12 88 C14 78 26 78 30 88 C32 98 38 106 44 112 Z" fill={C.shade} />
        <Path d="M166 128 C178 116 190 100 188 88 C186 78 174 78 170 88 C168 98 162 106 156 112 Z" fill={C.deep} />
      </G>
    );
  }
  if (mood === 'strong') {
    return (
      <G>
        <Path d="M36 122 C22 104 18 62 22 40 C24 30 36 30 38 40 C38 62 42 92 50 108 Z" fill={C.shade} />
        <Path d="M164 122 C178 104 182 62 178 40 C176 30 164 30 162 40 C162 62 158 92 150 108 Z" fill={C.deep} />
      </G>
    );
  }
  return (
    <G>
      <Path d="M30 124 C20 126 13 136 15 146 C17 153 26 153 31 146 Z" fill={C.shade} />
      <Path d="M170 124 C180 126 187 136 185 146 C183 153 174 153 169 146 Z" fill={C.deep} />
    </G>
  );
}

/** What it holds, in front of the body. */
function Props({ mood }: { mood: FokiMood }) {
  switch (mood) {
    case 'strong':
      return (
        <G>
          <Rect x={8} y={25} width={184} height={8} rx={4} fill={C.steel} />
          <Rect x={2} y={9} width={15} height={40} rx={6} fill={C.iron} />
          <Rect x={183} y={9} width={15} height={40} rx={6} fill={C.iron} />
          <Rect x={18} y={15} width={9} height={28} rx={4} fill={C.iron} />
          <Rect x={173} y={15} width={9} height={28} rx={4} fill={C.iron} />
        </G>
      );
    case 'sad':
      return <Path d="M150 112 C155 120 159 125 159 131 A9 9 0 0 1 141 131 C141 125 145 120 150 112 Z" fill={C.water} />;
    case 'worried':
      return <Path d="M160 74 C164 80 167 84 167 88 A7 7 0 0 1 153 88 C153 84 156 80 160 74 Z" fill={C.water} />;
    case 'hungry':
      return (
        <G stroke={C.steel} strokeWidth={6} strokeLinecap="round" fill="none">
          <Path d="M184 104 L184 170" />
          <Path d="M173 96 L173 114 Q173 124 184 124 Q195 124 195 114 L195 96" />
          <Path d="M184 96 L184 112" />
        </G>
      );
    case 'thirsty':
      return (
        <G>
          <Path d="M178 92 C186 104 194 113 194 124 A16 16 0 0 1 162 124 C162 113 170 104 178 92 Z" fill={C.water} />
          <Path d="M170 124 A8 8 0 0 0 177 132" stroke={C.waterLight} strokeWidth={4} strokeLinecap="round" fill="none" />
        </G>
      );
    case 'sleepy':
      return (
        <G stroke="#8E96A3" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M146 48 L164 48 L146 68 L164 68" />
          <Path d="M172 22 L184 22 L172 36 L184 36" />
        </G>
      );
    default:
      return null;
  }
}

function Gear({ gear }: { gear: FokiGear }) {
  if (gear === 'headband') {
    return (
      <G>
        <Path d="M67 56 Q100 68 133 56 L134 69 Q100 81 66 69 Z" fill={C.red} />
        <Path d="M132 58 L154 48 L148 62 L156 72 L132 69 Z" fill={C.redDark} />
      </G>
    );
  }
  if (gear === 'medal') {
    return (
      <G>
        <Path d="M132 128 L148 150 L164 128 L154 128 L148 138 L142 128 Z" fill={C.blue} />
        <Circle cx={148} cy={156} r={15} fill={C.goldDark} />
        <Circle cx={148} cy={155} r={12} fill={C.gold} />
        <Path d="M148 147 L150.6 152.5 L156.6 153.2 L152.2 157.2 L153.4 163 L148 160 L142.6 163 L143.8 157.2 L139.4 153.2 L145.4 152.5 Z" fill={C.goldDark} />
      </G>
    );
  }
  if (gear === 'crown') {
    return (
      <G>
        <Path d="M68 62 L60 26 L82 42 L100 18 L118 42 L140 26 L132 62 Q100 52 68 62 Z" fill={C.gold} />
        <Path d="M68 62 Q100 52 132 62 L133 54 Q100 44 67 54 Z" fill={C.goldDark} />
        <Circle cx={100} cy={40} r={5} fill={C.red} />
      </G>
    );
  }
  return null;
}

const ease = Easing.inOut(Easing.sin);

export function Foki({ mood = 'happy', size = 96, lit = true, gear = 'none', still = false, style, testID }: {
  mood?: FokiMood;
  size?: number;
  /** The flame on top: out until today counts. */
  lit?: boolean;
  gear?: FokiGear;
  /** No idle motion (lists, exports). */
  still?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const moving = !still && !reduced;
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');

  const jiggle = useSharedValue(0);
  const flicker = useSharedValue(1);
  const blink = useSharedValue(0);

  useEffect(() => {
    if (!moving) return;
    jiggle.set(withRepeat(withTiming(1, { duration: 1300, easing: ease }), -1, true, undefined, ReduceMotion.Never));
    flicker.set(withRepeat(withTiming(1.1, { duration: 480, easing: ease }), -1, true, undefined, ReduceMotion.Never));
    blink.set(withRepeat(withSequence(withDelay(3400, withTiming(1, { duration: 70 })), withDelay(80, withTiming(0, { duration: 70 }))), -1, false, undefined, ReduceMotion.Never));
  }, [moving, jiggle, flicker, blink]);

  // A gelatin squashes as it settles: taller and thinner, then back, from its base.
  const body = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 + jiggle.get() * 0.022 }, { scaleX: 1 - jiggle.get() * 0.016 }] }));
  const flame = useAnimatedStyle(() => ({ transform: [{ scaleY: flicker.get() }] }));
  const open = useAnimatedStyle(() => ({ opacity: 1 - blink.get() }));
  const shut = useAnimatedStyle(() => ({ opacity: blink.get() }));

  const canBlink = mood !== 'proud' && mood !== 'cheer' && mood !== 'sleepy';
  const box = { width: size, height: size, viewBox: '0 0 200 200' } as const;

  return (
    <View testID={testID} accessibilityRole="image" accessibilityLabel="Foki, la mascota de FokDay" style={[{ width: size, height: size }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: '50% 89%' }, body]}>
        {lit ? (
          <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: '50% 22%' }, flame]}>
            <Svg {...box}>
              <Path d={FLAME} fill="#FF8A1F" />
              <Path d={FLAME_CORE} fill="#FFD23F" />
            </Svg>
          </Animated.View>
        ) : null}
        <View style={StyleSheet.absoluteFill}>
          <Svg {...box}>
            <Defs>
              <ClipPath id={`${id}-body`}>
                <Path d={BODY} />
              </ClipPath>
            </Defs>
            <Arms mood={mood} />
            <Path d={BODY} fill={C.shade} />
            <G clipPath={`url(#${id}-body)`}>
              <Path d={BODY} fill={C.base} transform="translate(-10 -9)" />
              <Path d="M67 69 C78 74 122 74 133 69 C122 80 78 80 67 69 Z" fill={C.shade} />
              <G fill={C.shade} opacity={0.5}>
                <Path d="M46 178 C40 158 42 138 50 122 C49 140 50 160 58 178 Z" />
                <Path d="M154 178 C160 158 158 138 150 122 C151 140 150 160 142 178 Z" />
              </G>
              <Path d="M36 118 C38 104 44 94 54 87" stroke={C.light} strokeWidth={8} strokeLinecap="round" fill="none" />
              <Circle cx={32} cy={134} r={4.5} fill={C.light} />
              <Path d="M76 54 C80 49 87 47 94 47" stroke={C.light} strokeWidth={6.5} strokeLinecap="round" fill="none" />
              <Circle cx={150} cy={152} r={5.5} fill={C.light} opacity={0.6} />
              <Circle cx={139} cy={165} r={3} fill={C.light} opacity={0.6} />
            </G>
            <Mouth mood={mood} />
            <Gear gear={gear} />
            <Props mood={mood} />
          </Svg>
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, canBlink ? open : null]}>
          <Svg {...box}>
            <Eyes mood={mood} id={id} />
          </Svg>
        </Animated.View>
        {canBlink ? (
          <Animated.View style={[StyleSheet.absoluteFill, shut]}>
            <Svg {...box}>{BLINK}</Svg>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

/** Foki with something to say: the speech bubble used across the app. */
export function FokiSays({ mood, children, size = 72, lit, gear, bubble, style }: {
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
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, style]}>
      <Foki mood={mood} size={size} lit={lit} gear={gear} />
      <View style={{ flex: 1, backgroundColor: bubble, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 }}>
        <View style={{ position: 'absolute', left: -6, top: '50%', marginTop: -7, width: 14, height: 14, backgroundColor: bubble, transform: [{ rotate: '45deg' }], borderRadius: 3 }} />
        {children}
      </View>
    </View>
  );
}
