import { DurableObject } from "cloudflare:workers";
import { parsePlayerName, type NameError, type PlayerId, type PlayerName } from "../shared/model";
import { parseAdminCmd, PING, PONG, type AdminCmd, type AdminCmdOf, type AdminState, type GuestState, type ServerMsg } from "../shared/protocol";
import { joinCode } from "./auth";
import { Players, type JoinResult, type Roster } from "./players";
import { migrate } from "./schema";

export type SocketRole = { role: "guest"; playerId: PlayerId } | { role: "admin" };

export const SOCKET_ROLE_HEADER = "X-Party-Socket";

const adminNameErrors: Record<NameError, string> = {
  empty: "Name can't be empty.",
  "control-chars": "Name contains characters that can't be used.",
  "too-long": "Name is too long (max 30 characters).",
};

type CommandHandlers = { [K in AdminCmd["t"]]: (players: Players, cmd: AdminCmdOf<K>) => string | null };

const commands: CommandHandlers = {
  rename: (players, { id, name }) => {
    const parsed = parsePlayerName(name);
    return parsed.ok ? players.rename(id, parsed.value) : adminNameErrors[parsed.error];
  },
  merge: (players, { from, into }) => players.merge(from, into),
};

function send<S>(ws: WebSocket, msg: ServerMsg<S>): void {
  ws.send(JSON.stringify(msg));
}

export class Party extends DurableObject<Env> {
  private readonly players: Players;
  private code = "";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.players = new Players(ctx.storage.sql);
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

  override fetch(request: Request): Response {
    const role = JSON.parse(request.headers.get(SOCKET_ROLE_HEADER)!) as SocketRole;
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(role);
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const role = ws.deserializeAttachment() as SocketRole;
    if (role.role !== "admin" || typeof message !== "string") return;
    const cmd = parseAdminCmd(message);
    if (!cmd) return send(ws, { t: "error", message: "Unknown command." });
    const error = (commands[cmd.t] as (players: Players, cmd: AdminCmd) => string | null)(this.players, cmd);
    if (error) return send(ws, { t: "error", message: error });
    this.broadcast();
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
    const admin = this.adminState(roster, online);
    sockets.forEach((ws, i) => {
      const role = roles[i]!;
      if (role.role === "admin") return send(ws, { t: "state", state: admin });
      const you = roster.rootOf(role.playerId);
      if (!you) {
        send(ws, { t: "gone" });
        return ws.close(4004, "gone");
      }
      send<GuestState>(ws, { t: "state", state: { you: { id: you.id, name: you.name }, online: online.size } });
    });
  }

  private adminState(roster: Roster, online: Set<PlayerId>): AdminState {
    return {
      players: roster.roots.map((p) => ({ ...p, online: online.has(p.id) })),
      join: { secret: this.env.JOIN_SECRET, code: this.code },
    };
  }
}
