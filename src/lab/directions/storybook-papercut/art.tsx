import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";

const ARM = "M-1.6 0 L-1.6 -11 L-5.6 -14.6 L-4.2 -16.2 L-1.2 -13.4 L0 -19 L1.2 -13.4 L4.2 -16.2 L5.6 -14.6 L1.6 -11 L1.6 0 Z M-1.2 -6 L-6.4 -8.6 L-5.6 -10.4 L-1 -8.8 Z M1.2 -6 L6.4 -8.6 L5.6 -10.4 L1 -8.8 Z";
const HEX = "M0 -6.4 L5.5 -3.2 L5.5 3.2 L0 6.4 L-5.5 3.2 L-5.5 -3.2 Z";

/** Shapes every screen shares: the folded paper snowflake with its cut-out holes. */
export function Defs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <mask id="pc-holes" maskUnits="userSpaceOnUse" x="-20" y="-20" width="40" height="40">
          <rect x="-20" y="-20" width="40" height="40" fill="#fff" />
          <circle r="2" fill="#000" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <g key={a} transform={`rotate(${a})`}>
              <path d="M0 -12.4 L0.9 -10.6 L0 -8.8 L-0.9 -10.6 Z" fill="#000" />
              <circle cy="-4.2" r="0.9" fill="#000" />
            </g>
          ))}
        </mask>
        <symbol id="pc-flake" viewBox="-20 -20 40 40">
          <g mask="url(#pc-holes)" fill="currentColor">
            <path d={HEX} />
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <path key={a} transform={`rotate(${a})`} d={ARM} />
            ))}
          </g>
        </symbol>
        <linearGradient id="pc-moon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="1" stop-color="#cdd8e3" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function PaperFlake({ size = 24, class: cls = "" }: { size?: number; class?: string }) {
  return (
    <svg class={`pc-pflake ${cls}`} width={size} height={size} aria-hidden="true">
      <use href="#pc-flake" />
    </svg>
  );
}

export const STAR = "M0 -10 L2.6 -3.4 L9.5 -3.1 L4.1 1.3 L5.9 8.1 L0 4.3 L-5.9 8.1 L-4.1 1.3 L-9.5 -3.1 L-2.6 -3.4 Z";

export function PaperStar({ size = 20, class: cls = "" }: { size?: number; class?: string }) {
  return (
    <svg class={`pc-pstar ${cls}`} width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
      <path d={STAR} />
    </svg>
  );
}

/** A row of jagged pines standing on a ridge, as one cut sheet. */
function pines(seed: number, base: number, count: number, h: number) {
  let s = seed;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let d = `M0 ${base + 30} `;
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) * (480 / count) + (rand() - 0.5) * 10;
    const hh = h * (0.7 + rand() * 0.5);
    const w = hh * 0.42;
    const y = base + (rand() - 0.5) * 10;
    d += `L${x - w} ${y} L${x - w * 0.5} ${y - hh * 0.3} L${x - w * 0.75} ${y - hh * 0.3} L${x - w * 0.3} ${y - hh * 0.62} L${x - w * 0.52} ${y - hh * 0.62} L${x} ${y - hh} L${x + w * 0.52} ${y - hh * 0.62} L${x + w * 0.3} ${y - hh * 0.62} L${x + w * 0.75} ${y - hh * 0.3} L${x + w * 0.5} ${y - hh * 0.3} L${x + w} ${y} `;
  }
  return `${d}L480 ${base + 30} V400 H0 Z`;
}

const BACK_PINES = pines(7, 70, 13, 64);
const FRONT_PINES = pines(3, 84, 9, 84);

export function Moon({ class: cls = "" }: { class?: string }) {
  return (
    <svg class={`pc-layer pc-moon ${cls}`} viewBox="-40 -40 80 80" aria-hidden="true">
      <circle r="34" fill="url(#pc-moon)" />
      <circle cx="-10" cy="-8" r="6" fill="#dfe7ef" />
      <circle cx="9" cy="10" r="4" fill="#dfe7ef" />
      <circle cx="12" cy="-12" r="2.6" fill="#dfe7ef" />
    </svg>
  );
}

export function FarHills({ class: cls = "" }: { class?: string }) {
  return (
    <svg class={`pc-layer pc-far ${cls}`} viewBox="0 0 480 160" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 64 C60 30 120 56 180 42 C240 28 300 56 360 40 C410 28 450 44 480 34 V160 H0 Z" fill="#e9f3fd" />
    </svg>
  );
}

export function Castle({ class: cls = "" }: { class?: string }) {
  return (
    <svg class={`pc-layer pc-castle ${cls}`} viewBox="0 -34 200 224" aria-hidden="true">
      <path
        d="M16 190 V96 L10 96 L28 40 L46 96 L40 96 V120 H62 V74 L56 74 L78 14 L100 -16 L122 14 L144 74 L138 74 V120 H160 V96 L154 96 L172 40 L190 96 L184 96 V190 Z"
        fill="#ffffff"
      />
      <path d="M100 -16 V-30 M100 -30 L116 -24 L100 -19" fill="#f6c9dc" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round" />
      <path d="M28 40 L46 96 L10 96 Z M78 14 L100 -16 L122 14 L144 74 L56 74 Z M172 40 L190 96 L154 96 Z" fill="#e3ebf3" />
      <path d="M86 190 V160 A14 14 0 0 1 114 160 V190 Z M95 104 V92 A5 5 0 0 1 105 92 V104 Z M24 136 V126 A4 4 0 0 1 32 126 V136 Z M168 136 V126 A4 4 0 0 1 176 126 V136 Z M70 142 V132 A4 4 0 0 1 78 132 V142 Z M122 142 V132 A4 4 0 0 1 130 132 V142 Z" fill="#b5d4f1" />
    </svg>
  );
}

export function BackPines({ class: cls = "" }: { class?: string }) {
  return (
    <svg class={`pc-layer pc-back ${cls}`} viewBox="0 0 480 170" aria-hidden="true">
      <path d={BACK_PINES} fill="#bcd8f3" />
    </svg>
  );
}

export function FrontPines({ class: cls = "" }: { class?: string }) {
  return (
    <svg class={`pc-layer pc-front ${cls}`} viewBox="0 0 480 170" aria-hidden="true">
      <path d={FRONT_PINES} fill="#86b5e2" />
    </svg>
  );
}

export function NearSnow({ class: cls = "" }: { class?: string }) {
  return (
    <svg class={`pc-layer pc-near ${cls}`} viewBox="0 0 480 140" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 46 C70 18 150 44 230 32 C310 20 400 46 480 26 V140 H0 Z" fill="#ffffff" />
      <path d="M60 60 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 Z M380 52 l1.6 -4 l1.6 4 l4 1.6 l-4 1.6 l-1.6 4 l-1.6 -4 l-4 -1.6 Z" fill="#cfe0f0" />
    </svg>
  );
}

/** The five cut sheets stacked with paper shadows between them; each drifts at its own depth. */
export function Scenery({ class: cls = "", castle = true }: { class?: string; castle?: boolean }) {
  return (
    <div class={`pc-scenery ${cls}`} aria-hidden="true">
      <FarHills />
      {castle && <Castle />}
      <BackPines />
      <FrontPines />
      <NearSnow />
    </div>
  );
}

const FLAKES = Array.from({ length: 12 }, (_, i) => ({ x: (i * 31 + 5) % 96, s: 14 + ((i * 7) % 4) * 6, t: 12 + (i % 4) * 3, d: -((i * 2.3) % 14), sway: i % 2 ? 1 : -1 }));

export function PaperSnow() {
  return (
    <div class="pc-snow" aria-hidden="true">
      {FLAKES.map((f, i) => (
        <span key={i} class="pc-fall" style={{ left: `${f.x}%`, animationDuration: `${f.t}s`, animationDelay: `${f.d}s`, "--sway": f.sway }}>
          <PaperFlake size={f.s} />
        </span>
      ))}
    </div>
  );
}

type Snip = { id: number; x: number; y: number };

/** A paper sky. A tap snips a little paper flake that flutters away. */
export function Page({ class: cls = "", children }: { class?: string; children: ComponentChildren }) {
  const root = useRef<HTMLDivElement>(null);
  const [snips, setSnips] = useState<Snip[]>([]);
  const next = useRef(0);
  const tap = (e: PointerEvent) => {
    const box = root.current!.getBoundingClientRect();
    const snip = { id: next.current++, x: e.clientX - box.left, y: e.clientY - box.top };
    setSnips((all) => [...all.slice(-4), snip]);
    setTimeout(() => setSnips((all) => all.filter((s) => s.id !== snip.id)), 900);
  };
  return (
    <div ref={root} class={`d-storybook-papercut pc-page ${cls}`} onPointerDown={tap}>
      <Defs />
      {children}
      {snips.map((s) => (
        <span key={s.id} class="pc-snip" style={{ left: `${s.x}px`, top: `${s.y}px` }} aria-hidden="true">
          {[0, 1, 2, 3, 4].map((k) => (
            <i key={k} style={{ "--a": `${k * 72 - 20}deg` }}>
              <PaperFlake size={k % 2 ? 12 : 18} />
            </i>
          ))}
        </span>
      ))}
    </div>
  );
}

export function Banner({ class: cls = "", children, as: Tag = "p", style }: { class?: string; children: ComponentChildren; as?: "p" | "h2"; style?: Record<string, string> }) {
  return (
    <Tag class={`pc-banner ${cls}`} style={style}>
      <span class="pc-banner-tail l" aria-hidden="true" />
      <span class="pc-banner-tail r" aria-hidden="true" />
      <span class="pc-banner-face">{children}</span>
    </Tag>
  );
}

/** A round paper doily: a scalloped rim with a ring of punched holes. */
function doilyPath(n = 26, R = 100, holes = 26, hr = 86) {
  const at = (i: number) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * R, Math.sin(a) * R] as const;
  };
  const chord = 2 * R * Math.sin(Math.PI / n);
  let d = `M${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)}`;
  for (let i = 1; i <= n; i++) d += `A${(chord / 2).toFixed(1)} ${(chord / 2).toFixed(1)} 0 0 1 ${at(i)[0].toFixed(1)} ${at(i)[1].toFixed(1)}`;
  for (let i = 0; i < holes; i++) {
    const a = ((i + 0.5) / holes) * Math.PI * 2;
    const [x, y] = [Math.cos(a) * hr, Math.sin(a) * hr];
    d += `M${(x + 2.6).toFixed(1)} ${y.toFixed(1)}a2.6 2.6 0 1 0 -5.2 0a2.6 2.6 0 1 0 5.2 0`;
  }
  return `${d}Z`;
}
const DOILY = doilyPath();

export function Doily({ class: cls = "" }: { class?: string }) {
  return (
    <svg class={`pc-doily ${cls}`} viewBox="-108 -108 216 216" aria-hidden="true">
      <path d={DOILY} fill="#fff" fill-rule="evenodd" />
    </svg>
  );
}

/** Two soft snow drifts at the foot of a pop-up page. */
export function Drift({ class: cls = "" }: { class?: string }) {
  return (
    <svg class={`pc-layer pc-drift ${cls}`} viewBox="0 0 360 64" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 64 V40 C30 14 80 10 120 30 C150 44 170 42 190 30 C230 6 300 8 360 34 V64 Z" fill="#ffffff" />
      <path d="M70 36 l1.6 -4 l1.6 4 l4 1.6 l-4 1.6 l-1.6 4 l-1.6 -4 l-4 -1.6 Z M270 28 l1.6 -4 l1.6 4 l4 1.6 l-4 1.6 l-1.6 4 l-1.6 -4 l-4 -1.6 Z" fill="#bcd8f3" />
    </svg>
  );
}
