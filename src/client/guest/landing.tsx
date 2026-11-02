import { useState } from "preact/hooks";
import type { JoinResponse } from "../../shared/api";
import { PLAYER_NAME_MAX } from "../../shared/model";
import { postJson } from "../api";
import { Snowflake, Tiara } from "../icons";
import { Cap, Drift, Icicles, Sheen } from "../ice";

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
      <h1 class="title">
        <span class="dilara">
          <Tiara />
          Dilara{" "}
        </span>
        <span class="line2">
          <span>fyller </span>
          <span class="three">
            <Cap />
            <Sheen />
            <span>3!</span>
          </span>
        </span>
      </h1>
      <p class="subtitle">Välkommen på kalaset</p>
      <div class="frame">
        <Cap />
        <div class="frame-inner">
          {photoId && !photoFailed ? (
            <img src={`/j/${secret}/photos/${photoId}`} alt="Dilara" onError={() => setPhotoFailed(true)} />
          ) : (
            <Snowflake />
          )}
        </div>
        <Sheen />
        <Icicles class="a" />
        <Icicles class="b" />
      </div>

      {step.kind === "name" ? (
        <form
          class="join"
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
          <button class="btn go" type="submit" disabled={busy || name.trim() === ""}>
            <Sheen />
            Gå med
          </button>
        </form>
      ) : (
        <section class="join card" aria-live="polite">
          <Cap />
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
      <Drift />
    </main>
  );
}
