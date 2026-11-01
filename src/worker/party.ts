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
import type { AdminQuiz } from "../shared/quiz";
import { joinCode } from "./auth";
import { adminContest, Contest, guestContest, guestMaySee, tally, type ContestSnapshot, type UploadResult } from "./contest";
import { PhotoStore, type PhotoUpload, type StoredPhoto } from "./photo-store";
import { Players, type JoinResult, type Roster } from "./players";
import { Quiz } from "./quiz";
import { migrate } from "./schema";

export type SocketRole = { role: "guest"; playerId: PlayerId } | { role: "admin" };
type SocketTag = SocketRole & { openedAt: number };

export const SOCKET_ROLE_HEADER = "X-Party-Socket";

const LANDING_PHOTO = "landing_photo";

// Phones ping every 5 s (src/client/live.ts). Checking every 4 s marks a silent phone offline within 15 s.
const SILENT_AFTER_MS = 11_000;
const CHECK_EVERY_MS = 4_000;

const adminNameErrors: Record<NameError, string> = {
  empty: "Name can't be empty.",
  "control-chars": "Name contains characters that can't be used.",
  "too-long": "Name is too long (max 30 characters).",
};

type Tables = { players: Players; contest: Contest; quiz: Quiz };

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
  "save-question": ({ quiz }, { id, body }) => quiz.save(id, body),
  "delete-question": ({ quiz }, { id }) => quiz.remove(id),
  "move-question": ({ quiz }, { id, to }) => quiz.move(id, to),
  quiz: ({ quiz }, { step }) => quiz.step(step, Date.now()),
};

type GuestHandlers = { [K in GuestCmd["t"]]: (tables: Tables, player: PlayerId, cmd: GuestCmdOf<K>) => string | null };

const guestCommands: GuestHandlers = {
  vote: ({ contest }, player, { photo }) => contest.vote(player, photo),
  unvote: ({ contest }, player, { photo }) => contest.unvote(player, photo),
  remove: ({ contest }, player, { photo }) => contest.remove(player, photo),
  answer: ({ quiz, players }, player, cmd) => quiz.answer(player, cmd, Date.now(), players.roster()),
};

export type ContestUpload = UploadResult | { status: "no-player" };

function send<S>(ws: WebSocket, msg: ServerMsg<S>): void {
  ws.send(JSON.stringify(msg));
}

export class Party extends DurableObject<Env> {
  private readonly players: Players;
  private readonly photos: PhotoStore;
  private readonly contest: Contest;
  private readonly quiz: Quiz;
  private code = "";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.players = new Players(ctx.storage.sql);
    this.photos = new PhotoStore(ctx.storage.sql);
    this.contest = new Contest(ctx.storage.sql, this.photos);
    this.quiz = new Quiz(ctx.storage);
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

  addQuestionPhoto(upload: PhotoUpload): PhotoId {
    return this.photos.put({ ...upload, kind: "question", owner: null });
  }

  photo(id: PhotoId): StoredPhoto | null {
    return this.photos.get(id);
  }

  guestPhoto(viewer: PlayerId, id: PhotoId): StoredPhoto | null {
    const entry = this.contest.entry(id);
    if (!entry) return this.sharedPhoto(id);
    const player = this.players.resolve(viewer);
    return player && guestMaySee(entry, player.id) ? this.photos.get(id) : null;
  }

  private sharedPhoto(id: PhotoId): StoredPhoto | null {
    const photo = this.photos.get(id);
    if (photo?.kind === "landing") return photo;
    return photo?.kind === "question" && this.quiz.photoStarted(id) ? photo : null;
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

  override async fetch(request: Request): Promise<Response> {
    const role = JSON.parse(request.headers.get(SOCKET_ROLE_HEADER)!) as SocketRole;
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ ...role, openedAt: Date.now() } satisfies SocketTag);
    this.broadcast();
    await this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    const sockets = this.openSockets();
    const silent = sockets.filter((ws) => now - this.lastHeard(ws) > SILENT_AFTER_MS);
    for (const ws of silent) ws.close(4008, "silent");
    const due = (this.quiz.wakeAt() ?? Infinity) <= now;
    if (silent.length > 0 || due) this.broadcast();
    const next = this.nextWake(now);
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }

  // The Durable Object has one alarm, shared by the liveness check and the open question's close.
  private nextWake(now: number): number | null {
    const wanted = [this.openSockets().length > 0 ? now + CHECK_EVERY_MS : null, this.quiz.wakeAt()].filter((t) => t !== null);
    return wanted.length > 0 ? Math.min(...wanted) : null;
  }

  private async schedule(): Promise<void> {
    const next = this.nextWake(Date.now());
    if (next === null) return;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > next) await this.ctx.storage.setAlarm(next);
  }

  private lastHeard(ws: WebSocket): number {
    const { openedAt } = ws.deserializeAttachment() as SocketTag;
    return Math.max(openedAt, this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0);
  }

  private openSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN);
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const role = ws.deserializeAttachment() as SocketRole;
    const error = this.ctx.storage.transactionSync(() =>
      role.role === "admin" ? this.adminCommand(message) : this.guestCommand(role.playerId, message),
    );
    if (error) return send(ws, { t: "error", message: error });
    this.broadcast();
    if (role.role === "admin") await this.schedule();
  }

  private adminCommand(message: string): string | null {
    const cmd = parseAdminCmd(message);
    if (!cmd) return "Unknown command.";
    return (adminCommands[cmd.t] as (tables: Tables, cmd: AdminCmd) => string | null)(this.tables(), cmd);
  }

  private guestCommand(playerId: PlayerId, message: string): string | null {
    const cmd = parseGuestCmd(message);
    if (!cmd) return "Det där gick inte, försök igen.";
    const player = this.players.resolve(playerId);
    if (!player) return "Det där gick inte, försök igen.";
    return (guestCommands[cmd.t] as (tables: Tables, player: PlayerId, cmd: GuestCmd) => string | null)(this.tables(), player.id, cmd);
  }

  private tables(): Tables {
    return { players: this.players, contest: this.contest, quiz: this.quiz };
  }

  override webSocketClose(ws: WebSocket): void {
    ws.close(1000);
    this.broadcast();
  }

  override webSocketError(): void {
    this.broadcast();
  }

  private broadcast(): void {
    const roster = this.players.roster();
    const sockets = this.openSockets();
    const roles = sockets.map((ws) => ws.deserializeAttachment() as SocketRole);
    const online = new Set(roles.flatMap((r) => (r.role === "guest" ? (roster.rootOf(r.playerId)?.id ?? []) : [])));
    const contest = this.contest.snapshot();
    const quiz = this.quiz.publish(roster, online, Date.now());
    const admin = this.adminState(roster, online, contest, quiz.admin);
    sockets.forEach((ws, i) => {
      const role = roles[i]!;
      if (role.role === "admin") return send(ws, { t: "state", state: admin });
      const you = roster.rootOf(role.playerId);
      if (!you) {
        send(ws, { t: "gone" });
        return ws.close(4004, "gone");
      }
      const state: GuestState = {
        you: { id: you.id, name: you.name },
        online: online.size,
        contest: guestContest(contest, you.id),
        quiz: quiz.guest(you.id),
      };
      send(ws, { t: "state", state });
    });
  }

  private adminState(roster: Roster, online: Set<PlayerId>, contest: ContestSnapshot, quiz: AdminQuiz): AdminState {
    return {
      players: roster.roots.map((p) => ({ ...p, online: online.has(p.id) })),
      join: { secret: this.env.JOIN_SECRET, code: this.code },
      landingPhoto: this.landingPhoto(),
      contest: adminContest(contest, roster),
      quiz,
    };
  }
}
