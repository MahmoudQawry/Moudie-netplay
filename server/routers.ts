import { COOKIE_NAME } from "../shared/const.js";
import { MIN_ACTIVE_PLAYERS, roomCapacityFor, canStartOnlineSession, type RoomSystem } from "../shared/room-capacity.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { EMULATOR_ROOM_CAPABILITIES } from "./emulator-capabilities";
import { createRoomMediaToken } from "./livekit";
import { createAccessToken, createJoinCode, hashAccessToken } from "./rooms";
import { z } from "zod";

const roomSystemSchema = z.enum(["psp", "nes", "sega", "ps1"]);

/** Simple in-memory sliding-window limiter: blocks room-creation and join spam
 * from a single IP. Sufficient for the single-instance room service deployment. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ACTIONS = 15;
const actionsByIp = new Map<string, number[]>();

function assertRateLimit(ip: string) {
  const now = Date.now();
  const recent = (actionsByIp.get(ip) ?? []).filter((at) => now - at < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_ACTIONS) {
    throw new Error("عدد كبير من المحاولات. انتظر قليلاً ثم أعد المحاولة.");
  }
  recent.push(now);
  actionsByIp.set(ip, recent);
  if (actionsByIp.size > 10_000) {
    for (const [key, timestamps] of actionsByIp) {
      if (timestamps.every((at) => now - at >= RATE_LIMIT_WINDOW_MS)) actionsByIp.delete(key);
    }
  }
}

async function seatMemberInRoom(
  room: Awaited<ReturnType<typeof db.findRoomByCode>>,
  displayName: string,
  joinAs: "player" | "spectator",
) {
  if (!room || room.status !== "waiting") throw new Error("الغرفة غير متاحة للانضمام.");
  const system = room.system as RoomSystem;
  const capacity = roomCapacityFor(system);
  const memberToken = createAccessToken();
  const memberId = await db.addRoomMemberWithCapacity({
    roomId: room.id,
    displayName,
    accessTokenHash: hashAccessToken(memberToken),
    role: joinAs,
    maxPlayers: capacity.maxPlayers,
    maxSpectators: capacity.maxSpectators,
  });
  return { roomId: room.id, memberId, memberToken, role: joinAs, maxPlayers: capacity.maxPlayers, maxSpectators: capacity.maxSpectators };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  rooms: router({
    capabilities: publicProcedure.query(() => Object.values(EMULATOR_ROOM_CAPABILITIES)),
    create: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(64),
          system: roomSystemSchema,
          hostName: z.string().trim().min(2).max(32),
          visibility: z.enum(["public", "private"]).default("private"),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        assertRateLimit(ctx.req.ip ?? "unknown");
        const system = input.system as RoomSystem;
        const capacity = roomCapacityFor(system);
        if (capacity.minPlayers !== MIN_ACTIVE_PLAYERS) throw new Error("إعداد سعة هذه الغرفة غير صالح.");
        const hostToken = createAccessToken();
        const memberToken = createAccessToken();
        const created = await db.createRoom({
          ...input,
          maxPlayers: capacity.maxPlayers,
          joinCode: createJoinCode(),
          hostTokenHash: hashAccessToken(hostToken),
          memberTokenHash: hashAccessToken(memberToken),
        });
        return {
          ...created,
          hostToken,
          memberToken,
          maxPlayers: capacity.maxPlayers,
          maxSpectators: capacity.maxSpectators,
        };
      }),
    publicList: publicProcedure
      .input(z.object({ limit: z.number().int().min(1).max(50).default(30) }))
      .query(async ({ input }) => {
        const rooms = await db.listPublicRooms(input.limit);
        return rooms.map((room) => ({
          id: room.id,
          name: room.name,
          system: room.system,
          maxPlayers: room.maxPlayers,
          maxSpectators: roomCapacityFor(room.system as RoomSystem).maxSpectators,
          status: room.status,
          activePlayers: room.activePlayers,
          spectators: room.spectators,
          readyPlayers: room.readyPlayers,
          updatedAt: room.updatedAt.toISOString(),
        }));
      }),
    join: publicProcedure
      .input(z.object({
        joinCode: z.string().trim().length(6),
        displayName: z.string().trim().min(2).max(32),
        joinAs: z.enum(["player", "spectator"]).default("player"),
      }))
      .mutation(async ({ input, ctx }) => {
        assertRateLimit(ctx.req.ip ?? "unknown");
        const room = await db.findRoomByCode(input.joinCode.toUpperCase());
        return seatMemberInRoom(room, input.displayName, input.joinAs);
      }),
    joinPublic: publicProcedure
      .input(z.object({
        roomId: z.number().int().positive(),
        displayName: z.string().trim().min(2).max(32),
        joinAs: z.enum(["player", "spectator"]).default("player"),
      }))
      .mutation(async ({ input, ctx }) => {
        assertRateLimit(ctx.req.ip ?? "unknown");
        const room = await db.findRoomById(input.roomId);
        if (!room || room.visibility !== "public") throw new Error("هذه الغرفة غير متاحة في الردهة العامة.");
        return seatMemberInRoom(room, input.displayName, input.joinAs);
      }),
    snapshot: publicProcedure
      .input(z.object({ roomId: z.number().int().positive(), memberId: z.number().int().positive(), memberToken: z.string().min(20) }))
      .query(async ({ input }) => {
        const member = await db.getMemberByAccessToken(input.memberId, hashAccessToken(input.memberToken));
        if (!member || member.roomId !== input.roomId) throw new Error("لا تملك صلاحية عرض هذه الغرفة.");
        const snapshot = await db.getRoomSnapshot(input.roomId);
        if (!snapshot) throw new Error("الغرفة لم تعد موجودة.");
        const system = snapshot.room.system as RoomSystem;
        const capacity = roomCapacityFor(system);
        return {
          room: { ...snapshot.room, maxPlayers: capacity.maxPlayers, maxSpectators: capacity.maxSpectators },
          members: snapshot.members,
        };
      }),
    mediaToken: publicProcedure
      .input(z.object({ roomId: z.number().int().positive(), memberId: z.number().int().positive(), memberToken: z.string().min(20) }))
      .mutation(async ({ input }) => {
        const member = await db.getMemberByAccessToken(input.memberId, hashAccessToken(input.memberToken));
        if (!member || member.roomId !== input.roomId) throw new Error("لا تملك صلاحية دخول الصوت في هذه الغرفة.");
        return createRoomMediaToken({ roomId: input.roomId, memberId: member.id, displayName: member.displayName, role: member.role });
      }),
    setReady: publicProcedure
      .input(z.object({
        memberId: z.number().int().positive(),
        memberToken: z.string().min(20),
        isReady: z.boolean(),
        gameFingerprint: z.string().min(16).max(128).optional(),
        coreVersion: z.string().trim().min(1).max(64).optional(),
      }))
      .mutation(async ({ input }) => {
        const success = await db.updateMemberReadiness({
          memberId: input.memberId,
          accessTokenHash: hashAccessToken(input.memberToken),
          isReady: input.isReady,
          gameFingerprint: input.gameFingerprint,
          coreVersion: input.coreVersion,
        });
        if (!success) throw new Error("رمز العضوية غير صالح.");
        return { success: true };
      }),
    start: publicProcedure
      .input(z.object({ roomId: z.number().int().positive(), hostToken: z.string().min(20) }))
      .mutation(async ({ input }) => {
        const snapshot = await db.getRoomSnapshot(input.roomId);
        if (!snapshot || hashAccessToken(input.hostToken) !== snapshot.room.hostTokenHash) {
          throw new Error("لا تملك صلاحية بدء هذه الجلسة.");
        }
        const system = snapshot.room.system as RoomSystem;
        const capacity = roomCapacityFor(system);
        const players = snapshot.members.filter((member) => member.role !== "spectator");
        if (!canStartOnlineSession(system, players.length) || players.some((member) => !member.isReady)) {
          throw new Error(`يجب أن يكون من ${capacity.minPlayers} إلى ${capacity.maxPlayers} لاعبين نشطين جاهزين قبل البدء.`);
        }
        const fingerprints = new Set(players.map((member) => member.gameFingerprint));
        const versions = new Set(players.map((member) => member.coreVersion));
        if (fingerprints.size !== 1 || fingerprints.has(null) || versions.size !== 1 || versions.has(null)) {
          throw new Error("يجب أن تتطابق اللعبة وإصدار المحرك عند جميع اللاعبين.");
        }
        await db.activateRoom(input.roomId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
