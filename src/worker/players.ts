import { nameKey, type PlayerId, type PlayerName } from "../shared/model";
import { newPlayerId } from "./auth";

export type Player = { id: PlayerId; name: string; createdAt: number };
export type JoinResult = { status: "joined"; id: PlayerId } | { status: "exists"; name: string } | { status: "closed" };
export type Roster = { roots: Player[]; rootOf: (id: PlayerId) => Player | undefined };

type PlayerRow = { id: PlayerId; name: string; merged_into: PlayerId | null; created_at: number };

const toPlayer = (row: PlayerRow): Player => ({ id: row.id, name: row.name, createdAt: row.created_at });

export class Players {
  constructor(private readonly sql: SqlStorage) {}

  resolve(id: PlayerId): Player | undefined {
    const [row] = this.sql
      .exec<PlayerRow>("SELECT * FROM players WHERE id = (SELECT coalesce(merged_into, id) FROM players WHERE id = ?)", id)
      .toArray();
    return row && toPlayer(row);
  }

  // A guest who lost their cookie can still reclaim their name after the party stops taking new guests.
  join(name: PlayerName, reclaim: boolean, open: boolean): JoinResult {
    const [match] = this.sql
      .exec<{ root: PlayerId }>("SELECT coalesce(merged_into, id) AS root FROM players WHERE name_key = ?", nameKey(name))
      .toArray();
    if (match) {
      const root = this.resolve(match.root)!;
      return reclaim ? { status: "joined", id: root.id } : { status: "exists", name: root.name };
    }
    if (!open) return { status: "closed" };
    const id = newPlayerId();
    this.sql.exec("INSERT INTO players (id, name, name_key, created_at) VALUES (?, ?, ?, ?)", id, name, nameKey(name), Date.now());
    return { status: "joined", id };
  }

  rename(id: PlayerId, name: PlayerName): string | null {
    const player = this.resolve(id);
    if (!player) return "That player no longer exists.";
    const taken = this.sql.exec("SELECT 1 FROM players WHERE name_key = ? AND id != ?", nameKey(name), player.id).toArray();
    if (taken.length > 0) return `"${name}" is already taken, possibly by a merged duplicate.`;
    this.sql.exec("UPDATE players SET name = ?, name_key = ? WHERE id = ?", name, nameKey(name), player.id);
    return null;
  }

  merge(from: PlayerId, into: PlayerId): string | null {
    const source = this.resolve(from);
    const target = this.resolve(into);
    if (!source || !target) return "That player no longer exists.";
    if (source.id === target.id) return "Those are already the same player.";
    this.sql.exec("UPDATE players SET merged_into = ? WHERE id = ? OR merged_into = ?", target.id, source.id, source.id);
    return null;
  }

  roster(): Roster {
    const rows = this.sql.exec<PlayerRow>("SELECT * FROM players ORDER BY created_at, id").toArray();
    const byId = new Map(rows.map((row) => [row.id, toPlayer(row)]));
    const rootIds = new Map(rows.map((row) => [row.id, row.merged_into ?? row.id]));
    return {
      roots: rows.filter((row) => row.merged_into === null).map((row) => byId.get(row.id)!),
      rootOf: (id) => {
        const root = rootIds.get(id);
        return root && byId.get(root);
      },
    };
  }
}
