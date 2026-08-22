import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

import * as db from "./db";
import { hashAccessToken } from "./rooms";
import { STANDARD_MAX_ACTIVE_PLAYERS } from "../shared/room-capacity";

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

/** Dedicated low-latency relay for PSP/SEGA/ARCADE; lobby, chat and voice stay isolated. */
export function registerUniversalNetplayServer(server: HttpServer) {
  const io = new Server(server, {
    path: "/api/universal-netplay", cors: { origin: true, credentials: true },
    transports: ["websocket", "polling"], maxHttpBufferSize: 5e6, pingInterval: 2_000, pingTimeout: 8_000,
  });
  const readyByRoom = new Map<number, Map<number, Ready>>();
  const snapshotByRoom = new Map<string, Snapshot>();
  const inputHistoryByRoom = new Map<string, Map<number, Map<number, Input>>>();
  const activeSockets = new Map<string, string>();
  const roomKey = (roomId: number, system: System) => `${roomId}:${system}`;

  const getPlayers = async (roomId: number) => {
    const snapshot = await db.getRoomSnapshot(roomId).catch(() => undefined);
    return (snapshot?.members ?? []).filter((m) => m.role === "host" || m.role === "player")
      .sort((a, b) => (a.role === "host" ? -1 : b.role === "host" ? 1 : a.id - b.id))
      .slice(0, STANDARD_MAX_ACTIVE_PLAYERS);
  };

  io.use(async (socket, next) => {
    const auth = socket.handshake.auth as Record<string, unknown> | undefined;
    const roomId = Number(auth?.roomId), memberId = Number(auth?.memberId);
    const memberToken = typeof auth?.memberToken === "string" ? auth.memberToken : "";
    if (!Number.isInteger(roomId) || roomId <= 0 || !Number.isInteger(memberId) || memberId <= 0 || memberToken.length < 20) return next(new Error("بيانات دخول جلسة المحاكي غير مكتملة."));
    const member = await db.getMemberByAccessToken(memberId, hashAccessToken(memberToken)).catch(() => undefined);
    if (!member || member.roomId !== roomId) return next(new Error("لا تملك صلاحية دخول جلسة المحاكي."));
    socket.data.session = { roomId, memberId, displayName: member.displayName, role: member.role } satisfies Session;
    next();
  });

  io.on("connection", async (socket) => {
    const session = socket.data.session as Session, channel = roomChannel(session.roomId), connectionKey = `${session.roomId}:${session.memberId}`;
    const previous = activeSockets.get(connectionKey);
    if (previous && previous !== socket.id) io.sockets.sockets.get(previous)?.disconnect(true);
    activeSockets.set(connectionKey, socket.id); socket.join(channel);
    const players = await getPlayers(session.roomId);
    socket.emit("universal:joined", { memberId: session.memberId, assignedPlayer: session.role === "spectator" ? null : Math.max(0, players.findIndex((m) => m.id === session.memberId)), playerCount: players.length });

    socket.on("universal:quality-probe", (p: { sequence?: unknown }) => {
      const sequence = typeof p?.sequence === "number" && Number.isSafeInteger(p.sequence) ? p.sequence : -1;
      if (sequence >= 0) socket.emit("universal:quality-pong", { sequence, serverTime: Date.now() });
    });

    socket.on("universal:ready", async (p: { system?: unknown; fingerprint?: unknown; coreVersion?: unknown }) => {
      if (session.role === "spectator" || !validSystem(p?.system) || !validFingerprint(p?.fingerprint) || !validCoreVersion(p?.coreVersion)) return;
      const ready = { memberId: session.memberId, system: p.system, fingerprint: p.fingerprint.toLowerCase(), coreVersion: p.coreVersion.trim() } satisfies Ready;
      const roomReady = readyByRoom.get(session.roomId) ?? new Map<number, Ready>(); roomReady.set(session.memberId, ready); readyByRoom.set(session.roomId, roomReady);
      const active = await getPlayers(session.roomId), ids = active.map((m) => m.id);
      if (ids.length < 2 || ids.length > STANDARD_MAX_ACTIVE_PLAYERS) return;
      if (!ids.every((id) => roomReady.has(id))) return void socket.emit("universal:waiting", { readyCount: ids.filter((id) => roomReady.has(id)).length, playerCount: ids.length });
      const peers = ids.map((id) => roomReady.get(id)!); const first = peers[0];
      if (!peers.every((peer) => peer.system === first.system && peer.fingerprint === first.fingerprint && peer.coreVersion === first.coreVersion)) return void io.to(channel).emit("universal:session-refused", { message: "كل اللاعبين يجب أن يختاروا نفس ملف اللعبة ونفس إصدار المحرك." });
      const key = roomKey(session.roomId, first.system); snapshotByRoom.delete(key); inputHistoryByRoom.delete(key);
      io.to(channel).emit("universal:bootstrap", { system: first.system, fingerprint: first.fingerprint, coreVersion: first.coreVersion, hostMemberId: first.memberId, playerMemberIds: ids });
    });

    socket.on("universal:input", async (p: { frame?: unknown; mask?: unknown }) => {
      if (session.role === "spectator" || !validFrame(p?.frame) || !validMask(p?.mask)) return;
      const playersNow = await getPlayers(session.roomId); if (!playersNow.some((m) => m.id === session.memberId)) return;
      const ready = readyByRoom.get(session.roomId)?.get(session.memberId); if (!ready) return;
      const key = roomKey(session.roomId, ready.system), history = inputHistoryByRoom.get(key) ?? new Map<number, Map<number, Input>>();
      const frameInputs = history.get(p.frame) ?? new Map<number, Input>(); frameInputs.set(session.memberId, { frame: p.frame, mask: p.mask }); history.set(p.frame, frameInputs);
      for (const oldFrame of history.keys()) if (oldFrame < p.frame - 240) history.delete(oldFrame); inputHistoryByRoom.set(key, history);
      socket.to(channel).emit("universal:input", { memberId: session.memberId, player: playersNow.findIndex((m) => m.id === session.memberId) + 1, frame: p.frame, mask: p.mask });
    });

    socket.on("universal:state", (p: { snapshot?: unknown; syncId?: unknown; encoding?: unknown }) => {
      if (session.role !== "host" || typeof p?.snapshot !== "string" || p.snapshot.length === 0 || p.snapshot.length > 4_300_000) return;
      const syncId = typeof p.syncId === "number" && Number.isSafeInteger(p.syncId) && p.syncId >= 0 ? p.syncId : -1;
      const encoding = p.encoding === "base64" || p.encoding === "gzip-base64" ? p.encoding : null;
      const ready = readyByRoom.get(session.roomId)?.get(session.memberId); if (syncId < 0 || !encoding || !ready) return;
      const key = roomKey(session.roomId, ready.system), previousSnapshot = snapshotByRoom.get(key); if (previousSnapshot && syncId <= previousSnapshot.syncId) return;
      const snapshot: Snapshot = { snapshot: p.snapshot, syncId, fingerprint: ready.fingerprint, system: ready.system, encoding, updatedAt: Date.now() }; snapshotByRoom.set(key, snapshot); socket.to(channel).emit("universal:state", snapshot);
    });

    socket.on("universal:state-request", (p: { minimumSyncId?: unknown }) => {
      const minimum = typeof p?.minimumSyncId === "number" && Number.isSafeInteger(p.minimumSyncId) ? p.minimumSyncId : -1;
      const ready = readyByRoom.get(session.roomId)?.get(session.memberId); if (!ready) return;
      const cached = snapshotByRoom.get(roomKey(session.roomId, ready.system)); if (cached && cached.syncId > minimum && Date.now() - cached.updatedAt < 120_000) socket.emit("universal:state", cached);
      socket.to(channel).emit("universal:state-request", { fromMemberId: session.memberId });
    });

    socket.on("universal:state-ack", async (p: { syncId?: unknown }) => {
      if (p?.syncId !== 0) return; const ready = readyByRoom.get(session.roomId)?.get(session.memberId); if (!ready) return;
      const activeIds = (await getPlayers(session.roomId)).map((m) => m.id), acks = new Set<number>((socket.data.initialStateAcks as number[] | undefined) ?? []); acks.add(session.memberId); socket.data.initialStateAcks = [...acks];
      const hostMemberId = activeIds[0], allAcked = activeIds.filter((id) => id !== hostMemberId).every((id) => [...(io.sockets.adapter.rooms.get(channel) ?? [])].some((sid) => { const peer = io.sockets.sockets.get(sid); return (peer?.data.session as Session | undefined)?.memberId === id && ((peer?.data.initialStateAcks as number[] | undefined) ?? []).includes(0); }));
      if (allAcked) io.to(channel).emit("universal:session-go", { system: ready.system, fingerprint: ready.fingerprint, hostMemberId, playerMemberIds: activeIds, startAt: Date.now() + 1500 });
    });

    socket.on("disconnect", () => { if (activeSockets.get(connectionKey) === socket.id) activeSockets.delete(connectionKey); const roomReady = readyByRoom.get(session.roomId); roomReady?.delete(session.memberId); if (roomReady && roomReady.size === 0) readyByRoom.delete(session.roomId); socket.to(channel).emit("universal:presence", { memberId: session.memberId, online: false }); });
  });
  return io;
}
