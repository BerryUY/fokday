/**
 * The FokDay mark: two chevrons pointing up (green on top, glass grey below) over a dark diamond,
 * redrawn as vectors from the original artwork. One source for the in-app logo, the launch
 * animation and the generated icons (scripts/generate-icons.mjs). No imports, so Node can run it.
 */

export const MARK_SIZE = { width: 120, height: 152 } as const;

type Pt = [number, number];

/** An upward chevron: apex at (cx, apexY), sides `half` wide, `thick` tall. */
function chevron(cx: number, apexY: number, half: number, thick: number, slope = 0.7): Pt[] {
  const side = apexY + half * slope;
  return [
    [cx - half, side],
    [cx, apexY],
    [cx + half, side],
    [cx + half, side + thick],
    [cx, apexY + thick],
    [cx - half, side + thick],
  ];
}

const toPoints = (pts: Pt[]) => pts.map(([x, y]) => `${x},${y}`).join(' ');

export const MARK = {
  top: toPoints(chevron(60, 10, 40, 27)),
  middle: toPoints(chevron(60, 46, 48, 26)),
  diamond: toPoints([[60, 80], [106, 113], [60, 146], [14, 113]]),
  inner: toPoints([[60, 90], [90, 111], [60, 132], [30, 111]]),
  colors: {
    topFrom: '#5CFF9D',
    topTo: '#16D163',
    glow: '#2CF07A',
    midFrom: '#C3C7CD',
    midTo: '#6A6E76',
    diamond: '#3A3D43',
    inner: '#8C9097',
  },
} as const;

/** The mark as an SVG document (for icons): optional background, or a single flat color. */
export function markSvg(opts: { size: number; scale?: number; background?: string | null; mono?: string; radius?: number }): string {
  const { size, scale = 0.8, background = null, mono, radius = 0 } = opts;
  const k = (size * scale) / MARK_SIZE.height;
  const tx = (size - MARK_SIZE.width * k) / 2;
  const ty = (size - MARK_SIZE.height * k) / 2;
  const c = MARK.colors;
  const join = 'stroke-linejoin="round" stroke-width="5"';
  const piece = (points: string, fill: string, extra = '') => `<polygon points="${points}" fill="${fill}" stroke="${fill}" ${join} ${extra}/>`;
  const art = mono
    ? [piece(MARK.diamond, mono, 'opacity="0.55"'), piece(MARK.middle, mono, 'opacity="0.8"'), piece(MARK.top, mono)].join('')
    : [
        `<ellipse cx="60" cy="46" rx="58" ry="44" fill="url(#glow)"/>`,
        piece(MARK.diamond, c.diamond),
        piece(MARK.inner, c.inner, 'opacity="0.45"'),
        piece(MARK.middle, 'url(#mid)'),
        piece(MARK.top, 'url(#top)'),
      ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs>
<linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.topFrom}"/><stop offset="1" stop-color="${c.topTo}"/></linearGradient>
<linearGradient id="mid" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.midFrom}"/><stop offset="1" stop-color="${c.midTo}"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${c.glow}" stop-opacity="0.45"/><stop offset="1" stop-color="${c.glow}" stop-opacity="0"/></radialGradient>
</defs>
${background ? `<rect width="${size}" height="${size}" rx="${radius * size}" fill="${background}"/>` : ''}
<g transform="translate(${tx} ${ty}) scale(${k})">${art}</g>
</svg>`;
}
