import type { ComponentChildren } from "preact";
import { Sparkle } from "../../../client/icons";
import { fixture } from "../../fixture";

type Tab = 0 | 2;

// A fixed low-poly ice field: a jittered grid split into triangles, each a slightly different white or ice tint.
const COLS = 6;
const ROWS = 11;
function facetField() {
  let s = 7;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const w = 390 / COLS;
  const h = 844 / ROWS;
  const pts: [number, number][][] = [];
  for (let r = 0; r <= ROWS; r++) {
    const row: [number, number][] = [];
    for (let c = 0; c <= COLS; c++) {
      const edgeX = c === 0 || c === COLS;
      const edgeY = r === 0 || r === ROWS;
      row.push([c * w + (edgeX ? 0 : (rand() - 0.5) * w * 0.7), r * h + (edgeY ? 0 : (rand() - 0.5) * h * 0.7)]);
    }
    pts.push(row);
  }
  const tints = ["#ffffff", "#f3f8fe", "#e7f1fb", "#dbeaf8", "#eef4fa", "#e1ebf5"];
  const tris: { d: string; fill: string }[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const a = pts[r]![c]!;
      const b = pts[r]![c + 1]!;
      const d = pts[r + 1]![c]!;
      const e = pts[r + 1]![c + 1]!;
      const flip = (r + c) % 2 === 0;
      const one = flip ? [a, b, e] : [a, b, d];
      const two = flip ? [a, e, d] : [b, e, d];
      for (const t of [one, two]) tris.push({ d: `M${t.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`, fill: tints[Math.floor(rand() * tints.length)]! });
    }
  return tris;
}
const FIELD = facetField();

export const Facets = () => (
  <div class="cr-field" aria-hidden="true">
    <svg viewBox="0 0 390 844" preserveAspectRatio="none">
      {FIELD.map((t, i) => (
        <path key={i} d={t.d} fill={t.fill} stroke="#ffffff" stroke-width="0.8" />
      ))}
    </svg>
    <span class="cr-beam cr-beam-1" />
    <span class="cr-beam cr-beam-2" />
  </div>
);

const SPARKS = [
  [8, 6, 14, 0],
  [86, 9, 10, 0.5],
  [70, 30, 8, 1.1],
  [12, 44, 9, 1.6],
  [92, 58, 12, 0.3],
  [6, 74, 8, 0.9],
  [80, 86, 10, 1.9],
  [40, 94, 7, 1.3],
] as const;

export const Twinkles = ({ only }: { only?: number }) => (
  <div class="cr-twinkles" aria-hidden="true">
    {SPARKS.slice(0, only).map(([x, y, size, delay], i) => (
      <span key={i} style={{ left: `${x}%`, top: `${y}%`, width: `${size}px`, height: `${size}px`, animationDelay: `${delay}s` }}>
        <Sparkle />
      </span>
    ))}
  </div>
);

/** A small cut gem: a table, a crown of facets and a pointed pavilion. */
export const Gem = ({ class: className, tone = "ice" }: { class?: string; tone?: "ice" | "rose" | "lilac" }) => {
  const tones = {
    ice: ["#ffffff", "#cfe6fb", "#8cc4f2", "#4f9be0", "#2f7cc9"],
    rose: ["#ffffff", "#fde3ef", "#f7b8d5", "#ee8fbb", "#d9659f"],
    lilac: ["#ffffff", "#ece4ff", "#cdbcf7", "#a993ec", "#8770d6"],
  }[tone];
  return (
    <svg class={className} viewBox="0 0 40 32" aria-hidden="true">
      <path d="M10 2h20l8 9H2z" fill={tones[1]} />
      <path d="M14 2h12l-6 9z" fill={tones[0]} />
      <path d="M2 11h36L20 30z" fill={tones[3]} />
      <path d="M2 11h12l6 19z" fill={tones[2]} />
      <path d="M26 11h12L20 30z" fill={tones[4]} />
      <path d="M10 2 14 11M30 2 26 11M14 11l6 19M26 11l-6 19" stroke="#fff" stroke-width="0.8" opacity="0.8" fill="none" />
    </svg>
  );
};

export function Shell({ tab, children }: { tab: Tab; children: ComponentChildren }) {
  const { hello, online, tabs } = fixture.shell;
  return (
    <div class="d-crystal cr-page cr-shell">
      <Facets />
      <Twinkles only={5} />
      <header class="cr-top">
        <div class="cr-hello">
          <Gem class="cr-hello-gem" />
          <strong>{hello}</strong>
        </div>
        <span class="cr-online">
          <i aria-hidden="true" />
          {online}
        </span>
      </header>
      <nav class="cr-tabs" aria-label="Flikar">
        {tabs.map((t, i) => (
          <a key={t} href="#" class="cr-tab" aria-current={i === tab ? "page" : undefined} onClick={(e) => e.preventDefault()}>
            {t}
          </a>
        ))}
      </nav>
      <main class="cr-main">{children}</main>
    </div>
  );
}

/** The crystal crown of the finale: five faceted points and three cut stones. */
export const Crown = () => (
  <svg class="cr-crown" viewBox="0 0 120 80" aria-hidden="true">
    <defs>
      <linearGradient id="cr-crown-a" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.5" stop-color="#d7e8f8" />
        <stop offset="1" stop-color="#9fbfdc" />
      </linearGradient>
    </defs>
    <path d="M8 70 4 22l24 22L44 8l16 30L76 8l16 36 24-22-4 48z" fill="url(#cr-crown-a)" stroke="#7d9cbb" stroke-width="1.4" stroke-linejoin="round" />
    <path d="M4 22l24 22M28 44 44 8M44 8l16 30M60 38 76 8M76 8l16 36M92 44l24-22M28 44l32-6 32 6M8 70l20-26M112 70 92 44M60 38v32" stroke="#fff" stroke-width="1.2" fill="none" opacity="0.9" />
    <path d="M8 62h104v8H8z" fill="#b9d0e6" stroke="#7d9cbb" stroke-width="1.2" />
    <path d="M60 46l7 8-7 8-7-8z" fill="#ee8fbb" stroke="#fff" stroke-width="1" />
    <path d="M34 52l5 5-5 5-5-5z" fill="#4f9be0" stroke="#fff" stroke-width="1" />
    <path d="M86 52l5 5-5 5-5-5z" fill="#a993ec" stroke="#fff" stroke-width="1" />
    <circle cx="4" cy="22" r="3" fill="#8cc4f2" />
    <circle cx="44" cy="8" r="3.4" fill="#cdbcf7" />
    <circle cx="76" cy="8" r="3.4" fill="#f7b8d5" />
    <circle cx="116" cy="22" r="3" fill="#8cc4f2" />
  </svg>
);
