import { useRef, useState } from "preact/hooks";
import type { GuestCmd, GuestContest, MyPhoto as Mine } from "../../shared/protocol";
import { photoUrl } from "../api";
import { CameraIcon, Snowflake, Sparkle } from "../icons";
import type { Progress, Uploader, Uploading } from "./use-upload";

export const votesText = (n: number) => (n === 1 ? "1 röst" : `${n} röster`);

const progressText: Record<Progress["phase"], string> = {
  preparing: "Gör i ordning bilden…",
  sending: "Skickar bilden…",
  waiting: "Anslutningen bröts. Bilden skickas igen så fort nätet är tillbaka.",
  stuck: "Bilden kom inte fram. Du behöver inte välja den igen, tryck bara på Försök igen.",
  done: "Klart!",
};

const percent = (p: Progress) =>
  p.phase === "done" ? 100 : p.phase === "sending" && p.total > 0 ? Math.round((p.sent / p.total) * 100) : 0;

function UploadingView({ upload, retry }: { upload: Uploading; retry: () => void }) {
  const { progress } = upload;
  const pct = percent(progress);
  const waiting = progress.phase === "waiting" || progress.phase === "stuck";
  return (
    <div class="photo-stage" aria-live="polite">
      <div class={waiting ? "photo-frame waiting" : "photo-frame"}>{upload.preview ? <img src={upload.preview} alt="Din bild" /> : <Snowflake />}</div>
      {!waiting && (
        <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Uppladdning">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      <p class={waiting ? "status-line calm" : "status-line"}>
        {progressText[progress.phase]}
        {progress.phase === "sending" && <strong> {pct}%</strong>}
      </p>
      {waiting && (
        <button class={progress.phase === "stuck" ? "btn" : "btn secondary"} type="button" onClick={retry}>
          Försök igen
        </button>
      )}
    </div>
  );
}

type Confirm = { kind: "none" } | { kind: "replace" } | { kind: "remove" };

function Uploaded({ mine, live, open, send }: { mine: Mine; live: boolean; open: () => void; send: (cmd: GuestCmd) => void }) {
  const [confirm, setConfirm] = useState<Confirm>({ kind: "none" });
  const cancel = () => setConfirm({ kind: "none" });
  const remove = () => {
    cancel();
    send({ t: "remove", photo: mine.id });
  };
  const goBack = mine.votes === 1 ? "går rösten tillbaka till den som röstade" : `går de ${mine.votes} rösterna tillbaka till dem som röstade`;

  return (
    <div class="photo-stage">
      <PhotoFrame mine={mine} />
      {mine.hidden ? (
        <p class="note">Kalasvärden har gömt bilden från galleriet. Byt gärna till en annan.</p>
      ) : (
        <VoteCount votes={mine.votes} />
      )}
      {confirm.kind === "none" && (
        <div class="photo-actions">
          <button class="btn" type="button" onClick={() => (mine.votes > 0 ? setConfirm({ kind: "replace" }) : open())}>
            Byt bild
          </button>
          <button class="btn secondary" type="button" disabled={!live} onClick={() => (mine.votes > 0 ? setConfirm({ kind: "remove" }) : remove())}>
            Ta bort
          </button>
        </div>
      )}
      {confirm.kind === "replace" && (
        <div class="confirm" role="alert">
          <p>
            Byter du bild flyttar den här till <strong>Hall of fame</strong> med sina {votesText(mine.votes)}.
          </p>
          <div class="photo-actions">
            <button class="btn" type="button" onClick={() => (cancel(), open())}>
              Välj ny bild
            </button>
            <button class="btn secondary" type="button" onClick={cancel}>
              Avbryt
            </button>
          </div>
        </div>
      )}
      {confirm.kind === "remove" && (
        <div class="confirm" role="alert">
          <p>Tar du bort bilden {goBack}.</p>
          <div class="photo-actions">
            <button class="btn danger" type="button" disabled={!live} onClick={remove}>
              Ta bort
            </button>
            <button class="btn secondary" type="button" onClick={cancel}>
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const VoteCount = ({ votes }: { votes: number }) => <p class="vote-count">{votes === 0 ? "Inga röster än" : `Din bild har ${votesText(votes)}`}</p>;

function PhotoFrame({ mine }: { mine: Mine }) {
  return (
    <div class="photo-frame">
      <img src={photoUrl(mine.id)} alt="Din bild" style={{ backgroundImage: `url(${photoUrl(mine.thumb)})` }} />
      <Sparkle class="sparkle a" />
      <Sparkle class="sparkle b" />
    </div>
  );
}

type View =
  | { kind: "uploading"; upload: Uploading }
  | { kind: "closed"; mine: Mine | null }
  | { kind: "empty" }
  | { kind: "uploaded"; mine: Mine };

function viewOf(contest: GuestContest, upload: Uploading | null): View {
  if (upload) return { kind: "uploading", upload };
  if (!contest.uploads) return { kind: "closed", mine: contest.mine };
  return contest.mine ? { kind: "uploaded", mine: contest.mine } : { kind: "empty" };
}

const fameText = (n: number) =>
  n === 1 ? "Din tidigare bild är kvar i Hall of fame och kan fortfarande vinna." : `Dina ${n} tidigare bilder är kvar i Hall of fame och kan fortfarande vinna.`;

export function MyPhotoPanel({ contest, upload, live, send }: { contest: GuestContest; upload: Uploader; live: boolean; send: (cmd: GuestCmd) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const open = () => picker.current?.click();
  const view = viewOf(contest, upload.current);

  return (
    <section class="panel card my-photo" aria-labelledby="panel-title">
      <h2 id="panel-title">Mitt foto</h2>
      {view.kind === "empty" && (
        <>
          <button class="drop-frame" type="button" onClick={open}>
            <CameraIcon />
            <span>Ladda upp din finaste bild med Dilara</span>
          </button>
          <button class="btn" type="button" onClick={open}>
            Välj bild
          </button>
          <p class="hint">Du kan byta bild när du vill.</p>
        </>
      )}
      {view.kind === "uploading" && <UploadingView upload={view.upload} retry={upload.retry} />}
      {view.kind === "uploaded" && <Uploaded mine={view.mine} live={live} open={open} send={send} />}
      {view.kind === "closed" && (
        <>
          {view.mine && (
            <div class="photo-stage">
              <PhotoFrame mine={view.mine} />
              <VoteCount votes={view.mine.votes} />
            </div>
          )}
          <p class="note">Uppladdningen är stängd. Tack för alla fina bilder!</p>
        </>
      )}
      {upload.error && (
        <p class="error" role="alert">
          {upload.error}
        </p>
      )}
      {contest.inFame > 0 && <p class="fame-line">{fameText(contest.inFame)}</p>}
      <input
        ref={picker}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) upload.pick(file);
        }}
      />
    </section>
  );
}
