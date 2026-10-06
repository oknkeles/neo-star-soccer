/**
 * Procedural player portrait (SVG) from Appearance + kit. Owner: ui-shell agent.
 *
 * Drawn on a 160×160 canvas so it scales cleanly from 24 to 160 px. The face (jaw, eyes,
 * brows, nose, iris) is derived from `appearance.height % 6`, so every height value is a
 * stable "face" and the customizer can offer six faces by setting height 174..179.
 */
import { useId, type ReactNode } from 'react';
import type { Appearance, Kit } from '../../core/types';

export interface AvatarProps {
  appearance: Appearance;
  kit?: Kit;
  size?: number;
  mood?: 'happy' | 'neutral' | 'sad' | 'angry';
  ring?: 'accent' | 'gold' | 'none';
  /** Animate eyelids (use on large portraits only). */
  blink?: boolean;
}

export const SKIN_TONES = ['#f6d7c3', '#eac09d', '#d29f78', '#a8714d', '#7d4f33', '#4f3021'];
/** Number of selectable hair / beard / face variants (for customizer thumbnails). */
export const HAIR_STYLES = 8;
export const BEARD_STYLES = 4;
export const FACE_COUNT = 6;
/** Height value that selects face `k` (0..5) in the customizer. */
export const faceHeight = (k: number) => 174 + (((k % FACE_COUNT) + FACE_COUNT) % FACE_COUNT);
export const faceIndex = (a: Pick<Appearance, 'height'>) => ((Math.round(a.height) % FACE_COUNT) + FACE_COUNT) % FACE_COUNT;

// ───────── colour helpers ─────────

function parseHex(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix `c` toward `to` by `amt` (0..1). Non-hex colours are returned unchanged. */
function mix(c: string, to: string, amt: number): string {
  const a = parseHex(c);
  const b = parseHex(to);
  if (!a || !b) return c;
  const m = (i: number) => Math.round(a[i] + (b[i] - a[i]) * amt);
  return `rgb(${m(0)},${m(1)},${m(2)})`;
}
const darker = (c: string, amt: number) => mix(c, '#000000', amt);
const lighter = (c: string, amt: number) => mix(c, '#ffffff', amt);

// ───────── faces ─────────

const FACES = [
  { jaw: 0, eyes: 0, brow: 0, nose: 0, iris: '#4a2f1b' },
  { jaw: 1, eyes: 1, brow: 1, nose: 1, iris: '#2d2a28' },
  { jaw: 2, eyes: 2, brow: 2, nose: 0, iris: '#6b4a1e' },
  { jaw: 0, eyes: 1, brow: 3, nose: 2, iris: '#2f6b8f' },
  { jaw: 2, eyes: 0, brow: 1, nose: 1, iris: '#3d6b45' },
  { jaw: 1, eyes: 2, brow: 0, nose: 2, iris: '#5a5f66' },
] as const;

const JAWS = [
  'M50 66 C50 42 64 34 80 34 C96 34 110 42 110 66 C110 90 98 108 80 108 C62 108 50 90 50 66Z',
  'M47 70 C47 46 62 36 80 36 C98 36 113 46 113 70 C113 92 98 106 80 106 C62 106 47 92 47 70Z',
  'M50 62 C50 42 64 35 80 35 C96 35 110 42 110 62 L109 82 C108 98 98 108 80 108 C62 108 52 98 51 82Z',
];

const SHIRT = 'M12 160 C12 136 40 122 66 120 Q80 134 94 120 C120 122 148 136 148 160Z';

// ───────── hair ─────────

function hairLayers(style: number, c: string): { back: ReactNode; front: ReactNode } {
  const hi = lighter(c, 0.28);
  const lo = darker(c, 0.3);
  const sheen = <path d="M62 44 Q80 33 98 44" stroke={hi} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.4" />;
  switch (((style % 8) + 8) % 8) {
    case 1: // buzz cut
      return { back: null, front: <path d="M50 64 C49 42 63 34 80 34 C97 34 111 42 110 64 C107 55 101 50 94 48 C86 51 74 51 66 48 C59 50 53 55 50 64Z" fill={c} opacity="0.92" /> };
    case 2: // side part
      return {
        back: null,
        front: (
          <g>
            <path d="M48 68 C45 40 62 27 82 28 C102 29 114 42 112 68 C110 56 106 49 98 46 C88 52 66 50 58 56 C53 59 50 63 48 68Z" fill={c} />
            <path d="M70 30 Q78 40 74 49" stroke={lo} strokeWidth="1.6" fill="none" opacity="0.7" />{sheen}
          </g>
        ),
      };
    case 3: // curly / afro
      return {
        back: (
          <g fill={c}>
            <circle cx="80" cy="50" r="38" /><circle cx="56" cy="32" r="14" /><circle cx="80" cy="22" r="16" /><circle cx="104" cy="32" r="14" />
            <circle cx="46" cy="52" r="12" /><circle cx="114" cy="52" r="12" />
          </g>
        ),
        front: (
          <g>
            <path d="M52 60 C54 46 66 40 80 40 C94 40 106 46 108 60 C100 52 92 49 80 49 C68 49 60 52 52 60Z" fill={c} />
            <g fill={lo} opacity="0.45"><circle cx="64" cy="44" r="2.4" /><circle cx="86" cy="42" r="2.4" /><circle cx="98" cy="48" r="2.2" /></g>
          </g>
        ),
      };
    case 4: // mohawk
      return {
        back: null,
        front: (
          <g>
            <path d="M50 64 C49 42 63 34 80 34 C97 34 111 42 110 64 C107 55 101 50 94 48 C86 51 74 51 66 48 C59 50 53 55 50 64Z" fill={c} opacity="0.34" />
            <path d="M71 42 C68 24 73 11 80 9 C87 11 92 24 89 42 C85 37 75 37 71 42Z" fill={c} />
            <path d="M80 12 L80 38" stroke={hi} strokeWidth="1.6" opacity="0.45" />
          </g>
        ),
      };
    case 5: // long hair
      return {
        back: <path d="M45 64 C43 34 62 24 80 24 C98 24 117 34 115 64 L119 118 C112 126 104 122 103 112 L101 74 L59 74 L57 112 C56 122 48 126 41 118Z" fill={c} />,
        front: (
          <g>
            <path d="M48 68 C46 40 64 28 82 29 C102 30 114 42 112 68 C108 54 100 46 88 44 C78 50 60 50 52 60 C50 62 49 65 48 68Z" fill={c} />{sheen}
          </g>
        ),
      };
    case 6: // top-knot bun
      return {
        back: <circle cx="80" cy="22" r="12" fill={c} />,
        front: (
          <g>
            <path d="M49 66 C47 40 63 31 80 31 C97 31 113 40 111 66 C108 54 102 48 94 46 C86 50 72 50 66 46 C58 48 52 54 49 66Z" fill={c} />
            <rect x="72" y="30" width="16" height="4" rx="2" fill={lo} />
          </g>
        ),
      };
    case 7: // quiff
      return {
        back: null,
        front: (
          <g>
            <path d="M47 68 C43 38 60 22 84 20 C106 19 118 36 113 68 C110 54 104 46 92 43 C78 38 64 44 56 54 C52 59 49 64 47 68Z" fill={c} />
            <path d="M60 40 C62 24 82 12 100 21 C109 26 113 33 112 41 C100 30 80 30 60 40Z" fill={c} />
            <path d="M66 32 Q84 20 104 28" stroke={hi} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.4" />
          </g>
        ),
      };
    default:
      return { back: null, front: null };
  }
}

// ───────── beard ─────────

const MOUTH_HOLE_2 = 'M68 98 a12 6.5 0 1 0 24 0 a12 6.5 0 1 0 -24 0Z';
const MOUTH_HOLE_3 = 'M69 98 a11 6 0 1 0 22 0 a11 6 0 1 0 -22 0Z';

function Beard({ style, c, jawId, lip }: { style: number; c: string; jawId: string; lip: string }) {
  if (style === 1) {
    return (
      <g clipPath={`url(#${jawId})`}>
        <path d="M46 80 C60 94 70 91 80 91 C90 91 100 94 114 80 L114 120 L46 120Z" fill={c} opacity="0.3" />
        <path d="M70 88 Q80 85 90 88" stroke={c} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.28" />
      </g>
    );
  }
  if (style === 2) {
    return (
      <g>
        <path fillRule="evenodd" fill={c} d={`M49 74 C50 96 62 111 80 111 C98 111 110 96 111 74 C106 84 98 86 90 86 L70 86 C62 86 54 84 49 74Z ${MOUTH_HOLE_2}`} />
        <path d="M70 88 Q80 84 90 88" stroke={c} strokeWidth="4" strokeLinecap="round" fill="none" />
        <ellipse cx="80" cy="98" rx="7" ry="2.2" fill={lip} opacity="0.5" />
      </g>
    );
  }
  if (style === 3) {
    return (
      <g>
        <path fillRule="evenodd" fill={c} d={`M49 68 C49 96 62 115 80 115 C98 115 111 96 111 68 C107 80 100 82 94 83 C88 80 72 80 66 83 C60 82 53 80 49 68Z ${MOUTH_HOLE_3}`} />
        <path d="M66 86 Q73 80 80 85 Q87 80 94 86 Q88 91 80 89 Q72 91 66 86Z" fill={c} />
        <ellipse cx="80" cy="98" rx="6.5" ry="2" fill={lip} opacity="0.5" />
      </g>
    );
  }
  return null;
}

// ───────── component ─────────

export default function Avatar({ appearance, kit, size = 48, mood = 'neutral', ring = 'none', blink }: AvatarProps) {
  const uid = useId().replace(/:/g, '');
  const skin = SKIN_TONES[appearance.skin] ?? SKIN_TONES[2];
  const skinLo = darker(skin, 0.22);
  const skinHi = lighter(skin, 0.18);
  const lip = mix(skin, '#8a2f3a', 0.45);
  const hair = appearance.hairColor || '#2b1d14';
  const face = FACES[faceIndex(appearance)];
  const primary = kit?.primary ?? '#2a4436';
  const secondary = kit?.secondary ?? '#e9f5ee';
  const style = kit?.style ?? 'plain';
  const hairStyle = appearance.hairStyle ?? 0;
  const { back, front } = hairLayers(hairStyle, hair);
  const beardStyle = ((appearance.beard ?? 0) % 4 + 4) % 4;
  const browColor = darker(hair, hairStyle === 0 ? 0.1 : 0.2);

  const eyeRy = [5.2, 4.2, 6][face.eyes];
  const eyeRx = [6.6, 7, 6.2][face.eyes];
  const browW = [3.6, 2.8, 2.2, 3.2][face.brow];
  const browArch = [0, 3.5, 2.5, 1][face.brow];
  const browIn = mood === 'angry' ? 4.5 : mood === 'sad' ? -4 : mood === 'happy' ? -1.5 : 0;
  const browOut = mood === 'angry' ? -0.5 : mood === 'sad' ? 2.5 : mood === 'happy' ? -2.5 : 0;
  const noseW = [4.4, 5.2, 6][face.nose];
  const ringId = `${uid}r`;
  const jawPath = JAWS[face.jaw];

  const brow = (s: -1 | 1) => {
    const xi = 80 + s * 9;
    const xo = 80 + s * 27;
    const yi = 62.5 + browIn;
    const yo = 60.5 + browOut;
    return <path d={`M${xi} ${yi} Q${80 + s * 18} ${(yi + yo) / 2 - browArch - 1.5} ${xo} ${yo}`} stroke={browColor} strokeWidth={browW} strokeLinecap="round" fill="none" />;
  };

  const eye = (s: -1 | 1) => {
    const cx = 80 + s * 17;
    const lidRy = mood === 'sad' ? 1.3 : mood === 'angry' ? 1.4 : 0;
    return (
      <g key={s}>
        <ellipse cx={cx} cy={73} rx={eyeRx} ry={eyeRy} fill="#f6f3ee" />
        <circle cx={cx + s * -0.6} cy={73.4} r={Math.min(3.9, eyeRy - 0.8)} fill={face.iris} />
        <circle cx={cx + s * -0.6} cy={73.4} r="1.7" fill="#0b0b0b" />
        <circle cx={cx - 0.6 + 1.4} cy={71.9} r="1" fill="#fff" opacity="0.9" />
        <path d={`M${cx - eyeRx} 73 Q${cx} ${73 - eyeRy * 1.55} ${cx + eyeRx} 73`} stroke={skinLo} strokeWidth="1.6" fill="none" />
        {lidRy > 0 && <path d={`M${cx - eyeRx - 1} ${73 - eyeRy} L${cx + eyeRx + 1} ${73 - eyeRy} L${cx + eyeRx + 1} ${73 - eyeRy + lidRy * 2.4} L${cx - eyeRx - 1} ${73 - eyeRy + lidRy * 2.4}Z`} fill={skin} opacity="0.9" />}
        {mood === 'happy' && <path d={`M${cx - eyeRx} 78 Q${cx} ${73 + eyeRy + 1.5} ${cx + eyeRx} 78`} stroke={skinLo} strokeWidth="1.1" fill="none" opacity="0.5" />}
        {blink && (
          <ellipse cx={cx} cy={73} rx={eyeRx + 0.8} ry="0" fill={skin}>
            <animate attributeName="ry" values="0;0;0;0;7;0;0" keyTimes="0;0.55;0.9;0.93;0.95;0.98;1" dur={`${4.2 + face.eyes * 0.6}s`} repeatCount="indefinite" />
          </ellipse>
        )}
      </g>
    );
  };

  const mouth =
    mood === 'happy' ? (
      <g>
        <path d="M67 93 Q80 95 93 93 Q90 106 80 106 Q70 106 67 93Z" fill="#5e1d24" />
        <path d="M69 93.6 Q80 95.2 91 93.6 Q90 97.6 80 97.6 Q70 97.6 69 93.6Z" fill="#f6f2ea" />
        <path d="M66.5 92.5 Q80 96 93.5 92.5" stroke={lip} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </g>
    ) : mood === 'sad' ? (
      <path d="M71 101 Q80 93.5 89 101" stroke={lip} strokeWidth="2.6" strokeLinecap="round" fill="none" />
    ) : mood === 'angry' ? (
      <g>
        <path d="M71 99.5 Q80 96 89 99.5" stroke={lip} strokeWidth="2.8" strokeLinecap="round" fill="none" />
        <path d="M74 101.5 L86 101.5" stroke="#f6f2ea" strokeWidth="2.2" strokeLinecap="round" opacity="0.8" />
      </g>
    ) : (
      <path d="M71 97 Q80 101.5 89 97" stroke={lip} strokeWidth="2.6" strokeLinecap="round" fill="none" />
    );

  return (
    <svg
      width={size} height={size} viewBox="0 0 160 160" role="img" aria-label="avatar"
      className="shrink-0 rounded-full" style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id={`${uid}bg`} cx="50%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#2b4a38" /><stop offset="100%" stopColor="#0a140f" />
        </radialGradient>
        <linearGradient id={`${uid}sh`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.1" /><stop offset="100%" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id={`${uid}face`} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor={skinHi} stopOpacity="0.55" /><stop offset="100%" stopColor={skin} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={ring === 'gold' ? '#ffe28a' : '#d8ff7a'} /><stop offset="100%" stopColor={ring === 'gold' ? '#d99a1d' : '#3cffb0'} />
        </linearGradient>
        <clipPath id={`${uid}c`}><circle cx="80" cy="80" r="80" /></clipPath>
        <clipPath id={`${uid}j`}><path d={jawPath} /></clipPath>
        <clipPath id={`${uid}s`}><path d={SHIRT} /></clipPath>
      </defs>
      <g clipPath={`url(#${uid}c)`}>
        <rect width="160" height="160" fill={`url(#${uid}bg)`} />
        <circle cx="80" cy="56" r="62" fill="#b8ff3c" opacity="0.05" />

        {back}

        {/* shirt */}
        <g>
          <path d={SHIRT} fill={primary} />
          <g clipPath={`url(#${uid}s)`}>
            {style === 'stripes' && [22, 48, 74, 100, 126].map((x) => <rect key={x} x={x} y="116" width="13" height="50" fill={secondary} opacity="0.9" />)}
            {style === 'hoops' && [132, 148].map((y) => <rect key={y} x="0" y={y} width="160" height="8" fill={secondary} opacity="0.9" />)}
            {style === 'halves' && <rect x="80" y="110" width="80" height="60" fill={secondary} />}
            {style === 'sash' && <path d="M26 118 L62 118 L134 168 L96 168Z" fill={secondary} opacity="0.92" />}
            {style === 'plain' && <rect x="0" y="152" width="160" height="10" fill={secondary} opacity="0.85" />}
            <rect x="0" y="110" width="160" height="60" fill={`url(#${uid}sh)`} />
          </g>
          <path d="M12 160 C12 136 40 122 66 120" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" fill="none" />
        </g>

        {/* neck */}
        <path d="M67 98 L67 124 Q80 134 93 124 L93 98Z" fill={skinLo} />
        <path d="M60 120 Q80 142 100 120 L104 124 Q80 150 56 124Z" fill={secondary} stroke={darker(secondary, 0.25)} strokeWidth="0.8" />
        <path d="M70 118 Q80 130 90 118 L88 112 L72 112Z" fill={skinLo} />
        <ellipse cx="80" cy="110" rx="22" ry="5" fill="#000" opacity="0.18" />

        {/* ears + head */}
        <ellipse cx="49.5" cy="75" rx="5" ry="8.2" fill={skin} /><ellipse cx="49.8" cy="75.5" rx="2.4" ry="4.6" fill={skinLo} opacity="0.55" />
        <ellipse cx="110.5" cy="75" rx="5" ry="8.2" fill={skin} /><ellipse cx="110.2" cy="75.5" rx="2.4" ry="4.6" fill={skinLo} opacity="0.55" />
        <path d={jawPath} fill={skin} />
        <path d={jawPath} fill={`url(#${uid}face)`} />
        <path d={jawPath} fill="none" stroke={skinLo} strokeWidth="1" opacity="0.35" />

        {mood === 'happy' && <g fill="#e0605a" opacity="0.16"><circle cx="62" cy="86" r="6" /><circle cx="98" cy="86" r="6" /></g>}

        {/* features */}
        {brow(-1)}{brow(1)}
        {eye(-1)}{eye(1)}
        <path d={`M80 74 L${79 - noseW * 0.1} 84`} stroke={skinHi} strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
        <path d={`M${80 - noseW} 86 Q80 ${89 + noseW * 0.25} ${80 + noseW} 86`} stroke={skinLo} strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.8" />

        {beardStyle < 2 && mouth}
        <Beard style={beardStyle} c={hair} jawId={`${uid}j`} lip={lip} />
        {beardStyle >= 2 && mouth}

        {front}
      </g>
      {ring !== 'none' && <circle cx="80" cy="80" r="76.5" fill="none" stroke={`url(#${ringId})`} strokeWidth={size < 56 ? 7 : 5} />}
    </svg>
  );
}
