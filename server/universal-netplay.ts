import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

import * as db from "./db";
import { hashAccessToken } from "./rooms";
import { MAX_ACTIVE_PLAYERS } from "../shared/room-capacity";

type System = "psp" | "sega" | "arcade";
type Role = "host" | "player" | "spectator";
type Session = { roomId: number; memberId: number; displayName: string; role: Role };
type Ready = { memberId: number; system: System; fingerprint: string; coreVersion: string };
type Snapshot = { snapshot: string; syncId: number; fingerprint: string; system: System; encoding: "gzip-base64" | "base64"; updatedAt: number };
type Input = { frame: number; mask: number };

const roomChannel = (roomId: number) => `universal-netplay:${roomId}`;
const validSystem = (value: unknown): value is System => value === "psp" || value === "sega" || value === "arcade";
const validFingerprint = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value.toLowerCase());
const validCoreVersion = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 64;
const validFrame = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const validMask = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffff;

/**
 * Dedicated low-latency relay for PSP/SEGA/ARCADE. The older room Socket.IO
 * endpoint remains responsible for lobby/chat/presence; this endpoint owns
 * the emulator's 2-8 player session so room UI traffic cannot stall frames.
 */
export function registerUniversalNetplayServer(server: HttpServer) {
  const io = new Server(server, {
    path: "/api/universal-netplay",
    cors: { origin: true, credentials: true },
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 5e6,
    pingInterval: 2_000,
    pingTimeout: 8_000,
  });

  const readyByRoom = new Map<number, Map<number, Ready>>();
  const snapshotByRoom = new Map<string, Snapshot>();
  const inputHistoryByRoom = new Map<string, Map<number, Map<number, Input>>>();
  const activeSockets = new Map<string, string>();

  const roomKey = (roomId: number, system: System) => `${roomId}:${system}`;

  const getPlayers = async (roomId: number) => {
    const snapshot = await db.getRoomSnapshot(roomId).catch(() => undefined);
    return (snapshot?.members ?? [])
      .filter((member) => member.role === "host" || member.role === "player")
      .sort((a, b) => (a.role === "host" ? -1 : b.role === "host" ? 1 : a.id - b.id))
      .slice(0, MAX_ACTIVE_PLAYERS);
  };

  io.use(async (socket, next) => {
    const auth = socket.handshake.auth as Record<string, unknown> | undefined;
    const roomId = Number(auth?.roomId);
    const memberId = Number(auth?.memberId);
    const memberToken = typeof auth?.memberToken === "string" ? auth.memberToken : "";
    if (!Number.isInteger(roomId) || roomId <= 0 || !Number.isInteger(memberId) || memberId <= 0 || memberToken.length < 20) {
      next(new Error("بيانات دخول جلسة المحاكي غير مكتملة."));
      return;
    }
    const member = await db.getMemberByAccessToken(memberId, hashAccessToken(memberToken)).catch(() => undefined);
    if (!member || member.roomId !== roomId) {
      next(new Error("لا تملك صلاحية دخول جلسة المحاكي."));
      return;
    }
    socket.data.session = { roomId, memberId, displayName: member.displayName, role: member.role } satisfies Session;
    next();
  });

  io.on("connection", async (socket) => {
    const session = socket.data.session as Session;
    const channel = roomChannel(session.roomId);
    const connectionKey = `${session.roomId}:${session.memberId}`;
    const previous = activeSockets.get(connectionKey);
    if (previous && previous !== socket.id) io.sockets.sockets.get(previous)?.disconnect(true);
    activeSockets.set(connectionKey, socket.id);
    socket.join(channel);

    const players = await getPlayers(session.roomId);
    const assignedPlayer = session.role === "spectator" ? null : Math.max(0, players.findIndex((member) => member.id === session.memberId));
    socket.emit("universal:joined", { memberId: session.memberId, assignedPlayer, playerCount: players.length });

    socket.on("universal:quality-probe", (payload: { sequence?: unknown }) => {
      const sequence = typeof payload?.sequence === "number" && Number.isSafeInteger(payload.sequence) ? payload.sequence : -1;
      if (sequence < 0) return;
      socket.emit("universal:quality-pong", { sequence, serverTime: Date.now() });
    });

    socket.on("universal:ready", async (payload: { system?: unknown; fingerprint?: unknown; coreVersion?: unknown }) => {
      if (session.role === "spectator" || !validSystem(payload?.system) || !validFingerprint(payload?.fingerprint) || !validCoreVersion(payload?.coreVersion)) return;
      const ready = { memberId: session.memberId, system: payload.system, fingerprint: payload.fingerprint.toLowerCase(), coreVersion: payload.coreVersion.trim() } satisfies Ready;
      const roomReady = readyByRoom.get(session.roomId) ?? new Map<number, Ready>();
      roomReady.set(session.memberId, ready);
      readyByRoom.set(session.roomId, roomReady);

      const activePlayers = await getPlayers(session.roomId);
      if (activePlayers.length < 2 || activePlayers.length > MAX_ACTIVE_PLAYERS) return;
      const activeIds = activePlayers.map((member) => member.id);
      const allReady = activeIds.every((memberId) => roomReady.has(memberId));
      if (!allReady) {
        socket.emit("universal:waiting", { readyCount: activeIds.filter((id) => roomReady.has(id)).length, playerCount: activeIds.length });
        return;
      }
      const peers = activeIds.map((memberId) => roomReady.get(memberId)!);
      const first = peers[0];
      const matching = peers.every((peer) => peer.system === first.system && peer.fingerprint === first.fingerprint && peer.coreVersion === first.coreVersion);
      if (!matching) {
        io.to(channel).emit("universal:session-refused", { message: "كل اللاعبين يجب أن يختاروا نفس ملف اللعبة ونفس إصدار المحرك." });
        return;
      }
      const key = roomKey(session.roomId, first.system);
      snapshotByRoom.delete(key);
      inputHistoryByRoom.delete(key);
      io.to(channel).emit("universal:bootstrap", {
        system: first.system,
        fingerprint: first.fingerprint,
        coreVersion: first.coreVersion,
        hostMemberId: first.memberId,
        playerMemberIds: activeIds,
      });
    });

    socket.on("universal:input", async (payload: { frame?: unknown; mask?: unknown }) => {
      if (session.role === "spectator" || !validFrame(payload?.frame) || !validMask(payload?.mask)) return;
      const players = await getPlayers(session.roomId);
      if (!players.some((member) => member.id === session.memberId)) return;
      const roomReady = readyByRoom.get(session.roomId);
      const ready = roomReady?.get(session.memberId);
      if (!ready) return;
      const key = roomKey(session.roomId, ready.system);
      const history = inputHistoryByRoom.get(key) ?? new Map<number, Map<number, Input>>();
      const frame = history.get(payload.frame) ?? new Map<number, Input>();
      frame.set(session.memberId, { frame: payload.frame, mask: payload.mask });
      history.set(payload.frame, frame);
      // Keep a bounded history for reconnect diagnostics/catch-up without allowing memory growth.
      for (const oldFrame of history.keys()) if (oldFrame < payload.frame - 240) history.delete(oldFrame);
      inputHistoryByRoom.set(key, history);
      const player = players.findIndex((member) => member.id === session.memberId) + 1;
      socket.to(channel).emit("universal:input", { memberId: session.memberId, player, frame: payload.frame, mask: payload.mask });
    });

    socket.on("universal:state", async (payload: { snapshot?: unknown; syncId?: unknown; encoding?: unknown }) => {
      if (session.role !== "host" || typeof payload?.snapshot !== "string" || payload.snapshot.length === 0 || payload.snapshot.length > 4_300_000) return;
      const syncId = typeof payload.syncId === "number" && Number.isSafeInteger(payload.syncId) && payload.syncId >= 0 ? payload.syncId : -1;
      const encoding = payload.encoding === "base64" ? "base64" : payload.encoding === "gzip-base64" ? "gzip-base64" : null;
      const ready = readyByRoom.get(session.roomId)?.get(session.memberId);
      if (syncId < 0 || !encoding || !ready) return;
      const key = roomKey(session.roomId, ready.system);
      const previousSnapshot = snapshotByRoom.get(key);
      if (previousSnapshot && syncId <= previousSnapshot.syncId) return;
      const snapshot: Snapshot = { snapshot: payload.snapshot, syncId, fingerprint: ready.fingerprint, system: ready.system, encoding, updatedAt: Date.now() };
      snapshotByRoom.set(key, snapshot);
      socket.to(channel).emit("universal:state", snapshot);
    });

    socket.on("universal:state-request", (payload: { minimumSyncId?: unknown }) => {
      const minimum = typeof payload?.minimumSyncId === "number" && Number.isSafeInteger(payload.minimumSyncId) ? payload.minimumSyncId : -1;
      const ready = readyByRoom.get(session.roomId)?.get(session.memberId);
      if (!ready) return;
      const cached = snapshotByRoom.get(roomKey(session.roomId, ready.system));
      if (cached && cached.syncId > minimum && Date.now() - cached.updatedAt < 120_000) socket.emit("universal:state", cached);
      socket.to(channel).emit("universal:state-request", { fromMemberId: session.memberId });
    });

    socket.on("universal:state-ack", async (payload: { syncId?: unknown }) => {
      if (payload?.syncId !== 0) return;
      const ready = readyByRoom.get(session.roomId)?.get(session.memberId);
      if (!ready) return;
      const players = await getPlayers(session.roomId);
      const activeIds = players.map((member) => member.id);
      const acknowledgements = new Set<number>((socket.data.initialStateAcks as number[] | undefined) ?? []);
      acknowledgements.add(session.memberId);
      socket.data.initialStateAcks = [...acknowledgements];
      const hostMemberId = readyByRoom.get(session.roomId)?.get(activeIds[0])?.memberId ?? activeIds[0];
      const hostSocket = [...(io.sockets.adapter.rooms.get(channel) ?? [])].map((id) => io.sockets.sockets.get(id)).find((peer) => (peer?.data.session as Session | undefined)?.memberId === hostMemberId);
      const allNonHosts = activeIds.filter((id) => id !== hostMemberId);
      const allAcked = allNonHosts.every((memberId) => [...(io.sockets.adapter.rooms.get(channel) ?? [])].some((id) => {
        const peer = io.sockets.sockets.get(id);
        return (peer?.data.session as Session | undefined)?.memberId === memberId && ((peer?.data.initialStateAcks as number[] | undefined) ?? []).includes(0);
      }));
      if (allAcked && hostSocket) {
        io.to(channel).emit("universal:session-go", { system: ready.system, fingerprint: ready.fingerprint, hostMemberId, playerMemberIds: activeIds, startAt: Date.now() + 1500 });
      }
    });

    socket.on("disconnect", () => {
      if (activeSockets.get(connectionKey) === socket.id) activeSockets.delete(connectionKey);
      const roomReady = readyByRoom.get(session.roomId);
      roomReady?.delete(session.memberId);
      if (roomReady && roomReady.size === 0) readyByRoom.delete(session.roomId);
      socket.to(channel).emit("universal:presence", { memberId: session.memberId, online: false });
    });
  });

  return io;
}
