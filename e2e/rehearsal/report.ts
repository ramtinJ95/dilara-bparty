import { profiles, type ProfileName } from "../phone-network.ts";
import type { BrowserName, CheckResult, DeviceName, Timing } from "./rehearsal.ts";

export type StepOutcome = { id: string; title: string; outcome: "ran" | "crashed" | "not-run"; error?: string };

export type Summary = {
  target: string;
  browser: BrowserName;
  startedAt: Date;
  ms: number;
  cast: { name: string; profile: ProfileName; device: DeviceName }[];
  steps: StepOutcome[];
  checks: CheckResult[];
  timings: Timing[];
  notes: string[];
};

export const passed = (s: Summary) => s.checks.every((c) => c.ok) && s.steps.every((st) => st.outcome === "ran");

const seconds = (ms: number) => (ms / 1000).toFixed(1);
const profileNames = Object.keys(profiles) as ProfileName[];

function stepRows(s: Summary): string[][] {
  return s.steps.map((st) => {
    const mine = s.checks.filter((c) => c.step === st.id);
    const ok = mine.filter((c) => c.ok).length;
    const result = st.outcome === "ran" ? (ok === mine.length ? "pass" : "FAIL") : st.outcome === "crashed" ? "CRASHED" : "not run";
    return [`${st.id}: ${st.title}`, `${ok} of ${mine.length}`, result];
  });
}

function timingRows(s: Summary): string[][] {
  const kinds = [...new Set(s.timings.map((t) => t.kind))];
  return kinds.map((kind) => [
    kind,
    ...profileNames.map((p) => {
      const ms = s.timings.filter((t) => t.kind === kind && t.profile === p && t.ok).map((t) => t.ms).sort((a, b) => a - b);
      const failed = s.timings.filter((t) => t.kind === kind && t.profile === p && !t.ok).length;
      if (!ms.length && !failed) return "";
      const cell = ms.length ? `${seconds(ms[Math.floor((ms.length - 1) / 2)]!)} / ${seconds(ms.at(-1)!)} (${ms.length})` : "";
      return failed ? `${cell} ${failed} failed`.trim() : cell;
    }),
  ]);
}

function castLine(s: Summary): string {
  const count = (values: string[]) => [...new Set(values)].map((v) => `${v} ×${values.filter((x) => x === v).length}`).join(", ");
  return `${s.cast.length} guests: ${count(s.cast.map((c) => c.device))}; ${count(s.cast.map((c) => c.profile))}`;
}

const profileHeader = profileNames.map((p) => `${p} (${profiles[p].latencyMs} ms, ${profiles[p].downKbps} kbps)`);

export function toMarkdown(s: Summary): string {
  const table = (head: string[], rows: string[][]) =>
    [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
  const failures = s.checks.filter((c) => !c.ok);
  const crashes = s.steps.filter((st) => st.error);
  return [
    `# Party rehearsal: ${passed(s) ? "PASS" : "FAIL"}`,
    `${s.target} · ${s.browser} · ${s.startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC · ${seconds(s.ms)} s`,
    castLine(s),
    "## Steps",
    table(["Step", "Checks", "Result"], stepRows(s)),
    ...(failures.length || crashes.length
      ? ["## Failures", [...crashes.map((st) => `- **${st.id}** crashed: ${st.error}`), ...failures.map((c) => `- **${c.step}** ${c.label}: ${c.error}${c.screenshot ? ` ([screenshot](${c.screenshot}))` : ""}`)].join("\n")]
      : []),
    "## Timings",
    "Seconds from the action to the phone showing the current state: median / slowest (count). They include the CPU contention of every phone running on one machine.",
    table(["What", ...profileHeader], timingRows(s)),
    ...(s.notes.length ? ["## Notes", s.notes.map((n) => `- ${n}`).join("\n")] : []),
  ].join("\n\n") + "\n";
}

const esc = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function toHtml(s: Summary): string {
  const table = (head: string[], rows: string[][]) =>
    `<table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${rows
      .map((r) => `<tr>${r.map((c) => `<td class="${/FAIL|CRASHED|failed/.test(c) ? "bad" : c === "pass" ? "good" : ""}">${esc(c)}</td>`).join("")}</tr>`)
      .join("")}</table>`;
  const failures = s.checks.filter((c) => !c.ok);
  return `<!doctype html><meta charset="utf-8"><title>Party rehearsal</title>
<style>
body{font:15px/1.45 system-ui,sans-serif;margin:0;padding:28px 32px;color:#1d3557;background:linear-gradient(#eaf5fe,#fff 320px)}
h1{margin:0 0 4px;font-size:26px}h1 span{color:${passed(s) ? "#2a9d8f" : "#c0392b"}}h2{margin:26px 0 8px;font-size:17px;color:#2f6fa8}
p{margin:4px 0;color:#4a6382}table{border-collapse:collapse;width:100%;background:#fff;box-shadow:0 1px 4px #b8cfe4}
th,td{border:1px solid #d6e4f1;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f2f7fc;font-weight:600}
td.good{color:#2a9d8f;font-weight:600}td.bad{color:#c0392b;font-weight:600}li{margin:3px 0}
</style>
<h1>❄ Party rehearsal: <span>${passed(s) ? "PASS" : "FAIL"}</span></h1>
<p>${esc(s.target)} · ${s.browser} · ${s.startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC · ${seconds(s.ms)} s</p>
<p>${esc(castLine(s))}</p>
<h2>Steps</h2>${table(["Step", "Checks", "Result"], stepRows(s))}
${failures.length ? `<h2>Failures</h2><ul>${failures.map((c) => `<li><b>${esc(c.step)}</b> ${esc(c.label)}: ${esc(c.error ?? "")}</li>`).join("")}</ul>` : ""}
<h2>Timings</h2><p>Seconds from the action to the phone showing the current state: median / slowest (count).</p>
${table(["What", ...profileHeader], timingRows(s))}
${s.notes.length ? `<h2>Notes</h2><ul>${s.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}`;
}
