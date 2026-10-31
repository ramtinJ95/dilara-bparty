import { useState } from "preact/hooks";
import type { JoinResponse } from "../../shared/api";
import { PLAYER_NAME_MAX } from "../../shared/model";
import { postJson } from "../api";
import { Snowflake, Sparkle, Tiara } from "../icons";

type Step = { kind: "name"; error: string | null } | { kind: "is-it-you"; existing: string };

export function Landing({ secret, photoId }: { secret: string; photoId: string | null }) {
  const [name, setName] = useState("");
  const [step, setStep] = useState<Step>({ kind: "name", error: null });
  const [busy, setBusy] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  async function join(reclaim: boolean) {
    setBusy(true);
    const res = await postJson<JoinResponse>("/api/join", { secret, name, reclaim });
    if (!res.ok) {
      setBusy(false);
      return setStep({ kind: "name", error: res.error });
    }
    const joined = res.data;
    if (joined.status === "joined") return location.replace("/app");
    setBusy(false);
    setStep({ kind: "is-it-you", existing: joined.name });
  }

  function backToName() {
    setStep({ kind: "name", error: null });
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#name")?.select());
  }

  return (
    <main class="landing">
      <Tiara />
      <h1 class="title">Dilara fyller 3!</h1>
      <p class="subtitle">Välkommen på kalaset</p>
      <div class="frame">
        <div class="frame-inner">
          {photoId && !photoFailed ? (
            <img src={`/j/${secret}/photos/${photoId}`} alt="Dilara" onError={() => setPhotoFailed(true)} />
          ) : (
            <Snowflake />
          )}
        </div>
        <Sparkle class="sparkle a" />
        <Sparkle class="sparkle b" />
        <Sparkle class="sparkle c" />
      </div>

      {step.kind === "name" ? (
        <form
          class="join card"
          onSubmit={(e) => {
            e.preventDefault();
            void join(false);
          }}
        >
          <label for="name">Vad heter du?</label>
          <input
            id="name"
            class="field"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="Ditt namn"
            autocomplete="given-name"
            maxLength={PLAYER_NAME_MAX}
            enterKeyHint="go"
          />
          {step.error && (
            <p class="error" role="alert">
              {step.error}
            </p>
          )}
          <button class="btn" type="submit" disabled={busy || name.trim() === ""}>
            Gå med
          </button>
        </form>
      ) : (
        <section class="join card" aria-live="polite">
          <h2>Är det du?</h2>
          <p class="existing">
            Någon har redan gått med som
            <strong>{step.existing}</strong>
          </p>
          <button class="btn" type="button" disabled={busy} onClick={() => void join(true)}>
            Ja, det är jag
          </button>
          <button class="btn secondary" type="button" disabled={busy} onClick={backToName}>
            Nej, byt namn
          </button>
        </section>
      )}
    </main>
  );
}
