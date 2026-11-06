import { useEffect, useState, type ReactNode } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type SkeletonVariant = 'cards' | 'list' | 'home' | 'train' | 'detail' | 'session';

/** Local data arrives in milliseconds: only what takes longer than this gets a skeleton, so nothing flashes. */
const SHOW_AFTER_MS = 120;

function Bone({ w = '100%', h = 14, r = 7, style }: { w?: DimensionValue; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: c.surfaceAlt }, style]} />;
}

function Block({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ backgroundColor: c.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md }, style]}>{children}</View>;
}

const Line = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>{children}</View>;

function ListRows({ rows = 5 }: { rows?: number }) {
  return (
    <Block style={{ gap: space.lg }}>
      {Array.from({ length: rows }, (_, i) => (
        <Line key={i}>
          <Bone w={34} h={34} r={12} />
          <View style={{ flex: 1, gap: 7 }}>
            <Bone w={i % 2 ? '52%' : '68%'} />
            <Bone w={i % 2 ? '74%' : '42%'} h={10} r={5} />
          </View>
        </Line>
      ))}
    </Block>
  );
}

function Cards() {
  return (
    <View style={{ gap: space.md }}>
      {['72%', '58%', '66%'].map((w) => (
        <Block key={w}>
          <Bone w={w} h={18} r={9} />
          <Bone w="90%" h={11} r={5} />
          <Bone w="48%" h={11} r={5} />
        </Block>
      ))}
    </View>
  );
}

function Home() {
  return (
    <View style={{ gap: space.lg }}>
      <Line>
        <Bone w={30} h={30} r={10} />
        <View style={{ flex: 1 }}><Bone w={84} h={20} r={10} /></View>
        <Bone w={60} h={40} r={20} />
        <Bone w={40} h={40} r={20} />
      </Line>
      <View style={{ gap: 8 }}>
        <Bone w="42%" h={12} r={6} />
        <Bone w="66%" h={26} r={10} />
      </View>
      <Block>
        <Line>
          <Bone w={84} h={84} r={30} />
          <Bone h={62} r={18} style={{ flex: 1 }} />
        </Line>
        {['62%', '54%', '70%'].map((w) => (
          <Line key={w}>
            <Bone w={22} h={22} r={11} />
            <Bone w={w} />
          </Line>
        ))}
      </Block>
      <Block style={{ gap: space.lg }}>
        <Bone w="46%" h={18} r={9} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          <Bone w={124} h={124} r={62} />
          <Bone w={124} h={124} r={62} />
        </View>
      </Block>
    </View>
  );
}

function Train() {
  return (
    <View style={{ gap: space.lg }}>
      <Line>
        <View style={{ flex: 1 }}><Bone w="48%" h={34} r={12} /></View>
        <Bone w={40} h={40} r={20} />
      </Line>
      <Bone h={36} r={18} />
      <Block style={{ padding: space.xl }}>
        <Bone w="30%" h={11} r={5} />
        <Bone w="62%" h={32} r={12} />
        <Bone w="74%" h={12} r={6} />
        <Bone h={54} r={27} style={{ marginTop: space.sm }} />
      </Block>
      <Block>
        <Bone w="40%" h={16} r={8} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {Array.from({ length: 7 }, (_, i) => <Bone key={i} w={36} h={36} r={18} />)}
        </View>
      </Block>
    </View>
  );
}

function Detail() {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xl }}>
        <Bone w={132} h={132} r={66} />
        <Bone w={96} h={40} r={14} />
        <Bone w="58%" />
      </View>
      <Block>
        <Bone w="36%" h={11} r={5} />
        <Bone h={120} r={14} />
      </Block>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Block style={{ flex: 1 }}><Bone w="60%" h={11} r={5} /><Bone w="44%" h={22} r={8} /></Block>
        <Block style={{ flex: 1 }}><Bone w="60%" h={11} r={5} /><Bone w="44%" h={22} r={8} /></Block>
      </View>
    </View>
  );
}

function Session() {
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: 5 }, (_, i) => <Bone key={i} h={5} r={3} style={{ flex: 1, width: undefined }} />)}
      </View>
      <View style={{ gap: 8 }}>
        <Bone w="32%" h={11} r={5} />
        <Bone w="70%" h={34} r={12} />
        <Bone w="52%" h={12} r={6} />
      </View>
      <Line>
        {[44, 44, 44, 44].map((w, i) => <Bone key={i} w={w} h={40} r={20} />)}
      </Line>
      <Block style={{ padding: space.xl, gap: space.xl }}>
        <Bone w="30%" h={18} r={9} />
        {[0, 1].map((i) => (
          <Line key={i}>
            <Bone w={60} h={60} r={30} />
            <View style={{ flex: 1, alignItems: 'center' }}><Bone w={84} h={44} r={12} /></View>
            <Bone w={60} h={60} r={30} />
          </Line>
        ))}
      </Block>
    </View>
  );
}

const LAYOUTS: Record<SkeletonVariant, () => ReactNode> = {
  cards: () => <Cards />,
  list: () => <ListRows />,
  home: () => <Home />,
  train: () => <Train />,
  detail: () => <Detail />,
  session: () => <Session />,
};

/** The shape of what's coming, only while it's really loading. One pulse for the whole block: cheap on old phones. */
export function Skeleton({ variant = 'cards', immediate = false }: { variant?: SkeletonVariant; immediate?: boolean }) {
  const [shown, setShown] = useState(immediate);
  const pulse = useSharedValue(1);

  useEffect(() => {
    const t = setTimeout(() => setShown(true), SHOW_AFTER_MS);
    pulse.set(withRepeat(withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => clearTimeout(t);
  }, [pulse]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  if (!shown) return null;
  return (
    <Animated.View accessibilityLabel="Cargando" accessibilityRole="progressbar" style={style}>
      {LAYOUTS[variant]()}
    </Animated.View>
  );
}
