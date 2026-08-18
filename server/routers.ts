import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { createAccessToken, createJoinCode, hashAccessToken } from "./rooms";
import { z } from "zod";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  rooms: router({
    create: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(64),
          system: z.enum(["psp", "nes", "sega", "ps1", "arcade"]),
          hostName: z.string().trim().min(2).max(32),
          maxPlayers: z.number().int().min(2).max(10),
        }),
      )
      .mutation(async ({ input }) => {
        const hostToken = createAccessToken();
        const memberToken = createAccessToken();
        const created = await db.createRoom({
          ...input,
          joinCode: createJoinCode(),
          hostTokenHash: hashAccessToken(hostToken),
          memberTokenHash: hashAccessToken(memberToken),
        });
        return { ...created, hostToken, memberToken };
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
        if (input.joinAs === "player") {
          const playerCount = await db.getRoomMemberCount(room.id, "player");
          // The host always occupies a player seat, so playerCount excludes that one host seat.
          if (playerCount + 1 >= room.maxPlayers) throw new Error("مقاعد اللعب في الغرفة مكتملة. يمكنك الدخول كمشاهد.");
        }
        const memberToken = createAccessToken();
        const memberId = await db.addRoomMember({
          roomId: room.id,
          displayName: input.displayName,
          role: input.joinAs,
          accessTokenHash: hashAccessToken(memberToken),
        });
        return { roomId: room.id, memberId, memberToken, role: input.joinAs };
      }),
    snapshot: publicProcedure
      .input(z.object({ roomId: z.number().int().positive(), memberId: z.number().int().positive(), memberToken: z.string().min(20) }))
      .query(async ({ input }) => {
        const member = await db.getMemberByAccessToken(input.memberId, hashAccessToken(input.memberToken));
        if (!member || member.roomId !== input.roomId) throw new Error("لا تملك صلاحية عرض هذه الغرفة.");
        const snapshot = await db.getRoomSnapshot(input.roomId);
        if (!snapshot) throw new Error("الغرفة لم تعد موجودة.");
        return snapshot;
      }),
    setReady: publicProcedure
      .input(
        z.object({
          memberId: z.number().int().positive(),
          memberToken: z.string().min(20),
          isReady: z.boolean(),
          gameFingerprint: z.string().min(16).max(128).optional(),
          coreVersion: z.string().trim().min(1).max(64).optional(),
        }),
      )
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
        const players = snapshot.members.filter((member) => member.role !== "spectator");
        if (players.length < 2 || players.some((member) => !member.isReady)) {
          throw new Error("يجب أن يكون لاعبان على الأقل جاهزين قبل البدء.");
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
