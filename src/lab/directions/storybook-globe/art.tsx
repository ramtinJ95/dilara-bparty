import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";

function seeded(seed: number) {
  let s = seed * 9301 + 49297;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

/** A torn, deckled paper outline as a clip-path, so every page edge looks hand-made. Same seed, same edge. */
export function deckle(seed: number, depth = 3.2): string {
  const rand = seeded(seed);
  const d = () => (rand() * depth).toFixed(1);
  const pts: string[] = [];
  for (let i = 0; i <= 32; i++) pts.push(`${(i / 32) * 100}% ${d()}px`);
  for (let i = 1; i <= 60; i++) pts.push(`calc(100% - ${d()}px) ${(i / 60) * 100}%`);
  for (let i = 31; i >= 0; i--) pts.push(`${(i / 32) * 100}% calc(100% - ${d()}px)`);
  for (let i = 59; i >= 1; i--) pts.push(`${d()}px ${(i / 60) * 100}%`);
  return `polygon(${pts.join(",")})`;
}

export const STAR = "M0 -10 L2.4 -3 L10 -3 L3.9 1.6 L6.2 9 L0 4.4 L-6.2 9 L-3.9 1.6 L-10 -3 L-2.4 -3 Z";
export const GLINT = "M0 -11 C1 -3 3 -1 11 0 C3 1 1 3 0 11 C-1 3 -3 1 -11 0 C-3 -1 -1 -3 0 -11 Z";

export function Glint({ size = 16, class: cls = "" }: { size?: number; class?: string }) {
  return (
    <svg class={`gl-glint ${cls}`} width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
      <path d={GLINT} />
    </svg>
  );
}

export function Flake({ size = 16, class: cls = "" }: { size?: number; class?: string }) {
  return (
    <svg class={`gl-flake ${cls}`} width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      {[0, 60, 120].map((a) => (
        <path key={a} transform={`rotate(${a})`} d="M0 -10V10M-2.6 -7.6L0 -5L2.6 -7.6M-2.6 7.6L0 5L2.6 7.6" />
      ))}
    </svg>
  );
}

/** Gradients and the frost filter, shared by every drawing on a screen. */
export function Defs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <linearGradient id="gl-ice" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="1" stop-color="#cfe4f7" />
        </linearGradient>
        <linearGradient id="gl-spire" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#e9f4fe" />
          <stop offset="0.5" stop-color="#a9cdee" />
          <stop offset="1" stop-color="#7fb0de" />
        </linearGradient>
        <linearGradient id="gl-silver" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#9aaabd" />
          <stop offset="0.3" stop-color="#eef3f8" />
          <stop offset="0.55" stop-color="#b7c5d4" />
          <stop offset="0.8" stop-color="#ffffff" />
          <stop offset="1" stop-color="#8d9fb4" />
        </linearGradient>
        <linearGradient id="gl-wand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="1" stop-color="#b5c6d8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Castle({ class: cls = "" }: { class?: string }) {
  const line = { stroke: "#6f93b8", "stroke-width": 1.4, "stroke-linejoin": "round" } as const;
  const spire = (x: number, base: number, w: number, h: number) => (
    <g>
      <path d={`M${x - w} ${base} L${x} ${base - h} L${x + w} ${base} Z`} fill="url(#gl-spire)" {...line} />
      <path d={`M${x - w} ${base} Q${x - w / 2} ${base - 5} ${x} ${base - 1} Q${x + w / 2} ${base - 5} ${x + w} ${base}`} fill="#fff" stroke="none" />
      <circle cx={x} cy={base - h - 3} r="2.4" fill="#fff" stroke="#6f93b8" stroke-width="1" />
    </g>
  );
  const win = (x: number, y: number, w = 7, h = 12) => <path d={`M${x} ${y + h} V${y + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2} V${y + h} Z`} fill="#bfe0fb" stroke="#6f93b8" stroke-width="1" />;
  const icicles = (x0: number, x1: number, y: number) => (
    <path
      d={Array.from({ length: Math.floor((x1 - x0) / 7) }, (_, i) => `M${x0 + i * 7} ${y} l3 ${6 + ((i * 5) % 7)} l3 ${-6 - ((i * 5) % 7)}`).join(" ")}
      fill="#e6f3ff"
      stroke="#8fb3d6"
      stroke-width="0.8"
    />
  );
  return (
    <svg class={`gl-castle ${cls}`} viewBox="0 0 260 200" aria-hidden="true">
      <path d="M20 196 V120 H44 V196 M216 196 V120 H240 V196" fill="url(#gl-ice)" {...line} />
      {spire(32, 121, 16, 54)}
      {spire(228, 121, 16, 54)}
      <path d="M58 196 V92 H88 V196 M172 196 V92 H202 V196" fill="url(#gl-ice)" {...line} />
      {spire(73, 93, 19, 66)}
      {spire(187, 93, 19, 66)}
      <path d="M106 196 V62 H154 V196" fill="url(#gl-ice)" {...line} />
      {spire(130, 63, 28, 90)}
      <path d="M130 -30 V-27" stroke="#6f93b8" />
      <path class="gl-pennant" d="M131 -27 C138 -25 142 -29 150 -26 L150 -18 C142 -21 138 -17 131 -19 Z" fill="#f6c9dc" stroke="#b07d98" stroke-width="0.8" />
      <path d="M40 196 V140 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h4 V196 Z" fill="url(#gl-ice)" {...line} />
      {icicles(44, 216, 140)}
      {icicles(108, 152, 62)}
      {win(126, 78, 8, 16)}
      {win(69, 108)}
      {win(183, 108)}
      {win(28, 136, 6, 10)}
      {win(224, 136, 6, 10)}
      <path d="M116 196 V170 A14 14 0 0 1 144 170 V196 Z" fill="#cfe6fb" stroke="#6f93b8" stroke-width="1.2" />
      <path d="M130 156 V196" stroke="#8fb3d6" stroke-width="1" />
      {win(84, 158)}
      {win(168, 158)}
    </svg>
  );
}

export function Wand({ class: cls = "" }: { class?: string }) {
  return (
    <svg class={`gl-wand-art ${cls}`} viewBox="0 0 60 120" aria-hidden="true">
      <path d="M28 40 L33 40 L35 118 L26 118 Z" fill="url(#gl-wand)" stroke="#7c93ad" stroke-width="1.2" stroke-linejoin="round" />
      <path d="M27 60 L34 58 M27 74 L34 72 M27 88 L35 86" stroke="#c3d2e1" stroke-width="1.4" />
      <path transform="translate(30.5 26) scale(2.2)" d={STAR} fill="#fff" stroke="#7c93ad" stroke-width="0.6" stroke-linejoin="round" />
      <circle cx="30.5" cy="27" r="4" fill="#cfe7fc" />
      <path d="M44 40 c6 6 10 4 14 10 M17 40 c-6 6 -10 4 -14 10" fill="none" stroke="#f3bcd2" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

/** Snow that falls in two depths behind everything: soft far dots and a few sharp near flakes. */
const FAR = Array.from({ length: 16 }, (_, i) => ({ x: (i * 37 + 11) % 100, s: 3 + (i % 3), t: 9 + (i % 5) * 1.7, d: -((i * 1.9) % 12) }));
const NEAR = Array.from({ length: 7 }, (_, i) => ({ x: (i * 29 + 7) % 100, s: 12 + (i % 3) * 4, t: 11 + (i % 3) * 3, d: -((i * 2.7) % 13) }));

export function Snowfall() {
  return (
    <div class="gl-snow" aria-hidden="true">
      {FAR.map((f, i) => (
        <i key={i} class="gl-far" style={{ left: `${f.x}%`, width: `${f.s}px`, height: `${f.s}px`, animationDuration: `${f.t}s`, animationDelay: `${f.d}s` }} />
      ))}
      {NEAR.map((f, i) => (
        <span key={i} class="gl-near" style={{ left: `${f.x}%`, animationDuration: `${f.t}s`, animationDelay: `${f.d}s` }}>
          <Flake size={f.s} />
        </span>
      ))}
    </div>
  );
}

/** Snow inside a globe: each flake circles the middle at its own radius and speed. */
export const GLOBE_SNOW = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * 360 + (i % 3) * 17;
  const r = 34 + ((i * 23) % 80);
  const rad = (a * Math.PI) / 180;
  const restX = -84 + ((i * 41) % 168);
  const restY = 92 + ((i * 13) % 26) - Math.abs(restX) * 0.18;
  return { a, r, s: 4 + (i % 4) * 1.6, t: 5 + (i % 5) * 1.3, sx: restX - Math.cos(rad) * r, sy: restY - Math.sin(rad) * r, k: i % 4 === 0 };
});

export function Globe({ class: cls = "", children, base }: { class?: string; children: ComponentChildren; base?: ComponentChildren }) {
  return (
    <div class={`gl-globe ${cls}`}>
      <div class="gl-glass">
        <div class="gl-inside">{children}</div>
        <div class="gl-swirl" aria-hidden="true">
          {GLOBE_SNOW.map((f, i) => (
            <span key={i} class="gl-settle" style={{ "--sx": `${f.sx}px`, "--sy": `${f.sy}px` }}>
              <i class={f.k ? "is-star" : ""} style={{ "--a": `${f.a}deg`, "--r": `${f.r}px`, width: `${f.s}px`, height: `${f.s}px`, "--t": `${f.t}s` }} />
            </span>
          ))}
        </div>
        <span class="gl-shine" aria-hidden="true" />
      </div>
      <div class="gl-base">
        <span class="gl-base-top" aria-hidden="true" />
        <div class="gl-base-body">{base}</div>
      </div>
    </div>
  );
}

type Spark = { id: number; x: number; y: number; k: number };

/** A book page on a winter sky. A finger drawn across it leaves a wand's sparkle trail. */
export function Page({ class: cls = "", children }: { class?: string; children: ComponentChildren }) {
  const root = useRef<HTMLDivElement>(null);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const next = useRef(0);
  const lastAt = useRef({ x: -99, y: -99 });
  const add = (e: PointerEvent) => {
    const box = root.current!.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    if (e.type === "pointermove" && (e.buttons === 0 || Math.hypot(x - lastAt.current.x, y - lastAt.current.y) < 16)) return;
    lastAt.current = { x, y };
    const spark = { id: next.current++, x, y, k: next.current % 3 };
    setSparks((all) => [...all.slice(-11), spark]);
    setTimeout(() => setSparks((all) => all.filter((s) => s.id !== spark.id)), 800);
  };
  return (
    <div ref={root} class={`d-storybook-globe gl-page ${cls}`} onPointerDown={add} onPointerMove={add}>
      <Defs />
      <Snowfall />
      {children}
      {sparks.map((s) => (
        <span key={s.id} class={`gl-spark k${s.k}`} style={{ left: `${s.x}px`, top: `${s.y}px` }} aria-hidden="true">
          <Glint size={s.k === 0 ? 22 : 14} />
        </span>
      ))}
    </div>
  );
}

/** A leaf of the book: a deckled paper page over silver-gilt page edges. */
export function Leaf({ class: cls = "", seed, children, as: Tag = "section", ...rest }: { class?: string; seed: number; children: ComponentChildren; as?: "section" | "main" | "form" | "div"; [k: string]: unknown }) {
  return (
    <Tag class={`gl-leaf ${cls}`} {...rest}>
      <span class="gl-gilt" aria-hidden="true" />
      <span class="gl-paper" style={{ clipPath: deckle(seed) }} aria-hidden="true" />
      {children}
    </Tag>
  );
}

export function Ribbon({ class: cls = "", children, as: Tag = "p", style }: { class?: string; children: ComponentChildren; as?: "p" | "h2"; style?: Record<string, string> }) {
  return (
    <Tag class={`gl-ribbon ${cls}`} style={style}>
      <span class="gl-ribbon-tail l" aria-hidden="true" />
      <span class="gl-ribbon-tail r" aria-hidden="true" />
      <span class="gl-ribbon-face">{children}</span>
    </Tag>
  );
}
