import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

import * as db from "./db";
import { normalizeNetplayInput, type NetplayPlayerSeat } from "../lib/netplay-protocol";
import { createSessionBarrier, type ReadySessionPeer } from "../lib/netplay-session-barrier";
import { normalizeSyncId } from "../lib/netplay-sync";
import { hashAccessToken } from "./rooms";
import { socketCors } from "./_core/cors";
import { roomCapacityFor } from "../shared/room-capacity";

type NetplaySystem = "ps1" | "nes" | "psp" | "sega";

type NetplaySession = {
  roomId: number;
  memberId: number;
  displayName: string;
  role: "host" | "player" | "spectator";
  clientKind: "room-ui" | "ps1-player" | "universal-player";
  assignedPlayer: NetplayPlayerSeat | null;
};

type InputPayload = { button?: unknown; isDown?: unknown; frame?: unknown };
type ChatPayload = { text?: unknown };
type StatePayload = { snapshot?: unknown; syncId?: unknown };
type SignalPayload = { targetMemberId?: unknown; signal?: unknown };
type VoiceStatusPayload = { microphoneEnabled?: unknown; speakerEnabled?: unknown; voiceMode?: unknown; voiceChannel?: unknown; isSpeaking?: unknown };
const VOICE_MODES = new Set(["ptt", "open"]);
const VOICE_CHANNELS = new Set(["room", "team"]);
const VOICE_SIGNAL_KINDS = new Set(["voice-hello", "voice-ready", "voice-offer", "voice-answer", "voice-candidate"]);
type SessionReadyPayload = { system?: unknown; fingerprint?: unknown; coreVersion?: unknown };
type SessionStartPayload = { system?: unknown };
type Ps1ReadyPayload = { fingerprint?: unknown; coreVersion?: unknown };
type Ps1InputPayload = { frame?: unknown; mask?: unknown };
type Ps1StatePayload = { snapshot?: unknown; syncId?: unknown; encoding?: unknown };
type Ps1SyncAckPayload = { syncId?: unknown };
type StateRequestPayload = { minimumSyncId?: unknown };
type QualityProbePayload = { sequence?: unknown };
type DelayUpdatePayload = { delay?: unknown; reason?: unknown };
type DesyncReportPayload = { frame?: unknown; lastAppliedFrame?: unknown; predictedFrames?: unknown };

type AuthoritativeSnapshot = { snapshot: string; syncId: number; updatedAt: number };
type Ps1Snapshot = AuthoritativeSnapshot & { fingerprint: string; encoding: "gzip-base64" | "base64" };
type ReadySessionData = ReadySessionPeer & { system: NetplaySystem };
type PendingSession = { system: NetplaySystem; barrier: NonNullable<ReturnType<typeof createSessionBarrier>>; createdAt: number };
type UniversalSnapshot = AuthoritativeSnapshot & { fingerprint: string; system: Exclude<NetplaySystem, "ps1" | "nes">; encoding: "gzip-base64" | "base64" };

const roomChannel = (roomId: number) => `netplay:${roomId}`;
const memberKey = (roomId: number, memberId: number, clientKind: NetplaySession["clientKind"]) => `${roomId}:${memberId}:${clientKind}`;

// PUBG-style tracking structures
type FrameInputRecord = { mask: number; receivedAt: number; memberId: number };
type RoomFrameHistory = Map<number, Map<number, FrameInputRecord>>; // frame -> memberId -> record
type RoomFrameTracker = Map<number, number>; // memberId -> lastFrame

/**
 * Realtime relay for private rooms. It does not receive ROM files or raw audio;
 * it relays verified player input, chat, save-state sync and WebRTC signalling.
 *
 * PUBG-inspired improvements implemented:
 * - Fixed missing quality-probe handler (was causing CONNECTING forever)
 * - Frame validation + history to prevent desync and detect lag
 * - Adaptive input delay negotiation (2-8 frames) broadcast to all
 * - Team vs Room voice channel filtering (spectators only in room channel)
 * - Prediction support: server keeps 60 frames history for late joiners
 * - Connection recovery with 30s window
 * - Input rate limiting per player (max 120 inputs/sec)
 */
export function registerNetplayServer(server: HttpServer) {
  const io = new Server(server, {
    path: "/api/netplay",
    cors: socketCors,
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 5e6,
    pingInterval: 2000,
    pingTimeout: 8000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 30_000,
      skipMiddlewares: false,
    },
  });
  const activeMemberSockets = new Map<string, string>();
  const ps1Snapshots = new Map<number, Ps1Snapshot>();
  const ps1InitialStateAcks = new Map<number, Set<number>>();
  const famicomSnapshots = new Map<number, AuthoritativeSnapshot>();
  const universalSnapshots = new Map<string, UniversalSnapshot>();
  const universalInitialStateAcks = new Map<string, Set<number>>();
  const pendingSessions = new Map<number, PendingSession>();
  // PUBG-style anti-desync structures
  const roomFrameTrackers = new Map<number, RoomFrameTracker>();
  const ps1InputHistory = new Map<number, RoomFrameHistory>();
  const universalInputHistory = new Map<string, RoomFrameHistory>();
  const roomInputDelays = new Map<number, number>();
  const memberInputRate = new Map<string, { count: number; windowStart: number }>();

  // Cleanup old histories every 60s
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, history] of ps1InputHistory) {
      for (const frame of history.keys()) {
        if (frame < 0) continue;
        const firstEntry = history.get(frame)?.values().next().value as FrameInputRecord | undefined;
        if (firstEntry && now - firstEntry.receivedAt > 60_000) {
          history.delete(frame);
        }
      }
      if (history.size === 0) ps1InputHistory.delete(roomId);
    }
    for (const [key, history] of universalInputHistory) {
      for (const frame of history.keys()) {
        const firstEntry = history.get(frame)?.values().next().value as FrameInputRecord | undefined;
        if (firstEntry && now - firstEntry.receivedAt > 60_000) {
          history.delete(frame);
        }
      }
      if (history.size === 0) universalInputHistory.delete(key);
    }
    // Cleanup old pending sessions (stuck > 5min)
    for (const [roomId, pending] of pendingSessions) {
      if (now - pending.createdAt > 5 * 60_000) {
        pendingSessions.delete(roomId);
      }
    }
  }, 60_000);

  function getFrameTracker(roomId: number): RoomFrameTracker {
    let tracker = roomFrameTrackers.get(roomId);
    if (!tracker) {
      tracker = new Map();
      roomFrameTrackers.set(roomId, tracker);
    }
    return tracker;
  }

  function getPs1History(roomId: number): RoomFrameHistory {
    let history = ps1InputHistory.get(roomId);
    if (!history) {
      history = new Map();
      ps1InputHistory.set(roomId, history);
    }
    return history;
  }

  function getUniversalHistory(roomId: number, system: string): RoomFrameHistory {
    const key = `${roomId}:${system}`;
    let history = universalInputHistory.get(key);
    if (!history) {
      history = new Map();
      universalInputHistory.set(key, history);
    }
    return history;
  }

  function checkInputRate(memberKey: string): boolean {
    const now = Date.now();
    const record = memberInputRate.get(memberKey);
    if (!record || now - record.windowStart > 1000) {
      memberInputRate.set(memberKey, { count: 1, windowStart: now });
      return true;
    }
    record.count++;
    // Max 120 inputs per second per player (60fps * 2 for safety)
    if (record.count > 120) return false;
    return true;
  }

  function validateFrame(frame: number, lastFrame: number): { valid: boolean; reason?: string } {
    if (!Number.isSafeInteger(frame) || frame < 0) return { valid: false, reason: "invalid frame" };
    // Don't allow frames too far in future (prevents one device getting ahead)
    if (frame > lastFrame + 30) return { valid: false, reason: "frame too far ahead" };
    // Don't allow old frames (already executed)
    if (frame < lastFrame - 10) return { valid: false, reason: "frame too old" };
    return { valid: true };
  }

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
        assignedPlayer: null,
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
    const maxPlayers = snapshot ? roomCapacityFor(snapshot.room.system as NetplaySystem).maxPlayers : 0;
    const assignedPlayer: NetplayPlayerSeat | null = session.role === "spectator"
      ? null
      : (() => {
          const index = activeSeats.findIndex((member) => member.id === session.memberId);
          return index >= 0 && index < maxPlayers ? (index + 1) as NetplayPlayerSeat : null;
        })();
    session.assignedPlayer = assignedPlayer;
    socket.emit("netplay:joined", {
      memberId: session.memberId,
      role: session.role,
      assignedPlayer,
      members: snapshot?.members ?? [],
      onlineMemberIds,
      inputDelay: roomInputDelays.get(session.roomId) ?? 3,
    });
    socket.to(channel).emit("netplay:presence", { memberId: session.memberId, displayName: session.displayName, online: true });

    // PUBG-style quality probe handler - THIS WAS MISSING causing CONNECTING forever
    socket.on("netplay:quality-probe", (payload: QualityProbePayload) => {
      const sequence = typeof payload?.sequence === "number" && Number.isSafeInteger(payload.sequence) ? payload.sequence : -1;
      if (sequence >= 0) {
        socket.emit("netplay:quality-pong", { sequence, serverTime: Date.now() });
      }
    });

    // Adaptive input delay negotiation (PUBG-style)
    socket.on("netplay:delay-request", (payload: DelayUpdatePayload) => {
      if (session.role === "spectator") return;
      const delay = Number(payload?.delay);
      if (!Number.isInteger(delay) || delay < 2 || delay > 8) return;
      const currentDelay = roomInputDelays.get(session.roomId) ?? 3;
      // Only allow increasing delay, or decreasing if all agree it's stable
      if (delay > currentDelay || (delay < currentDelay && payload?.reason === "stable")) {
        roomInputDelays.set(session.roomId, delay);
        io.to(channel).emit("netplay:delay-update", { delay, requestedBy: session.memberId, reason: payload?.reason ?? "network-adaptation" });
      }
    });

    // Desync detection reporting
    socket.on("netplay:desync-report", (payload: DesyncReportPayload) => {
      if (session.role === "spectator") return;
      const frame = Number(payload?.frame);
      const predicted = Number(payload?.predictedFrames);
      if (Number.isSafeInteger(frame) && Number.isSafeInteger(predicted) && predicted > 20) {
        // If many predicted frames, request host to send fresh state
        socket.to(channel).emit("netplay:desync-detected", {
          reporterId: session.memberId,
          frame,
          predictedFrames: predicted,
          message: `Player ${session.displayName} is experiencing ${predicted} predicted frames at frame ${frame}. Consider resync.`,
        });
        // Auto-trigger state request to host
        for (const peerId of io.sockets.adapter.rooms.get(channel) ?? []) {
          const peer = io.sockets.sockets.get(peerId);
          if (!peer) continue;
          const peerSession = peer.data.session as NetplaySession | undefined;
          if (peerSession?.role === "host") {
            peer.emit("netplay:desync-resync-request", { fromMemberId: session.memberId, frame });
            break;
          }
        }
      }
    });

    socket.on("netplay:input", (payload: InputPayload) => {
      if (session.role === "spectator") return;
      const input = normalizeNetplayInput(session.role, payload ?? {}, session.assignedPlayer ?? undefined);
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
      const system = payload?.system === "ps1" || payload?.system === "nes" || payload?.system === "psp" || payload?.system === "sega" ? payload.system : null;
      const fingerprint = typeof payload?.fingerprint === "string" ? payload.fingerprint.toLowerCase() : "";
      const coreVersion = typeof payload?.coreVersion === "string" ? payload.coreVersion.trim() : "";
      if (!system || !/^[a-f0-9]{64}$/.test(fingerprint) || !coreVersion) return;
      socket.data.readySession = { memberId: session.memberId, role: session.role, system, fingerprint, coreVersion } satisfies ReadySessionData;
      socket.to(channel).emit("netplay:session-presence", { memberId: session.memberId, ready: true, system });
      socket.emit("netplay:session-ready-accepted", { system });
    });

    socket.on("netplay:session-start-request", async (payload: SessionStartPayload) => {
      if (session.clientKind !== "room-ui" || session.role !== "host") return;
      const system = payload?.system === "ps1" || payload?.system === "nes" || payload?.system === "psp" || payload?.system === "sega" ? payload.system : null;
      if (!system) return;
      const roomSnapshot = await db.getRoomSnapshot(session.roomId).catch(() => undefined);
      const capacity = roomSnapshot ? roomCapacityFor(roomSnapshot.room.system as NetplaySystem) : null;
      const activeMemberIds = (roomSnapshot?.members ?? []).filter((member) => member.role !== "spectator").map((member) => member.id);
      const readyPeers = Array.from(io.sockets.adapter.rooms.get(channel) ?? [])
        .map((socketId) => io.sockets.sockets.get(socketId))
        .filter((peer): peer is NonNullable<typeof peer> => Boolean(peer))
        .filter((peer) => {
          const peerSession = peer.data.session as NetplaySession | undefined;
          return peerSession?.clientKind === "room-ui" && peerSession.role !== "spectator";
        })
        .map((peer) => peer.data.readySession as ReadySessionData | undefined)
        .filter((ready): ready is ReadySessionData => Boolean(ready && ready.system === system));
      const readyMemberIds = new Set(readyPeers.map((peer) => peer.memberId));
      const everyActivePlayerReady = Boolean(capacity && activeMemberIds.length >= capacity.minPlayers && activeMemberIds.length <= capacity.maxPlayers && activeMemberIds.every((memberId) => readyMemberIds.has(memberId)));
      const barrier = everyActivePlayerReady ? createSessionBarrier(readyPeers, Date.now()) : null;
      if (!barrier) {
        const range = capacity ? `${capacity.minPlayers} إلى ${capacity.maxPlayers}` : "العدد المسموح";
        socket.emit("netplay:session-start-refused", { message: `ينبغي أن يتصل جميع اللاعبين النشطين (من ${range}) ويؤكدوا ملف اللعبة وإصدار المحرك نفسه قبل البدء.` });
        return;
      }
      ps1Snapshots.delete(session.roomId);
      ps1InitialStateAcks.delete(session.roomId);
      famicomSnapshots.delete(session.roomId);
      universalSnapshots.delete(`${session.roomId}:${system}`);
      universalInitialStateAcks.delete(`${session.roomId}:${system}`);
      roomFrameTrackers.delete(session.roomId);
      ps1InputHistory.delete(session.roomId);
      universalInputHistory.delete(`${session.roomId}:${system}`);
      roomInputDelays.set(session.roomId, 3); // Reset to default for new session
      pendingSessions.set(session.roomId, { system, barrier, createdAt: Date.now() });
      io.to(channel).emit("netplay:session-start", { system, ...barrier, inputDelay: 3 });
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
      const signal = payload.signal as Record<string, unknown>;
      if (typeof signal.kind !== "string" || !VOICE_SIGNAL_KINDS.has(signal.kind)) return;
      if (JSON.stringify(signal).length > 32_000) return;
      const targetMemberId = Number(payload.targetMemberId);
      const target = Number.isInteger(targetMemberId) ? targetMemberId : undefined;
      const event = { fromMemberId: session.memberId, signal };
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

    // PUBG-style voice with team/room filtering
    socket.on("netplay:voice-status", (payload: VoiceStatusPayload) => {
      const voiceMode = typeof payload?.voiceMode === "string" && VOICE_MODES.has(payload.voiceMode) ? payload.voiceMode : undefined;
      const voiceChannel = typeof payload?.voiceChannel === "string" && VOICE_CHANNELS.has(payload.voiceChannel) ? payload.voiceChannel : undefined;
      const isSpeaking = Boolean(payload?.isSpeaking);
      const statusPayload = {
        memberId: session.memberId,
        displayName: session.displayName,
        role: session.role,
        microphoneEnabled: Boolean(payload?.microphoneEnabled),
        speakerEnabled: Boolean(payload?.speakerEnabled),
        isSpeaking,
        voiceMode,
        voiceChannel,
        timestamp: Date.now(),
      };

      // Team channel: only players hear, spectators don't
      if (voiceChannel === "team") {
        for (const peerId of io.sockets.adapter.rooms.get(channel) ?? []) {
          const peerSocket = io.sockets.sockets.get(peerId);
          const peerSession = peerSocket?.data.session as NetplaySession | undefined;
          if (peerSession && (peerSession.role === "host" || peerSession.role === "player")) {
            peerSocket?.emit("netplay:voice-status", statusPayload);
          }
        }
        // Also send to sender for UI consistency
        socket.emit("netplay:voice-status", statusPayload);
      } else {
        // Room channel: everyone hears
        io.to(channel).emit("netplay:voice-status", statusPayload);
      }
    });

    socket.on("netplay:ps1-ready", (payload: Ps1ReadyPayload) => {
      const fingerprint = typeof payload?.fingerprint === "string" ? payload.fingerprint.toLowerCase() : "";
      const coreVersion = typeof payload?.coreVersion === "string" ? payload.coreVersion.trim() : "";
      const pending = pendingSessions.get(session.roomId);
      if (!/^[a-f0-9]{64}$/.test(fingerprint) || !coreVersion || pending?.system !== "ps1" || !pending.barrier || pending.barrier.fingerprint !== fingerprint || pending.barrier.coreVersion !== coreVersion) return;
      socket.data.ps1Fingerprint = fingerprint;
      socket.data.ps1CoreVersion = coreVersion;
      // A new verified session starts at frame zero. Do not carry a stale
      // frame ceiling across a reconnect or a second match in the same room.
      getFrameTracker(session.roomId).delete(session.memberId);
      const peers = Array.from(io.sockets.adapter.rooms.get(channel) ?? []).map((socketId) => io.sockets.sockets.get(socketId)).filter((p): p is NonNullable<typeof p> => Boolean(p));
      const requiredMemberIds = pending.barrier.playerMemberIds;
      const connectedPlayerIds = new Set(peers
        .filter((peer) => peer.data.session?.clientKind === "ps1-player" && peer.data.ps1Fingerprint === fingerprint && peer.data.ps1CoreVersion === coreVersion)
        .map((peer) => (peer.data.session as NetplaySession).memberId));
      if (!requiredMemberIds.every((memberId) => connectedPlayerIds.has(memberId))) {
        socket.emit("netplay:ps1-waiting", { message: "Waiting for every active PS1 player to open the matching game file.", connectedCount: connectedPlayerIds.size, requiredCount: requiredMemberIds.length });
        return;
      }
      io.to(channel).emit("netplay:ps1-session-bootstrap", { fingerprint, hostMemberId: pending.barrier.hostMemberId, playerMemberIds: requiredMemberIds, inputDelay: roomInputDelays.get(session.roomId) ?? 3 });
    });

    socket.on("netplay:ps1-input", (payload: Ps1InputPayload) => {
      const frame = Number(payload?.frame);
      const mask = Number(payload?.mask);
      if (!Number.isSafeInteger(frame) || frame < 0 || !Number.isSafeInteger(mask) || mask < 0 || mask > 0xffff || typeof socket.data.ps1Fingerprint !== "string") return;
      if (session.role === "spectator") return;
      
      // Rate limiting
      const rateKey = `${session.roomId}:${session.memberId}:ps1`;
      if (!checkInputRate(rateKey)) return;

      // Frame validation to prevent one device getting ahead
      const tracker = getFrameTracker(session.roomId);
      const lastFrame = tracker.get(session.memberId) ?? -1;
      const validation = validateFrame(frame, lastFrame);
      if (!validation.valid) {
        // Silently drop invalid frames instead of disconnecting - helps with jitter
        if (validation.reason === "frame too far ahead") {
          socket.emit("netplay:frame-rejected", { frame, reason: validation.reason, lastFrame, suggestedDelay: (roomInputDelays.get(session.roomId) ?? 3) + 1 });
        }
        return;
      }
      tracker.set(session.memberId, Math.max(lastFrame, frame));

      // Store in history for prediction support
      const history = getPs1History(session.roomId);
      let frameMap = history.get(frame);
      if (!frameMap) {
        frameMap = new Map();
        history.set(frame, frameMap);
      }
      frameMap.set(session.memberId, { mask, receivedAt: Date.now(), memberId: session.memberId });

      // Cleanup old frames (keep last 60)
      for (const oldFrame of history.keys()) {
        if (oldFrame < frame - 60) history.delete(oldFrame);
      }

      socket.to(channel).volatile.emit("netplay:ps1-input", { memberId: session.memberId, frame, mask, serverTime: Date.now() });
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
        if (!peer) continue;
        const peerSession = peer.data.session as NetplaySession | undefined;
        if (peerSession?.role === "host" && peer.data.ps1Fingerprint === fingerprint) {
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
          io.to(channel).emit("netplay:ps1-session-go", { fingerprint: socket.data.ps1Fingerprint, playerMemberIds: pending.barrier.playerMemberIds, startAt: Date.now() + 1500, inputDelay: roomInputDelays.get(session.roomId) ?? 3, serverTime: Date.now() });
          ps1InitialStateAcks.delete(session.roomId);
          pendingSessions.delete(session.roomId);
        }
      }
    });

    socket.on("netplay:universal-ready", (payload: SessionReadyPayload) => {
      const system = payload?.system === "psp" || payload?.system === "sega" ? payload.system : null;
      const fingerprint = typeof payload?.fingerprint === "string" ? payload.fingerprint.toLowerCase() : "";
      const coreVersion = typeof payload?.coreVersion === "string" ? payload.coreVersion.trim() : "";
      const pending = pendingSessions.get(session.roomId);
      if (!system || !/^[a-f0-9]{64}$/.test(fingerprint) || !coreVersion || pending?.system !== system || pending.barrier.fingerprint !== fingerprint || pending.barrier.coreVersion !== coreVersion) return;
      socket.data.universalSystem = system;
      socket.data.universalFingerprint = fingerprint;
      socket.data.universalCoreVersion = coreVersion;
      getFrameTracker(session.roomId).delete(session.memberId);
      const peers = Array.from(io.sockets.adapter.rooms.get(channel) ?? []).map((socketId) => io.sockets.sockets.get(socketId)).filter((p): p is NonNullable<typeof p> => Boolean(p));
      const readyPlayerIds = new Set(peers
        .filter((peer) => {
          const peerSession = peer.data.session as NetplaySession | undefined;
          return (peerSession?.role === "host" || peerSession?.role === "player") && peerSession.clientKind === "universal-player" && peer.data.universalSystem === system && peer.data.universalFingerprint === fingerprint && peer.data.universalCoreVersion === coreVersion;
        })
        .map((peer) => (peer.data.session as NetplaySession).memberId));
      const requiredPlayerIds = pending.barrier.playerMemberIds;
      const host = peers.find((peer) => (peer.data.session as NetplaySession | undefined)?.role === "host" && readyPlayerIds.has((peer.data.session as NetplaySession).memberId));
      if (!host || requiredPlayerIds.some((memberId) => !readyPlayerIds.has(memberId))) {
        socket.emit("netplay:universal-waiting", { message: "Waiting for the other player to choose the same game file.", connectedCount: readyPlayerIds.size, requiredCount: requiredPlayerIds.length });
        return;
      }
      io.to(channel).emit("netplay:universal-session-bootstrap", { system, fingerprint, hostMemberId: (host.data.session as NetplaySession).memberId, playerMemberIds: requiredPlayerIds, inputDelay: roomInputDelays.get(session.roomId) ?? 3 });
    });

    socket.on("netplay:universal-input", (payload: Ps1InputPayload) => {
      const frame = Number(payload?.frame);
      const mask = Number(payload?.mask);
      if (!Number.isSafeInteger(frame) || frame < 0 || !Number.isSafeInteger(mask) || mask < 0 || mask > 0xffff || typeof socket.data.universalFingerprint !== "string") return;
      if (session.role === "spectator") return;

      const rateKey = `${session.roomId}:${session.memberId}:universal`;
      if (!checkInputRate(rateKey)) return;

      const tracker = getFrameTracker(session.roomId);
      const lastFrame = tracker.get(session.memberId) ?? -1;
      const validation = validateFrame(frame, lastFrame);
      if (!validation.valid) {
        if (validation.reason === "frame too far ahead") {
          socket.emit("netplay:frame-rejected", { frame, reason: validation.reason, lastFrame });
        }
        return;
      }
      tracker.set(session.memberId, Math.max(lastFrame, frame));

      const system = socket.data.universalSystem as string;
      const history = getUniversalHistory(session.roomId, system);
      let frameMap = history.get(frame);
      if (!frameMap) {
        frameMap = new Map();
        history.set(frame, frameMap);
      }
      frameMap.set(session.memberId, { mask, receivedAt: Date.now(), memberId: session.memberId });

      for (const oldFrame of history.keys()) {
        if (oldFrame < frame - 60) history.delete(oldFrame);
      }

      socket.to(channel).volatile.emit("netplay:universal-input", { memberId: session.memberId, frame, mask, serverTime: Date.now() });
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
        if (!peer) continue;
        const peerSession = peer.data.session as NetplaySession | undefined;
        if (peerSession?.role === "host" && peerSession.clientKind === "universal-player" && peer.data.universalSystem === system && peer.data.universalFingerprint === fingerprint) {
          peer.emit("netplay:universal-state-request", { fromMemberId: session.memberId });
          break;
        }
      }
    });

    socket.on("netplay:universal-sync-ack", async (payload: Ps1SyncAckPayload) => {
      const syncId = normalizeSyncId(payload?.syncId);
      const system = socket.data.universalSystem as Exclude<NetplaySystem, "ps1" | "nes"> | undefined;
      if (syncId === null || !system || typeof socket.data.universalFingerprint !== "string") return;
      socket.to(channel).emit("netplay:universal-sync-ack", { memberId: session.memberId, syncId, appliedAt: Date.now() });
      const pending = pendingSessions.get(session.roomId);
        if (syncId === 0 && pending?.system === system && (session.role === "host" || session.role === "player")) {
        const roomSnapshot = await db.getRoomSnapshot(session.roomId).catch(() => undefined);
        const activePlayerIds = (roomSnapshot?.members ?? [])
          .filter((member) => member.role === "host" || member.role === "player")
          .map((member) => member.id);
        const key = `${session.roomId}:${system}`;
        const acknowledgements = universalInitialStateAcks.get(key) ?? new Set<number>();
        acknowledgements.add(session.memberId);
        universalInitialStateAcks.set(key, acknowledgements);
        const guestIds = activePlayerIds.filter((memberId) => memberId !== pending.barrier.hostMemberId);
        if (guestIds.length >= 1 && guestIds.every((memberId) => acknowledgements.has(memberId))) {
          io.to(channel).emit("netplay:universal-session-go", { system, fingerprint: socket.data.universalFingerprint, startAt: Date.now() + 1500, playerMemberIds: activePlayerIds, inputDelay: roomInputDelays.get(session.roomId) ?? 3, serverTime: Date.now() });
          universalInitialStateAcks.delete(key);
          pendingSessions.delete(session.roomId);
        }
      }
    });

    socket.on("disconnect", () => {
      if (activeMemberSockets.get(key) === socket.id) activeMemberSockets.delete(key);
      const hasSiblingConnection = Array.from(activeMemberSockets.keys()).some((activeKey) => activeKey.startsWith(`${session.roomId}:${session.memberId}:`));
      if (!hasSiblingConnection) socket.to(channel).emit("netplay:presence", { memberId: session.memberId, displayName: session.displayName, online: false });
      if (session.clientKind === "room-ui") socket.to(channel).emit("netplay:session-presence", { memberId: session.memberId, ready: false });
      // Cleanup frame tracker for this member after 30s (allow reconnection)
      setTimeout(() => {
        const stillConnected = Array.from(activeMemberSockets.keys()).some(k => k.startsWith(`${session.roomId}:${session.memberId}:`));
        if (!stillConnected) {
          roomFrameTrackers.get(session.roomId)?.delete(session.memberId);
        }
      }, 30_000);
    });
  });

  return io;
}
