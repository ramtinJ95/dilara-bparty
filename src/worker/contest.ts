import { VOTES_PER_GUEST, type PhotoId, type PlayerId, type UploadKey } from "../shared/model";
import type { AdminContest, EntryStatus, GuestContest, TallyRow } from "../shared/protocol";
import type { PhotoStore, PhotoUpload } from "./photo-store";
import type { Roster } from "./players";

export type Entry = {
  photo: PhotoId;
  thumb: PhotoId;
  owner: PlayerId;
  status: EntryStatus;
  hidden: boolean;
  createdAt: number;
  votes: number;
  inGallery: boolean;
};

export type ContestSnapshot = {
  uploads: boolean;
  voting: boolean;
  entries: Entry[];
  ballots: Map<PlayerId, Map<PhotoId, number>>;
};

export type UploadResult = { status: "created" | "replayed"; id: PhotoId } | { status: "closed" | "conflict" };

type EntryRow = {
  photo: PhotoId;
  thumb: PhotoId;
  owner: PlayerId;
  status: EntryStatus;
  hidden: number;
  created_at: number;
  votes: number;
};

const ENTRY_SELECT = `SELECT e.photo, e.thumb, e.owner, e.status, e.hidden, e.created_at,
  (SELECT count(*) FROM votes v WHERE v.photo = e.photo) AS votes FROM entries e`;

function toEntry(row: EntryRow): Entry {
  const hidden = row.hidden !== 0;
  return {
    photo: row.photo,
    thumb: row.thumb,
    owner: row.owner,
    status: row.status,
    hidden,
    createdAt: row.created_at,
    votes: row.votes,
    inGallery: !hidden && (row.status === "current" || (row.status === "replaced" && row.votes > 0)),
  };
}

const isFame = (e: Entry) => e.inGallery && e.status === "replaced";

const SETTINGS = { uploads: "contest_uploads_open", voting: "contest_voting_open" } as const;
type Setting = keyof typeof SETTINGS;

export class Contest {
  constructor(
    private readonly sql: SqlStorage,
    private readonly photos: PhotoStore,
  ) {}

  isOpen(setting: Setting): boolean {
    const [row] = this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = ?", SETTINGS[setting]).toArray();
    return row?.value !== "0";
  }

  setOpen(setting: Setting, open: boolean): void {
    this.sql.exec(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      SETTINGS[setting],
      open ? "1" : "0",
    );
  }

  entry(photo: PhotoId): Entry | undefined {
    const [row] = this.sql.exec<EntryRow>(`${ENTRY_SELECT} WHERE e.photo = ?`, photo).toArray();
    return row && toEntry(row);
  }

  entryWith(photoOrThumb: PhotoId): Entry | undefined {
    const [row] = this.sql.exec<EntryRow>(`${ENTRY_SELECT} WHERE e.photo = ? OR e.thumb = ?`, photoOrThumb, photoOrThumb).toArray();
    return row && toEntry(row);
  }

  upload(owner: PlayerId, key: UploadKey, photo: PhotoUpload, thumb: PhotoUpload): UploadResult {
    const [used] = this.sql.exec<{ photo: PhotoId; owner: PlayerId }>("SELECT photo, owner FROM entries WHERE upload_key = ?", key).toArray();
    if (used) return used.owner === owner ? { status: "replayed", id: used.photo } : { status: "conflict" };
    if (!this.isOpen("uploads")) return { status: "closed" };
    const id = this.photos.put({ ...photo, kind: "contest", owner });
    const thumbId = this.photos.put({ ...thumb, kind: "thumb", owner });
    this.sql.exec("UPDATE entries SET status = 'replaced' WHERE owner = ? AND status = 'current'", owner);
    this.sql.exec(
      "INSERT INTO entries (photo, thumb, owner, status, upload_key, created_at) VALUES (?, ?, ?, 'current', ?, ?)",
      id, thumbId, owner, key, Date.now(),
    );
    return { status: "created", id };
  }

  vote(voter: PlayerId, photo: PhotoId): string | null {
    if (!this.isOpen("voting")) return "Röstningen är stängd.";
    const entry = this.entry(photo);
    if (!entry?.inGallery) return "Den bilden finns inte i galleriet längre.";
    if (entry.owner === voter) return "Du kan inte rösta på din egen bild.";
    const [used] = this.sql.exec<{ n: number }>("SELECT count(*) AS n FROM votes WHERE voter = ?", voter).toArray();
    if (used!.n >= VOTES_PER_GUEST) return "Du har inga röster kvar.";
    this.sql.exec("INSERT INTO votes (voter, photo) VALUES (?, ?)", voter, photo);
    return null;
  }

  unvote(voter: PlayerId, photo: PhotoId): string | null {
    if (!this.isOpen("voting")) return "Röstningen är stängd.";
    const [newest] = this.sql
      .exec<{ id: number }>("SELECT id FROM votes WHERE voter = ? AND photo = ? ORDER BY id DESC LIMIT 1", voter, photo)
      .toArray();
    if (!newest) return "Du har ingen röst på den bilden.";
    this.sql.exec("DELETE FROM votes WHERE id = ?", newest.id);
    return null;
  }

  remove(owner: PlayerId, photo: PhotoId): string | null {
    if (!this.isOpen("uploads")) return "Uppladdningen är stängd.";
    const entry = this.entry(photo);
    if (entry?.owner !== owner || entry.status !== "current") return "Bilden är redan borttagen.";
    this.sql.exec("UPDATE entries SET status = 'removed' WHERE photo = ?", photo);
    this.sql.exec("DELETE FROM votes WHERE photo = ?", photo);
    return null;
  }

  hide(photo: PhotoId, hidden: boolean): string | null {
    const entry = this.entry(photo);
    if (!entry) return "That photo isn't in the contest.";
    this.sql.exec("UPDATE entries SET hidden = ? WHERE photo = ?", hidden ? 1 : 0, photo);
    if (hidden) this.sql.exec("DELETE FROM votes WHERE photo = ?", photo);
    return null;
  }

  merge(from: PlayerId, into: PlayerId): void {
    const [both] = this.sql
      .exec<{ n: number }>("SELECT count(*) AS n FROM entries WHERE owner IN (?, ?) AND status = 'current'", from, into)
      .toArray();
    if (both!.n === 2) this.sql.exec("UPDATE entries SET status = 'replaced' WHERE owner = ? AND status = 'current'", from);
    this.sql.exec("UPDATE entries SET owner = ? WHERE owner = ?", into, from);
    this.sql.exec("UPDATE votes SET voter = ? WHERE voter = ?", into, from);
    this.sql.exec("DELETE FROM votes WHERE voter = ? AND photo IN (SELECT photo FROM entries WHERE owner = ?)", into, into);
    this.sql.exec(
      "DELETE FROM votes WHERE voter = ? AND id NOT IN (SELECT id FROM votes WHERE voter = ? ORDER BY id LIMIT ?)",
      into, into, VOTES_PER_GUEST,
    );
  }

  snapshot(): ContestSnapshot {
    const entries = this.sql.exec<EntryRow>(`${ENTRY_SELECT} ORDER BY e.created_at, e.rowid`).toArray().map(toEntry);
    const ballots = new Map<PlayerId, Map<PhotoId, number>>();
    const rows = this.sql.exec<{ voter: PlayerId; photo: PhotoId; n: number }>(
      "SELECT voter, photo, count(*) AS n FROM votes GROUP BY voter, photo",
    );
    for (const { voter, photo, n } of rows) {
      const ballot = ballots.get(voter) ?? new Map<PhotoId, number>();
      ballots.set(voter, ballot.set(photo, n));
    }
    return { uploads: this.isOpen("uploads"), voting: this.isOpen("voting"), entries, ballots };
  }
}

export const guestMaySee = (entry: Entry, viewer: PlayerId) =>
  entry.inGallery || (entry.owner === viewer && entry.status === "current");

export function guestContest(snap: ContestSnapshot, viewer: PlayerId): GuestContest {
  const ballot = snap.ballots.get(viewer) ?? new Map<PhotoId, number>();
  const mine = snap.entries.find((e) => e.owner === viewer && e.status === "current");
  let used = 0;
  for (const n of ballot.values()) used += n;
  return {
    uploads: snap.uploads,
    voting: snap.voting,
    votesLeft: VOTES_PER_GUEST - used,
    mine: mine ? { id: mine.photo, thumb: mine.thumb, votes: mine.votes, hidden: mine.hidden } : null,
    inFame: snap.entries.filter((e) => e.owner === viewer && isFame(e)).length,
    gallery: snap.entries
      .filter((e) => e.inGallery)
      .map((e) => ({ id: e.photo, thumb: e.thumb, fame: isFame(e), own: e.owner === viewer, mine: ballot.get(e.photo) ?? 0 })),
  };
}

export function tally(snap: ContestSnapshot, roster: Roster): TallyRow[] {
  const ranked = snap.entries.filter((e) => e.inGallery).sort((a, b) => b.votes - a.votes);
  return ranked.map((e) => ({
    photo: e.photo,
    thumb: e.thumb,
    player: e.owner,
    name: roster.rootOf(e.owner)?.name ?? "",
    votes: e.votes,
    rank: 1 + ranked.filter((other) => other.votes > e.votes).length,
    fame: isFame(e),
  }));
}

export function adminContest(snap: ContestSnapshot, roster: Roster): AdminContest {
  const entrants = roster.roots.flatMap((player) => {
    const versions = snap.entries
      .filter((e) => e.owner === player.id)
      .map((e) => ({
        id: e.photo,
        thumb: e.thumb,
        status: e.status,
        hidden: e.hidden,
        inGallery: e.inGallery,
        votes: e.votes,
        createdAt: e.createdAt,
      }));
    return versions.length > 0 ? [{ player: player.id, name: player.name, versions }] : [];
  });
  return { uploads: snap.uploads, voting: snap.voting, tally: tally(snap, roster), entrants };
}
