import { useState } from "preact/hooks";
import type { PlayerId } from "../../shared/model";
import type { AdminCmd, AdminPlayer } from "../../shared/protocol";
import { clockTime } from "./format";

type Mode = { kind: "idle" } | { kind: "rename"; id: PlayerId; draft: string } | { kind: "merge"; from: PlayerId; into: PlayerId | null };

export function Players({ players, send, live }: { players: AdminPlayer[]; send: (cmd: AdminCmd) => void; live: boolean }) {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const idle = () => setMode({ kind: "idle" });
  const online = players.filter((p) => p.online).length;
  const nameOf = (id: PlayerId | null) => players.find((p) => p.id === id)?.name ?? "";

  return (
    <section class="card players" aria-labelledby="players-title">
      <h2 id="players-title">
        Players <span class="count">{players.length}</span>
        <span class="muted"> · {online} online</span>
      </h2>
      {players.length === 0 && <p class="muted empty">Nobody has joined yet.</p>}
      <ul>
        {players.map((p) => (
          <li key={p.id} class={mode.kind === "merge" && mode.from === p.id ? "active" : undefined}>
            <span class={p.online ? "dot on" : "dot"} title={p.online ? "Online" : "Offline"} />
            {mode.kind === "rename" && mode.id === p.id ? (
              <form
                class="rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  send({ t: "rename", id: p.id, name: mode.draft });
                  idle();
                }}
              >
                <input
                  class="field"
                  value={mode.draft}
                  aria-label={`New name for ${p.name}`}
                  onInput={(e) => setMode({ ...mode, draft: e.currentTarget.value })}
                  onKeyDown={(e) => e.key === "Escape" && idle()}
                  autoFocus
                />
                <button class="btn small" type="submit" disabled={!live || mode.draft.trim() === ""}>
                  Save
                </button>
                <button class="btn small secondary" type="button" onClick={idle}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span class="name">{p.name}</span>
                <span class="muted when">joined {clockTime(p.createdAt)}</span>
                <span class="actions">
                  <button class="link" type="button" onClick={() => setMode({ kind: "rename", id: p.id, draft: p.name })}>
                    Rename
                  </button>
                  {players.length > 1 && (
                    <button class="link" type="button" onClick={() => setMode({ kind: "merge", from: p.id, into: null })}>
                      Merge…
                    </button>
                  )}
                </span>
              </>
            )}
            {mode.kind === "merge" && mode.from === p.id && (
              <div class="merge">
                <label>
                  <span>
                    Merge <strong>{p.name}</strong> into
                  </span>
                  <select
                    class="field"
                    value={mode.into ?? ""}
                    onChange={(e) => setMode({ ...mode, into: (e.currentTarget.value || null) as PlayerId | null })}
                  >
                    <option value="">Choose the player to keep…</option>
                    {players
                      .filter((o) => o.id !== p.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                </label>
                {mode.into && (
                  <p class="warning">
                    “{p.name}” disappears and everything of theirs moves to “{nameOf(mode.into)}”. This can't be undone.
                  </p>
                )}
                <div class="row">
                  <button
                    class="btn small danger"
                    type="button"
                    disabled={!live || !mode.into}
                    onClick={() => {
                      if (mode.into) send({ t: "merge", from: p.id, into: mode.into });
                      idle();
                    }}
                  >
                    Confirm merge
                  </button>
                  <button class="btn small secondary" type="button" onClick={idle}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
