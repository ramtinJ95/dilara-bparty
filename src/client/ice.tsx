import { Snowflake } from "./icons";

export const Cap = ({ class: c }: { class?: string }) => (
  <svg class={c ? `cap ${c}` : "cap"} viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
    <path
      d="M0 17C0 9 6 5 13 8C18 1 31 0 37 7C44 2 55 2 60 8C67 1 81 2 86 8C94 6 100 10 100 17C93 20 86 15 78 18C69 21 61 15 51 18C41 21 33 15 23 18C14 21 7 15 0 17Z"
      vector-effect="non-scaling-stroke"
    />
  </svg>
);

export const Icicles = ({ class: c }: { class?: string }) => (
  <svg class={c ? `icicles ${c}` : "icicles"} viewBox="0 0 62 28" aria-hidden="true">
    <path d="M2 1L7 19L12 1ZM14 1L18.5 12L23 1ZM25 1L31 27L37 1ZM39 1L43 14L47 1ZM49 1L54.5 21L60 1Z" />
  </svg>
);

export const Sheen = () => <span class="sheen" aria-hidden="true" />;

export const Drift = () => (
  <svg class="drift" viewBox="0 0 390 60" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 30C40 10 80 14 120 26C170 6 230 8 270 24C310 8 360 12 390 22V60H0Z" vector-effect="non-scaling-stroke" />
  </svg>
);

const FAR = Array.from({ length: 14 }, (_, i) => i);
const NEAR = Array.from({ length: 8 }, (_, i) => i);

// A far layer of soft dots and a near layer of crisp flakes, fixed behind the page. Each moves by transform only.
export function Snow() {
  return (
    <div class="snow" aria-hidden="true">
      {FAR.map((i) => (
        <i key={`f${i}`} class="far" style={{ "--x": `${(i * 37 + 5) % 100}%`, "--y": `${(i * 61) % 100}%`, "--s": `${4 + (i % 3) * 2}px`, "--dur": `${13 + (i % 5) * 2}s`, "--dl": `${-((i * 1.9) % 15)}s` }} />
      ))}
      {NEAR.map((i) => (
        <i key={`n${i}`} class="near" style={{ "--x": `${(i * 43 + 11) % 100}%`, "--y": `${(i * 47 + 20) % 100}%`, "--s": `${16 + (i % 3) * 6}px`, "--dur": `${9 + (i % 4) * 1.5}s`, "--dl": `${-((i * 2.3) % 9)}s` }}>
          <Snowflake />
        </i>
      ))}
    </div>
  );
}

// Freezes every animation while the page is hidden, so a phone in a pocket spends nothing on falling snow.
export function pauseWhenHidden() {
  const sync = () => document.documentElement.classList.toggle("asleep", document.hidden);
  document.addEventListener("visibilitychange", sync);
  sync();
}
