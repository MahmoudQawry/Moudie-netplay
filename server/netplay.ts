import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

import * as db from "./db";
import { normalizeNetplayInput } from "../lib/netplay-protocol";
import { createSessionBarrier, type ReadySessionPeer } from "../lib/netplay-session-barrier";
import { normalizeSyncId } from "../lib/netplay-sync";
import { hashAccessToken } from "./rooms";
import { MAX_ACTIVE_PLAYERS } from "../shared/room-capacity";

type NetplaySystem = "ps1" | "nes" | "psp" | "sega" | "arcade";

type NetplaySession = {
  roomId: number;
  memberId: number;
  displayName: string;
  role: "host" | "player" | "spectator";
  clientKind: "room-ui" | "ps1-player" | "universal-player";
};

type InputPayload = { button?: unknown; isDown?: unknown; frame?: unknown };
type ChatPayload = { text?: unknown };
type StatePayload = { snapshot?: unknown; syncId?: unknown };
type SignalPayload = { targetMemberId?: unknown; signal?: unknown };
type VoiceStatusPayload = { microphoneEnabled?: unknown; speakerEnabled?: unknown };
type SessionReadyPayload = { system?: unknown; fingerprint?: unknown; coreVersion?: unknown };
type SessionStartPayload = { system?: unknown };
type Ps1ReadyPayload = { fingerprint?: unknown; coreVersion?: unknown };
type Ps1InputPayload = { frame?: unknown; mask?: unknown };
type Ps1StatePayload = { snapshot?: unknown; syncId?: unknown; encoding?: unknown };
type Ps1SyncAckPayload = { syncId?: unknown };
type StateRequestPayload = { minimumSyncId?: unknown };
const ps1KeyCodes = new Set([19, 20, 21, 22, 96, 97, 99, 100, 102, 103, 104, 105, 106, 107, 108, 109]);
type AuthoritativeSnapshot = { snapshot: string; syncId: number; updatedAt: number };
type Ps1Snapshot = AuthoritativeSnapshot & { fingerprint: string; encoding: "gzip-base64" | "base64" };
type ReadySessionData = ReadySessionPeer & { system: NetplaySystem };
type PendingSession = { system: NetplaySystem; barrier: NonNullable<ReturnType<typeof createSessionBarrier>> };
type UniversalSnapshot = AuthoritativeSnapshot & { fingerprint: string; system: Exclude<NetplaySystem, "ps1" | "nes">; encoding: "gzip-base64" | "base64" };

const roomChannel = (roomId: number) => `netplay:${roomId}`;
const memberKey = (roomId: number, memberId: number, clientKind: NetplaySession["clientKind"]) => `${roomId}:${memberId}:${clientKind}`;
/**
 * Realtime relay for private rooms. It does not receive ROM files or raw audio;
 * it relays verified player input, chat, save-state sync and WebRTC signalling.
 */
export function registerNetplayServer(server: HttpServer) {
  const io = new Server(server, {
    path: "/api/netplay",
    cors: { origin: true, credentials: true },
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 5e6,
  });
  const activeMemberSockets = new Map<string, string>();
  const ps1Snapshots = new Map<number, Ps1Snapshot>();
  const ps1InitialStateAcks = new Map<number, Set<number>>();
  const famicomSnapshots = new Map<number, AuthoritativeSnapshot>();
  const universalSnapshots = new Map<string, UniversalSnapshot>();
  const pendingSessions = new Map<number, PendingSession>();

  io.use(async (socket, next) => {
    const auth = socket.handshake.auth as Record<string, unknown> | undefined;
    const roomId = Number(auth?.roomId);
    const memberId = Number(auth?.memberId);
    const memberToken = typeof auth?.memberToken === "string" ? auth.memberToken : "";
    const clientKind = auth?.clientKind === "ps1-player" ? "ps1-player" : auth?.clientKind === "universal-player" ? "universal-player" : "room-ui";
    if (!Number.isInteger(roomId) || !Number.isInteger(memberId) || memberToken.length < 20) {
      next(new Error("بيانات دخول الغرفة غير مكتملة."));
      return;
    }
    try {
      const member = await db.getMemberByAccessToken(memberId, hashAccessToken(memberToken));
      if (!member || member.roomId !== roomId) {
        next(new Error("لا تملك صلاحية دخول قناة الغرفة."));
        return;
      }
      socket.data.session = {
        roomId,
        memberId,
        displayName: member.displayName,
        role: member.role,
        clientKind,
      } satisfies NetplaySession;
      next();
    } catch {
      next(new Error("تعذر التحقق من دخول الغرفة."));
    }
  });

  io.on("connection", async (socket) => {
    const session = socket.data.session as NetplaySession;
    const channel = roomChannel(session.roomId);
    const key = memberKey(session.roomId, session.memberId, session.clientKind);
    const previousSocketId = activeMemberSockets.get(key);
    if (previousSocketId && previousSocketId !== socket.id) {
      io.sockets.sockets.get(previousSocketId)?.disconnect(true);
    }
    activeMemberSockets.set(key, socket.id);
    const onlineMemberIds = Array.from(io.sockets.adapter.rooms.get(channel) ?? [])
      .map((socketId) => (io.sockets.sockets.get(socketId)?.data.session as NetplaySession | undefined)?.memberId)
      .filter((memberId): memberId is number => typeof memberId === "number");
    socket.join(channel);

    const snapshot = await db.getRoomSnapshot(session.roomId).catch(() => undefined);
    const activeSeats = (snapshot?.members ?? [])
      .filter((member) => member.role === "host" || member.role === "player")
      .sort((left, right) => {
        if (left.role === "host") return -1;
        if (right.role === "host") return 1;
        return left.id - right.id;
      });
    const assignedPlayer = session.role === "spectator"
      ? null
      : (() => {
          const index = activeSeats.findIndex((member) => member.id === session.memberId);
          return index >= 0 && index < MAX_ACTIVE_PLAYERS ? index + 1 : null;
        })();
    socket.emit("netplay:joined", {
      memberId: session.memberId,
      role: session.role,
      assignedPlayer,
      members: snapshot?.members ?? [],
      onlineMemberIds,
    });
    socket.to(channel).emit("netplay:presence", { memberId: session.memberId, displayName: session.displayName, online: true });

    socket.on("netplay:input", (payload: InputPayload) => {
      if (session.role === "spectator") return;
      const input = normalizeNetplayInput(session.role, payload ?? {});
      if (!input) return;
      socket.to(channel).emit("netplay:input", {
        memberId: session.memberId,
        ...input,
      });
    });

    socket.on("netplay:chat", (payload: ChatPayload) => {
      const text = typeof payload?.text === "string" ? payload.text.trim().slice(0, 400) : "";
      if (!text) return;
      io.to(channel).emit("netplay:chat", {
        id: `${session.memberId}-${Date.now()}`,
        memberId: session.memberId,
        displayName: session.displayName,
        text,
        sentAt: Date.now(),
      });
    });

    socket.on("netplay:session-ready", (payload: SessionReadyPayload) => {
      if (session.clientKind !== "room-ui" || session.role === "spectator") return;
      const system = payload?.system === "ps1" || payload?.system === "nes" || payload?.system === "psp" || payload?.system === "sega" || payload?.system === "arcade" ? payload.system : null;
      const fingerprint = typeof payload?.fingerprint === "string" ? payload.fingerprint.toLowerCase() : "";
      const coreVersion = typeof payload?.coreVersion === "string" ? payload.coreVersion.trim() : "";
      if (!system || !/^[a-f0-9]{64}$/.test(fingerprint) || !coreVersion) return;
      socket.data.readySession = { memberId: session.memberId, role: session.role, system, fingerprint, coreVersion } satisfies ReadySessionData;
      socket.to(channel).emit("netplay:session-presence", { memberId: session.memberId, ready: true, system });
      socket.emit("netplay:session-ready-accepted", { system });
    });

    socket.on("netplay:session-start-request", async (payload: SessionStartPayload) => {
      if (session.clientKind !== "room-ui" || session.role !== "host") return;
      const system = payload?.system === "ps1" || payload?.system === "nes" || payload?.system === "psp" || payload?.system === "sega" || payload?.system === "arcade" ? payload.system : null;
      if (!system) return;
      const roomSnapshot = await db.getRoomSnapshot(session.roomId).catch(() => undefined);
      const activeMemberIds = (roomSnapshot?.members ?? []).filter((member) => member.role !== "spectator").map((member) => member.id);
      const readyPeers = Array.from(io.sockets.adapter.rooms.get(channel) ?? [])
        .map((socketId) => io.sockets.sockets.get(socketId))
        .filter((peer) => {
          const peerSession = peer?.data.session as NetplaySession | undefined;
          return peerSession?.clientKind === "room-ui" && peerSession.role !== "spectator";
        })
        .map((peer) => peer?.data.readySession as ReadySessionData | undefined)
        .filter((ready): ready is ReadySessionData => Boolean(ready && ready.system === system));
      const readyMemberIds = new Set(readyPeers.map((peer) => peer.memberId));
      const everyActivePlayerReady = activeMemberIds.length >= 2 && activeMemberIds.length <= MAX_ACTIVE_PLAYERS && activeMemberIds.every((memberId) => readyMemberIds.has(memberId));
      const barrier = everyActivePlayerReady ? createSessionBarrier(readyPeers, Date.now()) : null;
      if (!barrier) {
        socket.emit("netplay:session-start-refused", { message: "ينبغي أن يتصل جميع اللاعبين النشطين (من 2 إلى 8) ويؤكدوا ملف اللعبة وإصدار المحرك نفسه قبل البدء." });
        return;
      }
      ps1Snapshots.delete(session.roomId);
      ps1InitialStateAcks.delete(session.roomId);
      famicomSnapshots.delete(session.roomId);
      universalSnapshots.delete(`${session.roomId}:${system}`);
      pendingSessions.set(session.roomId, { system, barrier });
      io.to(channel).emit("netplay:session-start", { system, ...barrier });
    });

    socket.on("netplay:state", (payload: StatePayload) => {
      if (session.role !== "host" || typeof payload?.snapshot !== "string" || payload.snapshot.length > 4_500_000) return;
      const syncId = normalizeSyncId(payload.syncId);
      if (syncId === null) return;
      const authoritative = { snapshot: payload.snapshot, syncId, updatedAt: Date.now() };
      const previous = famicomSnapshots.get(session.roomId);
      if (previous && syncId <= previous.syncId) return;
      famicomSnapshots.set(session.roomId, authoritative);
      socket.to(channel).emit("netplay:state", authoritative);
    });

    socket.on("netplay:state-request", (payload: StateRequestPayload) => {
      const requestedAfter = normalizeSyncId(payload?.minimumSyncId) ?? -1;
      const cached = famicomSnapshots.get(session.roomId);
      if (cached && cached.syncId > requestedAfter) socket.emit("netplay:state", cached);
      socket.to(channel).emit("netplay:state-request", { fromMemberId: session.memberId });
    });

    socket.on("netplay:signal", (payload: SignalPayload) => {
      if (!payload || typeof payload.signal !== "object" || payload.signal === null) return;
      const targetMemberId = Number(payload.targetMemberId);
      const target = Number.isInteger(targetMemberId) ? targetMemberId : undefined;
      const event = { fromMemberId: session.memberId, signal: payload.signal };
      if (target) {
        for (const peer of io.sockets.adapter.rooms.get(channel) ?? []) {
          const peerSocket = io.sockets.sockets.get(peer);
          const peerSession = peerSocket?.data.session as NetplaySession | undefined;
          if (peerSession?.memberId === target) peerSocket?.emit("netplay:signal", event);
        }
      } else {
        socket.to(channel).emit("netplay:signal", event);
      }
    });

    socket.on("netplay:voice-status", (payload: VoiceStatusPayload) => {
      socket.to(channel).emit("netplay:voice-status", {
        memberId: session.memberId,
        microphoneEnabled: Boolean(payload?.microphoneEnabled),
        speakerEnabled: Boolean(payload?.speakerEnabled),
      });
    });

    socket.on("netplay:ps1-ready", (payload: Ps1ReadyPayload) => {
      const fingerprint = typeof payload?.fingerprint === "string" ? payload.fingerprint.toLowerCase() : "";
      const coreVersion = typeof payload?.coreVersion === "string" ? payload.coreVersion.trim() : "";
      const pending = pendingSessions.get(session.roomId);
      if (!/^[a-f0-9]{64}$/.test(fingerprint) || !coreVersion || pending?.system !== "ps1" || !pending.barrier || pending.barrier.fingerprint !== fingerprint || pending.barrier.coreVersion !== coreVersion) return;
      socket.data.ps1Fingerprint = fingerprint;
      socket.data.ps1CoreVersion = coreVersion;
      const peers = Array.from(io.sockets.adapter.rooms.get(channel) ?? []).map((socketId) => io.sockets.sockets.get(socketId));
      const requiredMemberIds = pending.barrier.playerMemberIds;
      const connectedPlayerIds = new Set(peers
        .filter((peer) => peer?.data.session?.clientKind === "ps1-player" && peer?.data.ps1Fingerprint === fingerprint && peer?.data.ps1CoreVersion === coreVersion)
        .map((peer) => (peer?.data.session as NetplaySession).memberId));
      if (!requiredMemberIds.every((memberId) => connectedPlayerIds.has(memberId))) {
        socket.emit("netplay:ps1-waiting", { message: "Waiting for every active PS1 player to open the matching game file." });
        return;
      }
      io.to(channel).emit("netplay:ps1-session-bootstrap", { fingerprint, hostMemberId: pending.barrier.hostMemberId, playerMemberIds: requiredMemberIds });
    });

    socket.on("netplay:ps1-input", (payload: Ps1InputPayload) => {
      const frame = Number(payload?.frame);
      const mask = Number(payload?.mask);
      if (!Number.isSafeInteger(frame) || frame < 0 || !Number.isSafeInteger(mask) || mask < 0 || mask > 0xffff || typeof socket.data.ps1Fingerprint !== "string") return;
      socket.to(channel).emit("netplay:ps1-input", { memberId: session.memberId, frame, mask });
    });

    socket.on("netplay:ps1-state", (payload: Ps1StatePayload) => {
      const snapshot = typeof payload?.snapshot === "string" ? payload.snapshot : "";
      if (session.role !== "host" || typeof socket.data.ps1Fingerprint !== "string" || snapshot.length === 0 || snapshot.length > 4_300_000) return;
      const syncId = normalizeSyncId(payload.syncId);
      const encoding = payload.encoding === "base64" ? "base64" : payload.encoding === "gzip-base64" ? "gzip-base64" : null;
      if (syncId === null || !encoding) return;
      const previous = ps1Snapshots.get(session.roomId);
      if (previous && syncId <= previous.syncId) return;
      const authoritative = { fingerprint: socket.data.ps1Fingerprint, snapshot, syncId, encoding, updatedAt: Date.now() } satisfies Ps1Snapshot;
      ps1Snapshots.set(session.roomId, authoritative);
      socket.to(channel).emit("netplay:ps1-state", authoritative);
    });

    socket.on("netplay:ps1-state-request", (payload: StateRequestPayload) => {
      const fingerprint = socket.data.ps1Fingerprint;
      if (typeof fingerprint !== "string") return;
      const requestedAfter = normalizeSyncId(payload?.minimumSyncId) ?? -1;
      const cached = ps1Snapshots.get(session.roomId);
      if (cached?.fingerprint === fingerprint && cached.syncId > requestedAfter && Date.now() - cached.updatedAt < 120_000) {
        socket.emit("netplay:ps1-state", cached);
      }
      for (const peerId of io.sockets.adapter.rooms.get(channel) ?? []) {
        const peer = io.sockets.sockets.get(peerId);
        const peerSession = peer?.data.session as NetplaySession | undefined;
        if (peerSession?.role === "host" && peer?.data.ps1Fingerprint === fingerprint) {
          peer.emit("netplay:ps1-state-request", { fromMemberId: session.memberId });
          break;
        }
      }
    });

    socket.on("netplay:ps1-sync-ack", (payload: Ps1SyncAckPayload) => {
      const syncId = normalizeSyncId(payload?.syncId);
      if (syncId === null || typeof socket.data.ps1Fingerprint !== "string") return;
      socket.to(channel).emit("netplay:ps1-sync-ack", { memberId: session.memberId, syncId, appliedAt: Date.now() });
      const pending = pendingSessions.get(session.roomId);
      if (syncId === 0 && pending?.system === "ps1" && pending.barrier.playerMemberIds.includes(session.memberId)) {
        const acknowledgements = ps1InitialStateAcks.get(session.roomId) ?? new Set<number>();
        acknowledgements.add(session.memberId);
        ps1InitialStateAcks.set(session.roomId, acknowledgements);
        const allGuestsApplied = pending.barrier.playerMemberIds.filter((memberId) => memberId !== pending.barrier.hostMemberId).every((memberId) => acknowledgements.has(memberId));
        if (allGuestsApplied) {
          io.to(channel).emit("netplay:ps1-session-go", { fingerprint: socket.data.ps1Fingerprint, playerMemberIds: pending.barrier.playerMemberIds, startAt: Date.now() + 1200 });
          ps1InitialStateAcks.delete(session.roomId);
          pendingSessions.delete(session.roomId);
        }
      }
    });

    socket.on("netplay:universal-ready", (payload: SessionReadyPayload) => {
      const system = payload?.system === "psp" || payload?.system === "sega" || payload?.system === "arcade" ? payload.system : null;
      const fingerprint = typeof payload?.fingerprint === "string" ? payload.fingerprint.toLowerCase() : "";
      const coreVersion = typeof payload?.coreVersion === "string" ? payload.coreVersion.trim() : "";
      const pending = pendingSessions.get(session.roomId);
      if (!system || !/^[a-f0-9]{64}$/.test(fingerprint) || !coreVersion || pending?.system !== system || pending.barrier.fingerprint !== fingerprint || pending.barrier.coreVersion !== coreVersion) return;
      socket.data.universalSystem = system;
      socket.data.universalFingerprint = fingerprint;
      socket.data.universalCoreVersion = coreVersion;
      const peers = Array.from(io.sockets.adapter.rooms.get(channel) ?? []).map((socketId) => io.sockets.sockets.get(socketId));
      const host = peers.find((peer) => {
        const peerSession = peer?.data.session as NetplaySession | undefined;
        return peerSession?.role === "host" && peerSession.clientKind === "universal-player" && peer?.data.universalSystem === system && peer?.data.universalFingerprint === fingerprint && peer?.data.universalCoreVersion === coreVersion;
      });
      const guest = peers.find((peer) => {
        const peerSession = peer?.data.session as NetplaySession | undefined;
        return peerSession?.role === "player" && peerSession.clientKind === "universal-player" && peer?.data.universalSystem === system && peer?.data.universalFingerprint === fingerprint && peer?.data.universalCoreVersion === coreVersion;
      });
      if (!host || !guest) {
        socket.emit("netplay:universal-waiting", { message: "Waiting for the other player to choose the same game file." });
        return;
      }
      io.to(channel).emit("netplay:universal-session-bootstrap", { system, fingerprint, hostMemberId: (host.data.session as NetplaySession).memberId });
    });

    socket.on("netplay:universal-input", (payload: Ps1InputPayload) => {
      const frame = Number(payload?.frame);
      const mask = Number(payload?.mask);
      if (!Number.isSafeInteger(frame) || frame < 0 || !Number.isSafeInteger(mask) || mask < 0 || mask > 0xffff || typeof socket.data.universalFingerprint !== "string") return;
      socket.to(channel).emit("netplay:universal-input", { memberId: session.memberId, frame, mask });
    });

    socket.on("netplay:universal-state", (payload: Ps1StatePayload) => {
      const system = socket.data.universalSystem as Exclude<NetplaySystem, "ps1" | "nes"> | undefined;
      const fingerprint = socket.data.universalFingerprint as string | undefined;
      const snapshot = typeof payload?.snapshot === "string" ? payload.snapshot : "";
      if (session.role !== "host" || !system || !fingerprint || snapshot.length === 0 || snapshot.length > 4_300_000) return;
      const syncId = normalizeSyncId(payload.syncId);
      const encoding = payload.encoding === "base64" ? "base64" : payload.encoding === "gzip-base64" ? "gzip-base64" : null;
      if (syncId === null || !encoding) return;
      const key = `${session.roomId}:${system}`;
      const previous = universalSnapshots.get(key);
      if (previous && syncId <= previous.syncId) return;
      const authoritative = { system, fingerprint, snapshot, syncId, encoding, updatedAt: Date.now() } satisfies UniversalSnapshot;
      universalSnapshots.set(key, authoritative);
      socket.to(channel).emit("netplay:universal-state", authoritative);
    });

    socket.on("netplay:universal-state-request", (payload: StateRequestPayload) => {
      const system = socket.data.universalSystem as Exclude<NetplaySystem, "ps1" | "nes"> | undefined;
      const fingerprint = socket.data.universalFingerprint as string | undefined;
      if (!system || !fingerprint) return;
      const requestedAfter = normalizeSyncId(payload?.minimumSyncId) ?? -1;
      const cached = universalSnapshots.get(`${session.roomId}:${system}`);
      if (cached?.fingerprint === fingerprint && cached.syncId > requestedAfter && Date.now() - cached.updatedAt < 120_000) socket.emit("netplay:universal-state", cached);
      for (const peerId of io.sockets.adapter.rooms.get(channel) ?? []) {
        const peer = io.sockets.sockets.get(peerId);
        const peerSession = peer?.data.session as NetplaySession | undefined;
        if (peerSession?.role === "host" && peerSession.clientKind === "universal-player" && peer?.data.universalSystem === system && peer?.data.universalFingerprint === fingerprint) {
          peer.emit("netplay:universal-state-request", { fromMemberId: session.memberId });
          break;
        }
      }
    });

    socket.on("netplay:universal-sync-ack", (payload: Ps1SyncAckPayload) => {
      const syncId = normalizeSyncId(payload?.syncId);
      const system = socket.data.universalSystem as Exclude<NetplaySystem, "ps1" | "nes"> | undefined;
      if (syncId === null || !system || typeof socket.data.universalFingerprint !== "string") return;
      socket.to(channel).emit("netplay:universal-sync-ack", { memberId: session.memberId, syncId, appliedAt: Date.now() });
      const pending = pendingSessions.get(session.roomId);
      if (syncId === 0 && pending?.system === system && session.role === "player") {
        io.to(channel).emit("netplay:universal-session-go", { system, fingerprint: socket.data.universalFingerprint, startAt: Date.now() + 1200 });
        pendingSessions.delete(session.roomId);
      }
    });

    socket.on("disconnect", () => {
      if (activeMemberSockets.get(key) === socket.id) activeMemberSockets.delete(key);
      const hasSiblingConnection = Array.from(activeMemberSockets.keys()).some((activeKey) => activeKey.startsWith(`${session.roomId}:${session.memberId}:`));
      if (!hasSiblingConnection) socket.to(channel).emit("netplay:presence", { memberId: session.memberId, displayName: session.displayName, online: false });
      if (session.clientKind === "room-ui") socket.to(channel).emit("netplay:session-presence", { memberId: session.memberId, ready: false });
    });
  });

  return io;
}
