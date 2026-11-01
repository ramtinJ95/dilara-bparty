import { useEffect, useState } from "preact/hooks";
import { VOTES_PER_GUEST } from "../../shared/model";
import type { GalleryPhoto, GuestCmd, GuestContest } from "../../shared/protocol";
import { photoUrl } from "../api";
import { GalleryIcon, Snowflake } from "../icons";

type Vote = { canVote: boolean; send: (cmd: GuestCmd) => void; votesLeft: number };

function VotePips({ left }: { left: number }) {
  return (
    <div class="pips" aria-hidden="true">
      {Array.from({ length: VOTES_PER_GUEST }, (_, i) => (
        <span key={i} class={i < left ? "pip on" : "pip"}>
          <Snowflake />
        </span>
      ))}
    </div>
  );
}

function Card({ photo, vote, view }: { photo: GalleryPhoto; vote: Vote; view: (p: GalleryPhoto) => void }) {
  return (
    <li class={photo.mine > 0 ? "tile voted" : "tile"}>
      <button class="thumb" type="button" aria-label={photo.own ? "Visa din bild" : "Visa bilden"} onClick={() => view(photo)}>
        <img src={photoUrl(photo.thumb)} alt="" loading="lazy" />
      </button>
      {photo.own ? (
        <p class="own">Din bild</p>
      ) : (
        <div class="votes">
          <button type="button" aria-label="Ta tillbaka en röst" disabled={!vote.canVote || photo.mine === 0} onClick={() => vote.send({ t: "unvote", photo: photo.id })}>
            −
          </button>
          <span class="mine" aria-label={`Dina röster: ${photo.mine}`}>
            <Snowflake />
            {photo.mine}
          </span>
          <button type="button" aria-label="Ge en röst" disabled={!vote.canVote || vote.votesLeft === 0} onClick={() => vote.send({ t: "vote", photo: photo.id })}>
            +
          </button>
        </div>
      )}
    </li>
  );
}

function Lightbox({ photo, close }: { photo: GalleryPhoto; close: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div class="lightbox" role="dialog" aria-modal="true" aria-label="Bild i stort format" onClick={close}>
      <img src={photoUrl(photo.id)} alt="" style={{ backgroundImage: `url(${photoUrl(photo.thumb)})` }} />
      <button class="btn secondary" type="button" onClick={close}>
        Stäng
      </button>
    </div>
  );
}

const leftText = (left: number) => (left === 0 ? "Alla röster är använda" : `${left} av ${VOTES_PER_GUEST} röster kvar`);

export function GalleryPanel({ contest, live, send, toMyPhoto }: { contest: GuestContest; live: boolean; send: (cmd: GuestCmd) => void; toMyPhoto: () => void }) {
  const [open, setOpen] = useState<GalleryPhoto | null>(null);
  const vote: Vote = { canVote: live && contest.voting, send, votesLeft: contest.votesLeft };
  const current = contest.gallery.filter((p) => !p.fame);
  const fame = contest.gallery.filter((p) => p.fame);
  const view = (p: GalleryPhoto) => setOpen(p);

  return (
    <section class="gallery" aria-labelledby="panel-title">
      <h2 id="panel-title">Galleri</h2>
      {contest.voting ? (
        <div class="votes-left card" role="status">
          <VotePips left={contest.votesLeft} />
          <div>
            <p class="left">{leftText(contest.votesLeft)}</p>
            <p class="hint">{contest.votesLeft === 0 ? "Tryck − för att flytta en röst." : "Ge bilderna du gillar mest en röst. Samma bild kan få flera."}</p>
          </div>
        </div>
      ) : (
        <p class="note card">Röstningen är stängd.</p>
      )}
      {current.length === 0 && fame.length === 0 ? (
        <div class="panel card">
          <GalleryIcon />
          <p>Inga bilder än.</p>
          <button class="btn secondary" type="button" onClick={toMyPhoto}>
            Ladda upp din bild
          </button>
        </div>
      ) : (
        <ul class="grid">
          {current.map((p) => (
            <Card key={p.id} photo={p} vote={vote} view={view} />
          ))}
        </ul>
      )}
      {fame.length > 0 && (
        <>
          <h3 class="fame-title">Hall of fame</h3>
          <p class="fame-text">Utbytta bilder som fick röster. De är kvar och kan fortfarande vinna.</p>
          <ul class="grid">
            {fame.map((p) => (
              <Card key={p.id} photo={p} vote={vote} view={view} />
            ))}
          </ul>
        </>
      )}
      {open && <Lightbox photo={open} close={() => setOpen(null)} />}
    </section>
  );
}
