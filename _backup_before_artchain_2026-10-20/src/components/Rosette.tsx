import { useMemo } from 'react';

/**
 * Guilloche rosette — the engraved line pattern printed on banknotes and
 * certificates because it is hard to reproduce. Used as the brand mark, the
 * "recorded on chain" seal and the hero of the sign-in screen.
 *
 * Each band is a set of phase-shifted circles whose radius is modulated by a
 * sine wave; overlapping them produces the woven look.
 */

type Band = { base: number; amp: number; freq: number; lines: number; twist?: number };

const DETAIL: Record<'mark' | 'seal' | 'hero', { bands: Band[]; steps: number }> = {
  mark: {
    steps: 180,
    bands: [
      { base: 78, amp: 14, freq: 8, lines: 5 },
      { base: 40, amp: 16, freq: 6, lines: 4 },
    ],
  },
  seal: {
    steps: 260,
    bands: [
      { base: 84, amp: 8, freq: 18, lines: 6 },
      { base: 58, amp: 14, freq: 10, lines: 7, twist: 2 },
      { base: 28, amp: 10, freq: 6, lines: 5 },
    ],
  },
  hero: {
    steps: 720,
    bands: [
      { base: 90, amp: 6, freq: 36, lines: 10 },
      { base: 72, amp: 10, freq: 24, lines: 12, twist: 3 },
      { base: 50, amp: 16, freq: 14, lines: 16, twist: 2 },
      { base: 24, amp: 12, freq: 9, lines: 10 },
    ],
  },
};

const cache = new Map<string, string[]>();

function buildPaths(detail: keyof typeof DETAIL): string[] {
  const hit = cache.get(detail);
  if (hit) return hit;

  const { bands, steps } = DETAIL[detail];
  const paths: string[] = [];

  for (const band of bands) {
    for (let k = 0; k < band.lines; k++) {
      const phase = (k / band.lines) * ((2 * Math.PI) / band.freq);
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * 2 * Math.PI;
        const r =
          band.base +
          band.amp * Math.sin(band.freq * t + phase * band.freq) +
          (band.twist ? band.twist * Math.sin((band.freq / 2) * t - phase * 3) : 0);
        const x = r * Math.cos(t);
        const y = r * Math.sin(t);
        d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
      }
      paths.push(d + 'Z');
    }
  }

  cache.set(detail, paths);
  return paths;
}

interface RosetteProps {
  size?: number | string;
  detail?: keyof typeof DETAIL;
  color?: string;
  strokeWidth?: number;
  /** Draw the lines in on mount. Used once, on the sign-in screen. */
  animate?: boolean;
  className?: string;
  title?: string;
}

export default function Rosette({
  size = 32,
  detail = 'mark',
  color = 'currentColor',
  strokeWidth,
  animate = false,
  className = '',
  title,
}: RosetteProps) {
  const paths = useMemo(() => buildPaths(detail), [detail]);
  const width = strokeWidth ?? (detail === 'hero' ? 0.35 : detail === 'seal' ? 0.9 : 2.4);

  return (
    <svg
      viewBox="-100 -100 200 200"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <g fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round">
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            pathLength={1}
            style={
              animate
                ? {
                    strokeDasharray: 1,
                    strokeDashoffset: 1,
                    animation: `draw 2.4s cubic-bezier(.45,.05,.25,1) ${(i % 16) * 70}ms forwards`,
                  }
                : undefined
            }
          />
        ))}
      </g>
    </svg>
  );
}
