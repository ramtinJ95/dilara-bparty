import { DurableObject } from "cloudflare:workers";
import { parsePlayerName, type NameError, type PhotoId, type PlayerId, type PlayerName, type UploadKey } from "../shared/model";
import {
  parseAdminCmd,
  parseGuestCmd,
  PING,
  PONG,
  type AdminCmd,
  type AdminCmdOf,
  type AdminState,
  type GuestCmd,
  type GuestCmdOf,
  type GuestState,
  type ServerMsg,
  type TallyRow,
} from "../shared/protocol";
import { joinCode } from "./auth";
import { adminContest, Contest, guestContest, guestMaySee, tally, type ContestSnapshot, type UploadResult } from "./contest";
import { PhotoStore, type PhotoUpload, type StoredPhoto } from "./photo-store";
import { Players, type JoinResult, type Roster } from "./players";
import { migrate } from "./schema";

export type SocketRole = { role: "guest"; playerId: PlayerId } | { role: "admin" };

export const SOCKET_ROLE_HEADER = "X-Party-Socket";

const LANDING_PHOTO = "landing_photo";

const adminNameErrors: Record<NameError, string> = {
  empty: "Name can't be empty.",
  "control-chars": "Name contains characters that can't be used.",
  "too-long": "Name is too long (max 30 characters).",
};

type Tables = { players: Players; contest: Contest };

type AdminHandlers = { [K in AdminCmd["t"]]: (tables: Tables, cmd: AdminCmdOf<K>) => string | null };

const adminCommands: AdminHandlers = {
  rename: ({ players }, { id, name }) => {
    const parsed = parsePlayerName(name);
    return parsed.ok ? players.rename(id, parsed.value) : adminNameErrors[parsed.error];
  },
  merge: ({ players, contest }, { from, into }) => {
    const source = players.resolve(from);
    const target = players.resolve(into);
    const error = players.merge(from, into);
    if (!error) contest.merge(source!.id, target!.id);
    return error;
  },
  uploads: ({ contest }, { open }) => (contest.setOpen("uploads", open), null),
  voting: ({ contest }, { open }) => (contest.setOpen("voting", open), null),
  hide: ({ contest }, { photo, hidden }) => contest.hide(photo, hidden),
};

type GuestHandlers = { [K in GuestCmd["t"]]: (contest: Contest, player: PlayerId, cmd: GuestCmdOf<K>) => string | null };

const guestCommands: GuestHandlers = {
  vote: (contest, player, { photo }) => contest.vote(player, photo),
  unvote: (contest, player, { photo }) => contest.unvote(player, photo),
  remove: (contest, player, { photo }) => contest.remove(player, photo),
};

export type ContestUpload = UploadResult | { status: "no-player" };

function send<S>(ws: WebSocket, msg: ServerMsg<S>): void {
  ws.send(JSON.stringify(msg));
}

export class Party extends DurableObject<Env> {
  private readonly players: Players;
  private readonly photos: PhotoStore;
  private readonly contest: Contest;
  private code = "";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.players = new Players(ctx.storage.sql);
    this.photos = new PhotoStore(ctx.storage.sql);
    this.contest = new Contest(ctx.storage.sql, this.photos);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    void ctx.blockConcurrencyWhile(async () => {
      migrate(ctx.storage);
      this.code = await joinCode(env.JOIN_SECRET);
    });
  }

  join(name: PlayerName, reclaim: boolean): JoinResult {
    const result = this.players.join(name, reclaim);
    if (result.status === "joined") this.broadcast();
    return result;
  }

  playerExists(id: PlayerId): boolean {
    return this.players.resolve(id) !== undefined;
  }

  landingPhoto(): PhotoId | null {
    const [row] = this.ctx.storage.sql.exec<{ value: PhotoId }>("SELECT value FROM settings WHERE key = ?", LANDING_PHOTO).toArray();
    return row?.value ?? null;
  }

  setLandingPhoto(upload: PhotoUpload): PhotoId {
    const id = this.photos.put({ ...upload, kind: "landing", owner: null });
    this.ctx.storage.sql.exec(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      LANDING_PHOTO,
      id,
    );
    this.broadcast();
    return id;
  }

  clearLandingPhoto(): void {
    this.ctx.storage.sql.exec("DELETE FROM settings WHERE key = ?", LANDING_PHOTO);
    this.broadcast();
  }

  photo(id: PhotoId): StoredPhoto | null {
    return this.photos.get(id);
  }

  guestPhoto(viewer: PlayerId, id: PhotoId): StoredPhoto | null {
    const entry = this.contest.entry(id);
    if (!entry) return this.landingPhotoBytes(id);
    const player = this.players.resolve(viewer);
    return player && guestMaySee(entry, player.id) ? this.photos.get(id) : null;
  }

  private landingPhotoBytes(id: PhotoId): StoredPhoto | null {
    const photo = this.photos.get(id);
    return photo?.kind === "landing" ? photo : null;
  }

  uploadContest(playerId: PlayerId, key: UploadKey, photo: PhotoUpload, thumb: PhotoUpload): ContestUpload {
    const player = this.players.resolve(playerId);
    if (!player) return { status: "no-player" };
    const result = this.ctx.storage.transactionSync(() => this.contest.upload(player.id, key, photo, thumb));
    if (result.status === "created") this.broadcast();
    return result;
  }

  tally(): TallyRow[] {
    return tally(this.contest.snapshot(), this.players.roster());
  }

  override fetch(request: Request): Response {
    const role = JSON.parse(request.headers.get(SOCKET_ROLE_HEADER)!) as SocketRole;
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(role);
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string") return;
    const role = ws.deserializeAttachment() as SocketRole;
    const error = this.ctx.storage.transactionSync(() =>
      role.role === "admin" ? this.adminCommand(message) : this.guestCommand(role.playerId, message),
    );
    if (error) return send(ws, { t: "error", message: error });
    this.broadcast();
  }

  private adminCommand(message: string): string | null {
    const cmd = parseAdminCmd(message);
    if (!cmd) return "Unknown command.";
    const tables = { players: this.players, contest: this.contest };
    return (adminCommands[cmd.t] as (tables: Tables, cmd: AdminCmd) => string | null)(tables, cmd);
  }

  private guestCommand(playerId: PlayerId, message: string): string | null {
    const cmd = parseGuestCmd(message);
    if (!cmd) return "Det där gick inte, försök igen.";
    const player = this.players.resolve(playerId);
    if (!player) return "Det där gick inte, försök igen.";
    return (guestCommands[cmd.t] as (contest: Contest, player: PlayerId, cmd: GuestCmd) => string | null)(this.contest, player.id, cmd);
  }

  override webSocketClose(ws: WebSocket): void {
    ws.close(1000);
    this.broadcast(ws);
  }

  override webSocketError(ws: WebSocket): void {
    this.broadcast(ws);
  }

  private broadcast(closing?: WebSocket): void {
    const roster = this.players.roster();
    const sockets = this.ctx.getWebSockets().filter((ws) => ws !== closing);
    const roles = sockets.map((ws) => ws.deserializeAttachment() as SocketRole);
    const online = new Set(roles.flatMap((r) => (r.role === "guest" ? (roster.rootOf(r.playerId)?.id ?? []) : [])));
    const contest = this.contest.snapshot();
    const admin = this.adminState(roster, online, contest);
    sockets.forEach((ws, i) => {
      const role = roles[i]!;
      if (role.role === "admin") return send(ws, { t: "state", state: admin });
      const you = roster.rootOf(role.playerId);
      if (!you) {
        send(ws, { t: "gone" });
        return ws.close(4004, "gone");
      }
      const state: GuestState = { you: { id: you.id, name: you.name }, online: online.size, contest: guestContest(contest, you.id) };
      send(ws, { t: "state", state });
    });
  }

  private adminState(roster: Roster, online: Set<PlayerId>, contest: ContestSnapshot): AdminState {
    return {
      players: roster.roots.map((p) => ({ ...p, online: online.has(p.id) })),
      join: { secret: this.env.JOIN_SECRET, code: this.code },
      landingPhoto: this.landingPhoto(),
      contest: adminContest(contest, roster),
    };
  }
}
