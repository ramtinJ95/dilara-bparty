import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";

/** A closed, slightly uneven loop around (cx, cy), so circles look drawn by hand. Same seed, same wobble. */
export function wobble(cx: number, cy: number, r: number, seed: number, jitter = 0.06, n = 9): string {
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280) * 2 - 1;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + rand() * 0.12;
    const rr = r * (1 + rand() * jitter);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as const;
  });
  const at = (i: number) => pts[(i + n) % n]!;
  let d = `M${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
}

export const STAR = "M0 -10 L2.6 -3.4 L9.5 -3.1 L4.1 1.3 L5.9 8.1 L0 4.3 L-5.9 8.1 L-4.1 1.3 L-9.5 -3.1 L-2.6 -3.4 Z";

export function Star({ class: cls = "", size = 20 }: { class?: string; size?: number }) {
  return (
    <svg class={`sb-star ${cls}`} width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
      <path d={STAR} fill="#fff" stroke="#1e3a5f" stroke-width="1.6" stroke-linejoin="round" />
    </svg>
  );
}

export function Flake({ class: cls = "", size = 18 }: { class?: string; size?: number }) {
  return (
    <svg class={`sb-flake ${cls}`} width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      {[0, 60, 120].map((a) => (
        <path key={a} transform={`rotate(${a})`} d="M0 -10V10M-2.5 -7.5L0 -5L2.5 -7.5M-2.5 7.5L0 5L2.5 7.5" />
      ))}
    </svg>
  );
}

/** The shared filter that roughens every drawn line. Rendered once per screen. */
export function Defs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <filter id="sb-rough" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" />
        <feDisplacementMap in="SourceGraphic" scale="2.6" />
      </filter>
    </svg>
  );
}

export function Castle({ class: cls = "" }: { class?: string }) {
  const ink = { stroke: "#1e3a5f", "stroke-width": 2.2, "stroke-linejoin": "round", "stroke-linecap": "round" } as const;
  return (
    <svg class={`sb-castle ${cls}`} viewBox="0 -14 170 204" aria-hidden="true">
      <g filter="url(#sb-rough)">
        <path d="M84 6 L84 -2" {...ink} />
        <path class="sb-flag" d="M85 -2 C92 0 96 -4 104 0 L104 10 C96 6 92 10 85 8 Z" fill="#f4bfd3" {...ink} stroke-width="1.6" />
        <path d="M18 80 H44 V182 H18 Z" fill="#eaf5ff" {...ink} />
        <path d="M14 82 L31 40 L48 82 Z" fill="#bfdcf6" {...ink} />
        <path d="M126 80 H152 V182 H126 Z" fill="#eaf5ff" {...ink} />
        <path d="M122 82 L139 40 L156 82 Z" fill="#bfdcf6" {...ink} />
        <path d="M66 50 H104 V182 H66 Z" fill="#f6fbff" {...ink} />
        <path d="M60 52 L85 8 L110 52 Z" fill="#a9cff2" {...ink} />
        <path d="M40 110 V100 H50 V108 H58 V100 H66 V108 M104 108 V100 H112 V108 H120 V100 H130 V110" fill="none" {...ink} />
        <path d="M40 110 H130 V182 H40 Z" fill="#fff" {...ink} />
        <path d="M72 182 V150 C72 136 98 136 98 150 V182" fill="#cfe5fa" {...ink} />
        <path d="M80 92 V80 C80 72 90 72 90 80 V92 Z" fill="#cfe5fa" {...ink} />
        <path d="M27 120 V112 C27 106 35 106 35 112 V120 Z M135 120 V112 C135 106 143 106 143 112 V120 Z" fill="#cfe5fa" {...ink} />
        <path d="M50 130 l4 8 M58 124 l3 7 M114 128 l4 8 M120 140 l3 6" stroke="#9cc0e2" stroke-width="1.6" stroke-linecap="round" />
        <path d="M14 82 C22 78 26 86 31 80 C36 86 42 78 48 82 M60 52 C68 48 74 56 85 50 C94 56 100 48 110 52 M122 82 C130 78 134 86 139 80 C144 86 150 78 156 82" fill="none" stroke="#fff" stroke-width="3" />
      </g>
    </svg>
  );
}

export function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 -40 L13 -16 L7 -16 L17 0 L-17 0 L-7 -16 L-13 -16 Z" fill="#cfe5fa" stroke="#1e3a5f" stroke-width="2" stroke-linejoin="round" />
      <path d="M-6 -26 C-2 -23 2 -27 6 -24 M-10 -8 C-4 -5 4 -9 11 -6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
      <path d="M0 0 V6" stroke="#1e3a5f" stroke-width="2" />
    </g>
  );
}

/** Snowy hills across the bottom of a page; the castle sits on the far hill when asked. */
export function Hills({ castle = false, class: cls = "" }: { castle?: boolean; class?: string }) {
  return (
    <div class={`sb-hills ${cls}`} aria-hidden="true">
      {castle && <Castle />}
      <svg viewBox="0 0 390 170" preserveAspectRatio="xMidYMax slice">
        <g filter="url(#sb-rough)" stroke="#1e3a5f" stroke-width="2.2" stroke-linejoin="round">
          <path d="M-10 70 C60 30 130 50 200 38 C270 26 330 52 400 34 V180 H-10 Z" fill="#dcedfc" />
          <Tree x={46} y={62} s={0.8} />
          <Tree x={338} y={52} s={0.7} />
          <path d="M-10 112 C70 78 150 104 230 88 C300 74 350 96 400 84 V180 H-10 Z" fill="#fff" />
          <path d="M40 120 c14 -4 28 -2 40 2 M250 108 c12 -4 22 -3 34 1" fill="none" stroke="#a9cbe9" stroke-width="2" stroke-linecap="round" />
          <Tree x={300} y={100} />
        </g>
      </svg>
    </div>
  );
}

const SKY_STARS = [
  { x: 8, y: 6, s: 18, d: 0 },
  { x: 86, y: 4, s: 14, d: 0.6 },
  { x: 72, y: 15, s: 22, d: 1.2 },
  { x: 20, y: 18, s: 12, d: 1.8 },
  { x: 93, y: 30, s: 12, d: 0.9 },
  { x: 4, y: 36, s: 14, d: 2.2 },
];

export function Sky({ stars = SKY_STARS }: { stars?: typeof SKY_STARS }) {
  return (
    <div class="sb-sky" aria-hidden="true">
      {stars.map((st, i) => (
        <span key={i} class="sb-sky-star" style={{ left: `${st.x}%`, top: `${st.y}%`, animationDelay: `${st.d}s` }}>
          <Star size={st.s} />
        </span>
      ))}
      <svg class="sb-trail-line" viewBox="0 0 390 200" preserveAspectRatio="none">
        <path d="M-20 150 C60 60 140 170 220 90 S350 40 410 70" fill="none" stroke="#9cc0e2" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round" />
      </svg>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} class="sb-trail" style={{ animationDelay: `${-i * 2.2}s` }}>
          <Flake size={12 + (i % 2) * 6} />
        </span>
      ))}
    </div>
  );
}

type Spark = { id: number; x: number; y: number };

/** The page itself: paper, a sky, and a wand sparkle wherever a finger taps. */
export function Page({ class: cls = "", children }: { class?: string; children: ComponentChildren }) {
  const root = useRef<HTMLDivElement>(null);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const next = useRef(0);
  const tap = (e: PointerEvent) => {
    const box = root.current!.getBoundingClientRect();
    const spark = { id: next.current++, x: e.clientX - box.left, y: e.clientY - box.top };
    setSparks((all) => [...all.slice(-4), spark]);
    setTimeout(() => setSparks((all) => all.filter((s) => s.id !== spark.id)), 900);
  };
  return (
    <div ref={root} class={`d-storybook sb-page ${cls}`} onPointerDown={tap}>
      <Defs />
      {children}
      {sparks.map((s) => (
        <span key={s.id} class="sb-wand" style={{ left: `${s.x}px`, top: `${s.y}px` }} aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <i key={k} style={{ "--a": `${k * 60 + 15}deg` }}>
              {k % 2 ? <Flake size={12} /> : <Star size={14} />}
            </i>
          ))}
        </span>
      ))}
    </div>
  );
}
