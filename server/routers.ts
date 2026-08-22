import { COOKIE_NAME } from "../shared/const.js";
import { MIN_ACTIVE_PLAYERS, roomCapacityFor, roomMemberLimit, canStartOnlineSession, type RoomSystem } from "../shared/room-capacity.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { EMULATOR_ROOM_CAPABILITIES } from "./emulator-capabilities";
import { createRoomMediaToken } from "./livekit";
import { createAccessToken, createJoinCode, hashAccessToken } from "./rooms";
import { z } from "zod";

const roomSystemSchema = z.enum(["psp", "nes", "sega", "ps1", "arcade"]);

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
        }),
      )
      .mutation(async ({ input }) => {
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
    join: publicProcedure
      .input(z.object({
        joinCode: z.string().trim().length(6),
        displayName: z.string().trim().min(2).max(32),
        joinAs: z.enum(["player", "spectator"]).default("player"),
      }))
      .mutation(async ({ input }) => {
        const room = await db.findRoomByCode(input.joinCode.toUpperCase());
        if (!room || room.status !== "waiting") throw new Error("الغرفة غير متاحة للانضمام.");
        const system = room.system as RoomSystem;
        const capacity = roomCapacityFor(system);
        const totalMembers = await db.getRoomMemberCount(room.id);
        if (totalMembers >= roomMemberLimit(system)) {
          throw new Error(`الغرفة مكتملة: ${capacity.maxPlayers} لاعبين و${capacity.maxSpectators} مشاهدين كحد أقصى.`);
        }
        if (input.joinAs === "player") {
          const playerCount = await db.getRoomMemberCount(room.id, "player");
          const activePlayersIncludingHost = playerCount + 1;
          if (activePlayersIncludingHost >= capacity.maxPlayers) {
            throw new Error(`مقاعد اللعب (${capacity.maxPlayers}) مكتملة. يمكنك الدخول كمشاهد.`);
          }
        } else {
          const spectatorCount = await db.getRoomMemberCount(room.id, "spectator");
          if (spectatorCount >= capacity.maxSpectators) {
            throw new Error(`مقاعد المشاهدة (${capacity.maxSpectators}) مكتملة.`);
          }
        }
        const memberToken = createAccessToken();
        const memberId = await db.addRoomMember({
          roomId: room.id,
          displayName: input.displayName,
          role: input.joinAs,
          accessTokenHash: hashAccessToken(memberToken),
        });
        return { roomId: room.id, memberId, memberToken, role: input.joinAs, maxPlayers: capacity.maxPlayers, maxSpectators: capacity.maxSpectators };
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
