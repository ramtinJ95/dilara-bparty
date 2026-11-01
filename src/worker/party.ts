import { DurableObject } from "cloudflare:workers";
import { parsePlayerName, PLAYER_NAME_MAX, type NameError, type PhotoId, type PlayerId, type PlayerName, type UploadKey } from "../shared/model";
import {
  HEARTBEATS,
  parseAdminCmd,
  parseGuestCmd,
  PING,
  PONG,
  TICK,
  type AdminCmd,
  type AdminCmdOf,
  type AdminState,
  type GuestCmd,
  type GuestCmdOf,
  type GuestState,
  type Heartbeat,
  type ServerMsg,
} from "../shared/protocol";
import type { GuestFinale } from "../shared/finale";
import type { AdminQuiz, QuizStep } from "../shared/quiz";
import { joinCode } from "./auth";
import { Finale } from "./finale";
import { adminContest, Contest, guestContest, guestMaySee, tally, type ContestSnapshot, type UploadResult } from "./contest";
import { PhotoStore, type PhotoUpload, type StoredPhoto } from "./photo-store";
import { Players, type JoinResult, type Roster } from "./players";
import { Quiz } from "./quiz";
import { migrate } from "./schema";
import { deleteSetting, putSetting, readSettings, type Settings } from "./settings";

export type SocketRole = { role: "guest"; playerId: PlayerId } | { role: "admin" };

export const SOCKET_ROLE_HEADER = "X-Party-Socket";

const LANDING_PHOTO = "landing_photo";
const LIVE_MODE = "live_mode";

const adminNameErrors: Record<NameError, string> = {
  empty: "Name can't be empty.",
  "control-chars": "Name contains characters that can't be used.",
  "too-long": `Name is too long (max ${PLAYER_NAME_MAX} characters).`,
};

type Tables = { players: Players; contest: Contest; quiz: Quiz; finale: Finale; setLiveMode: (on: boolean) => void };

// The fast heartbeat runs from unlock until the quiz ends or is reset; the admin toggle can still override it.
const liveModeAfter: Partial<Record<QuizStep, boolean>> = { unlock: true, end: false, reset: false };

type AdminHandlers = { [K in AdminCmd["t"]]: (tables: Tables, cmd: AdminCmdOf<K>) => string | null };

const adminCommands: AdminHandlers = {
  rename: ({ players }, { id, name }) => {
    const parsed = parsePlayerName(name);
    return parsed.ok ? players.rename(id, parsed.value) : adminNameErrors[parsed.error];
  },
  merge: ({ players, contest }, { from, into }) => {
    const merged = players.merge(from, into);
    if (!merged.ok) return merged.error;
    contest.merge(merged.value.from, merged.value.into);
    return null;
  },
  uploads: ({ contest }, { open }) => (contest.setOpen("uploads", open), null),
  voting: ({ contest }, { open }) => (contest.setOpen("voting", open), null),
  hide: ({ contest }, { photo, hidden }) => contest.hide(photo, hidden),
  "save-question": ({ quiz }, { id, body }) => quiz.save(id, body),
  "delete-question": ({ quiz }, { id }) => quiz.remove(id),
  "move-question": ({ quiz }, { id, to }) => quiz.move(id, to),
  quiz: ({ quiz, finale, setLiveMode }, { step }) => {
    if (finale.stage() !== "off") return "The finale has started, so the quiz can't change.";
    const error = quiz.step(step, Date.now());
    const live = liveModeAfter[step];
    if (!error && live !== undefined) setLiveMode(live);
    return error;
  },
  finale: ({ finale, quiz, contest, players }, { step }) => {
    const roster = players.roster();
    return finale.step(step, {
      quiz: quiz.publish(roster, new Set(), Date.now()).admin,
      tally: tally(contest.snapshot(), roster),
      closeVoting: () => contest.setOpen("voting", false),
    });
  },
  "pick-photo": ({ finale, contest, players }, { photo }) => finale.pick(photo, tally(contest.snapshot(), players.roster())),
  joins: ({ finale }, { open }) => (finale.setJoins(open), null),
  liveMode: ({ setLiveMode }, { on }) => (setLiveMode(on), null),
};

type GuestTables = Tables & { roster: Roster };

type GuestHandlers = { [K in GuestCmd["t"]]: (tables: GuestTables, player: PlayerId, cmd: GuestCmdOf<K>) => string | null };

const guestCommands: GuestHandlers = {
  vote: ({ contest }, player, { photo }) => contest.vote(player, photo),
  unvote: ({ contest }, player, { photo }) => contest.unvote(player, photo),
  remove: ({ contest }, player, { photo }) => contest.remove(player, photo),
  answer: ({ quiz, roster }, player, cmd) => quiz.answer(player, cmd, Date.now(), roster),
};

export type ContestUpload = UploadResult | { status: "no-player" };

export type GuestEntry = { joined: true } | { joined: false; landingPhoto: PhotoId | null };

function send<S>(ws: WebSocket, msg: ServerMsg<S>): void {
  ws.send(JSON.stringify(msg));
}

export class Party extends DurableObject<Env> {
  private readonly players: Players;
  private readonly photos: PhotoStore;
  private readonly contest: Contest;
  private readonly quiz: Quiz;
  private readonly finale: Finale;
  private code = "";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.players = new Players(ctx.storage.sql);
    this.photos = new PhotoStore(ctx.storage.sql);
    this.contest = new Contest(ctx.storage.sql, this.photos);
    this.quiz = new Quiz(ctx.storage);
    this.finale = new Finale(ctx.storage.kv);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    void ctx.blockConcurrencyWhile(async () => {
      migrate(ctx.storage);
      this.code = await joinCode(env.JOIN_SECRET);
    });
  }

  join(name: PlayerName, reclaim: boolean): JoinResult {
    const result = this.players.join(name, reclaim, this.finale.joinsOpen());
    if (result.status === "joined") this.broadcast();
    return result;
  }

  guestEntry(id: PlayerId | null): GuestEntry {
    if (id && this.players.resolve(id) !== undefined) return { joined: true };
    return { joined: false, landingPhoto: this.landingPhoto() };
  }

  private landingPhoto(settings: Settings = readSettings(this.ctx.storage.sql)): PhotoId | null {
    return (settings.get(LANDING_PHOTO) as PhotoId | undefined) ?? null;
  }

  setLandingPhoto(upload: PhotoUpload): PhotoId {
    const id = this.photos.put({ ...upload, kind: "landing", owner: null });
    putSetting(this.ctx.storage.sql, LANDING_PHOTO, id);
    this.broadcast();
    return id;
  }

  clearLandingPhoto(): void {
    deleteSetting(this.ctx.storage.sql, LANDING_PHOTO);
    this.broadcast();
  }

  addQuestionPhoto(upload: PhotoUpload): PhotoId {
    return this.photos.put({ ...upload, kind: "question", owner: null });
  }

  photo(id: PhotoId, cached: boolean): StoredPhoto | null {
    return this.photos.get(id, !cached);
  }

  guestPhoto(viewer: PlayerId, id: PhotoId, cached: boolean): StoredPhoto | null {
    if (this.finale.revealedPhoto(id)) return this.photos.get(id, !cached);
    const entry = this.contest.entryWith(id);
    if (!entry) return this.sharedPhoto(id, cached);
    const player = this.players.resolve(viewer);
    return player && guestMaySee(entry, player.id) ? this.photos.get(id, !cached) : null;
  }

  private sharedPhoto(id: PhotoId, cached: boolean): StoredPhoto | null {
    const photo = this.photos.get(id, false);
    const shared = photo?.kind === "landing" || (photo?.kind === "question" && this.quiz.photoStarted(id));
    if (!shared) return null;
    return cached ? photo : this.photos.get(id, true);
  }

  uploadContest(playerId: PlayerId, key: UploadKey, photo: PhotoUpload, thumb: PhotoUpload): ContestUpload {
    const player = this.players.resolve(playerId);
    if (!player) return { status: "no-player" };
    const result = this.ctx.storage.transactionSync(() => this.contest.upload(player.id, key, photo, thumb));
    if (result.status === "created") this.broadcast();
    return result;
  }

  // Every guest's next snapshot is "gone", so their phones leave for the neutral page.
  async wipe(): Promise<string | null> {
    if (this.finale.joinsOpen()) return "End the party before you wipe its data.";
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
    migrate(this.ctx.storage);
    this.broadcast();
    await this.schedule();
    return null;
  }

  // Only from an admin command: its broadcast carries the new heartbeat, and its schedule() moves the alarm.
  private setLiveMode(on: boolean): void {
    if (on === (this.heartbeat() === "fast")) return;
    if (on) putSetting(this.ctx.storage.sql, LIVE_MODE, "on");
    else deleteSetting(this.ctx.storage.sql, LIVE_MODE);
  }

  private heartbeat(settings: Settings = readSettings(this.ctx.storage.sql)): Heartbeat {
    return settings.has(LIVE_MODE) ? "fast" : "slow";
  }

  override async fetch(request: Request): Promise<Response> {
    const role = JSON.parse(request.headers.get(SOCKET_ROLE_HEADER)!) as SocketRole;
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(role);
    this.broadcast();
    await this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  // The tick lets phones notice a silent socket, and keeps idle connections open through Cloudflare's idle timeout and mobile NATs.
  override async alarm(): Promise<void> {
    const now = Date.now();
    let sockets = this.openSockets();
    for (const ws of sockets) ws.send(TICK);
    let wakeAt = this.quiz.wakeAt();
    // The broadcast may close the round and the sockets of guests who are gone, so both are read again after it.
    if ((wakeAt ?? Infinity) <= now) {
      this.broadcast();
      sockets = this.openSockets();
      wakeAt = this.quiz.wakeAt();
    }
    const next = this.nextWake(now, sockets.length > 0, wakeAt);
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }

  // The Durable Object has one alarm, shared by the tick and the open question's close.
  private nextWake(now: number, connected: boolean, wakeAt: number | null): number | null {
    const tick = connected ? now + HEARTBEATS[this.heartbeat()].tickMs : null;
    const wanted = [tick, wakeAt].filter((t) => t !== null);
    return wanted.length > 0 ? Math.min(...wanted) : null;
  }

  private async schedule(): Promise<void> {
    const next = this.nextWake(Date.now(), this.openSockets().length > 0, this.quiz.wakeAt());
    if (next === null) return;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > next) await this.ctx.storage.setAlarm(next);
  }

  private openSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN);
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const role = ws.deserializeAttachment() as SocketRole;
    // Guest commands never change the players, so one roster serves the command and its broadcast.
    const guest = role.role === "guest" ? { player: role.playerId, roster: this.players.roster() } : null;
    const error = this.ctx.storage.transactionSync(() =>
      guest ? this.guestCommand(guest.player, guest.roster, message) : this.adminCommand(message),
    );
    if (error) return send(ws, { t: "error", message: error });
    this.broadcast(guest?.roster);
    send(ws, { t: "ack" });
    if (!guest) await this.schedule();
  }

  private adminCommand(message: string): string | null {
    const cmd = parseAdminCmd(message);
    if (!cmd) return "Unknown command.";
    return (adminCommands[cmd.t] as (tables: Tables, cmd: AdminCmd) => string | null)(this.tables(), cmd);
  }

  private guestCommand(playerId: PlayerId, roster: Roster, message: string): string | null {
    const cmd = parseGuestCmd(message);
    if (!cmd) return "Det där gick inte, försök igen.";
    const player = roster.rootOf(playerId);
    if (!player) return "Det där gick inte, försök igen.";
    return (guestCommands[cmd.t] as (tables: GuestTables, player: PlayerId, cmd: GuestCmd) => string | null)(
      { ...this.tables(), roster },
      player.id,
      cmd,
    );
  }

  private tables(): Tables {
    return { players: this.players, contest: this.contest, quiz: this.quiz, finale: this.finale, setLiveMode: (on) => this.setLiveMode(on) };
  }

  override webSocketClose(ws: WebSocket): void {
    ws.close(1000);
    this.broadcast();
  }

  override webSocketError(): void {
    this.broadcast();
  }

  private broadcast(roster = this.players.roster()): void {
    const settings = readSettings(this.ctx.storage.sql);
    const sockets = this.openSockets();
    const roles = sockets.map((ws) => ws.deserializeAttachment() as SocketRole);
    const online = new Set(roles.flatMap((r) => (r.role === "guest" ? (roster.rootOf(r.playerId)?.id ?? []) : [])));
    const contest = this.contest.snapshot(settings);
    const quiz = this.quiz.publish(roster, online, Date.now());
    const finale = this.finale.guest(roster);
    const admin = this.adminState(roster, online, contest, quiz.admin, finale, settings);
    const heartbeat = this.heartbeat(settings);
    sockets.forEach((ws, i) => {
      const role = roles[i]!;
      if (role.role === "admin") return send(ws, { t: "state", state: admin, heartbeat });
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
        finale,
      };
      send(ws, { t: "state", state, heartbeat });
    });
  }

  private adminState(
    roster: Roster,
    online: Set<PlayerId>,
    snapshot: ContestSnapshot,
    quiz: AdminQuiz,
    finale: GuestFinale,
    settings: Settings,
  ): AdminState {
    const contest = adminContest(snapshot, roster);
    return {
      players: roster.roots.map((p) => ({ ...p, online: online.has(p.id) })),
      join: { secret: this.env.JOIN_SECRET, code: this.code },
      landingPhoto: this.landingPhoto(settings),
      contest,
      quiz,
      finale: this.finale.admin(finale, contest.tally),
    };
  }
}
