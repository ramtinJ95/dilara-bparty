import { useState } from "preact/hooks";
import type { PhotoId } from "../../shared/model";
import type { AdminCmd, AdminContest, AdminEntrant, TallyRow } from "../../shared/protocol";
import { photoUrl } from "../api";
import { archiveFiles, BADGES, badgeOf, buildArchive, oldestFirst } from "./archive";
import { clockTime, plural } from "./format";

type Send = (cmd: AdminCmd) => void;
type Download = { kind: "idle" } | { kind: "working"; done: number; total: number } | { kind: "failed"; error: string };

function Toggle({ label, open, live, onChange }: { label: string; open: boolean; live: boolean; onChange: (open: boolean) => void }) {
  return (
    <div class="toggle">
      <span class={open ? "state open" : "state"}>
        {label} {open ? "open" : "closed"}
      </span>
      <button class={open ? "btn small secondary" : "btn small"} type="button" disabled={!live} onClick={() => onChange(!open)}>
        {open ? `Close ${label.toLowerCase()}` : `Open ${label.toLowerCase()}`}
      </button>
    </div>
  );
}

function Tally({ rows, view }: { rows: TallyRow[]; view: (id: PhotoId) => void }) {
  const perRank = new Map<number, number>();
  for (const r of rows) perRank.set(r.rank, (perRank.get(r.rank) ?? 0) + 1);
  if (rows.length === 0) return <p class="muted empty">No photos in the gallery yet.</p>;
  return (
    <ol class="tally">
      {rows.map((r) => (
        <li key={r.photo} class={r.rank === 1 ? "lead" : undefined}>
          <span class="rank">{r.rank}</span>
          <button class="thumb-btn" type="button" onClick={() => view(r.photo)} aria-label={`Open ${r.name}'s photo`}>
            <img src={photoUrl(r.thumb)} alt="" loading="lazy" />
          </button>
          <span class="who">
            <span class="name">{r.name}</span>
            {r.fame && <span class="badge fame">hall of fame</span>}
            {(perRank.get(r.rank) ?? 0) > 1 && <span class="badge tie">tie</span>}
          </span>
          <span class="tally-votes">
            {r.votes} <span class="muted">{r.votes === 1 ? "vote" : "votes"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Versions({ entrants, send, live, view }: { entrants: AdminEntrant[]; send: Send; live: boolean; view: (id: PhotoId) => void }) {
  if (entrants.length === 0) return <p class="muted empty">Nobody has uploaded yet.</p>;
  return (
    <ul class="entrants">
      {entrants.map((e) => (
        <li key={e.player}>
          <h4>
            {e.name} <span class="muted">· {plural(e.versions.length, "version", "versions")}</span>
          </h4>
          <ol class="versions">
            {oldestFirst(e.versions).map((v) => {
              const badge = badgeOf(v);
              return (
                <li key={v.id} class={v.hidden ? "hidden-version" : undefined}>
                  <button class="thumb-btn" type="button" onClick={() => view(v.id)} aria-label={`Open ${e.name}'s photo from ${clockTime(v.createdAt)}`}>
                    <img src={photoUrl(v.thumb)} alt="" loading="lazy" />
                  </button>
                  <div class="badges">
                    <span class={`badge ${badge}`}>{BADGES[badge].label}</span>
                    {v.hidden && <span class="badge hidden">hidden</span>}
                  </div>
                  <span class="meta">
                    {plural(v.votes, "vote", "votes")} · {clockTime(v.createdAt)}
                  </span>
                  <button class="link" type="button" disabled={!live} onClick={() => send({ t: "hide", photo: v.id, hidden: !v.hidden })}>
                    {v.hidden ? "Unhide" : "Hide"}
                  </button>
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ul>
  );
}

export function DownloadAll({ entrants }: { entrants: AdminEntrant[] }) {
  const [state, setState] = useState<Download>({ kind: "idle" });
  const files = archiveFiles(entrants);

  async function run() {
    setState({ kind: "working", done: 0, total: files.length });
    try {
      const zip = await buildArchive(files, (done) => setState({ kind: "working", done, total: files.length }));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(zip);
      a.download = `photo-contest-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      setState({ kind: "idle" });
    } catch (err) {
      setState({ kind: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div class="download">
      <button class="btn small" type="button" disabled={state.kind === "working" || files.length === 0} onClick={() => void run()}>
        {state.kind === "working" ? `Downloading ${state.done} / ${state.total}…` : `Download all (zip, ${files.length})`}
      </button>
      {state.kind === "working" && (
        <progress max={state.total} value={state.done}>
          {state.done} of {state.total}
        </progress>
      )}
      {state.kind === "failed" && <span class="error">Download failed: {state.error}</span>}
    </div>
  );
}

export function Contest({ contest, send, live }: { contest: AdminContest; send: Send; live: boolean }) {
  const [full, setFull] = useState<PhotoId | null>(null);
  return (
    <section class="card contest" aria-labelledby="contest-title">
      <div class="contest-head">
        <h2 id="contest-title">Photo contest</h2>
        <Toggle label="Uploads" open={contest.uploads} live={live} onChange={(open) => send({ t: "uploads", open })} />
        <Toggle label="Voting" open={contest.voting} live={live} onChange={(open) => send({ t: "voting", open })} />
        <DownloadAll entrants={contest.entrants} />
      </div>
      <div class="contest-body">
        <div>
          <h3>Tally</h3>
          <Tally rows={contest.tally} view={setFull} />
        </div>
        <div>
          <h3>Every version</h3>
          <Versions entrants={contest.entrants} send={send} live={live} view={setFull} />
        </div>
      </div>
      {full && (
        <div class="viewer" role="dialog" aria-label="Full-size photo" onClick={() => setFull(null)}>
          <img src={photoUrl(full)} alt="" />
        </div>
      )}
    </section>
  );
}
