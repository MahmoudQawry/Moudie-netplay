import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

/** Behavioral tRPC tests: the real appRouter (Zod validation, procedures,
 * capacity policy, rate limiting) runs against an in-memory room store.
 * Only the database layer is replaced — no MySQL instance is required. */

const h = vi.hoisted(() => {
  type RoomRow = {
    id: number;
    joinCode: string;
    name: string;
    system: string;
    hostTokenHash: string;
    maxPlayers: number;
    visibility: "public" | "private";
    status: "waiting" | "active";
    updatedAt: Date;
  };
  type MemberRow = {
    id: number;
    roomId: number;
    displayName: string;
    role: "host" | "player" | "spectator";
    accessTokenHash: string;
    isReady: boolean;
    gameFingerprint: string | null;
    coreVersion: string | null;
  };
  const store = {
    rooms: [] as RoomRow[],
    members: [] as MemberRow[],
    nextRoomId: 1,
    nextMemberId: 1,
  };
  let chain: Promise<unknown> = Promise.resolve();
  const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  return { store, serialize, sha };
});

vi.mock("../server/db", () => ({
  createRoom: async (input: {
    joinCode: string;
    name: string;
    system: string;
    hostName?: string;
    hostTokenHash: string;
    memberTokenHash?: string;
    maxPlayers: number;
    visibility?: "public" | "private";
  }) => {
    const roomId = h.store.nextRoomId++;
    h.store.rooms.push({
      id: roomId,
      joinCode: input.joinCode,
      name: input.name,
      system: input.system,
      hostTokenHash: input.hostTokenHash,
      maxPlayers: input.maxPlayers,
      visibility: input.visibility ?? "private",
      status: "waiting",
      updatedAt: new Date(),
    });
    const memberId = h.store.nextMemberId++;
    h.store.members.push({
      id: memberId,
      roomId,
      displayName: input.hostName ?? "Host",
      role: "host",
      accessTokenHash: input.memberTokenHash ?? "",
      isReady: false,
      gameFingerprint: null,
      coreVersion: null,
    });
    return { roomId, memberId };
  },
  findRoomByCode: async (joinCode: string) => h.store.rooms.find((room) => room.joinCode === joinCode),
  findRoomById: async (roomId: number) => h.store.rooms.find((room) => room.id === roomId),
  addRoomMemberWithCapacity: async (input: {
    roomId: number;
    displayName: string;
    accessTokenHash: string;
    role: "player" | "spectator";
    maxPlayers: number;
    maxSpectators: number;
  }) => {
    const { decideSeat, roomCapacityFor } = await import("../shared/room-capacity");
    return h.serialize(async () => {
      const room = h.store.rooms.find((candidate) => candidate.id === input.roomId);
      if (!room || room.status !== "waiting") throw new Error("الغرفة غير متاحة للانضمام.");
      const roomMembers = h.store.members.filter((member) => member.roomId === input.roomId);
      const decision = decideSeat(roomMembers, input.role, roomCapacityFor(room.system as "nes" | "ps1" | "psp" | "sega"));
      if (!decision.allowed) {
        if (decision.reason === "players-full") throw new Error(`مقاعد اللعب (${input.maxPlayers}) مكتملة. يمكنك الدخول كمشاهد.`);
        if (decision.reason === "spectators-full") throw new Error(`مقاعد المشاهدة (${input.maxSpectators}) مكتملة.`);
        throw new Error(`الغرفة مكتملة: ${input.maxPlayers} لاعبين و${input.maxSpectators} مشاهدين كحد أقصى.`);
      }
      const memberId = h.store.nextMemberId++;
      h.store.members.push({
        id: memberId,
        roomId: input.roomId,
        displayName: input.displayName,
        role: input.role,
        accessTokenHash: input.accessTokenHash,
        isReady: false,
        gameFingerprint: null,
        coreVersion: null,
      });
      return memberId;
    });
  },
  getMemberByAccessToken: async (memberId: number, accessTokenHash: string) =>
    h.store.members.find((member) => member.id === memberId && member.accessTokenHash === accessTokenHash),
  getRoomSnapshot: async (roomId: number) => {
    const room = h.store.rooms.find((candidate) => candidate.id === roomId);
    if (!room) return undefined;
    return {
      room,
      members: h.store.members
        .filter((member) => member.roomId === roomId)
        .map((member) => ({
          id: member.id,
          displayName: member.displayName,
          role: member.role,
          isReady: member.isReady,
          gameFingerprint: member.gameFingerprint,
          coreVersion: member.coreVersion,
        })),
    };
  },
  updateMemberReadiness: async (input: {
    memberId: number;
    accessTokenHash: string;
    isReady: boolean;
    gameFingerprint?: string;
    coreVersion?: string;
  }) => {
    const member = h.store.members.find((candidate) => candidate.id === input.memberId && candidate.accessTokenHash === input.accessTokenHash);
    if (!member) return false;
    member.isReady = input.isReady;
    member.gameFingerprint = input.gameFingerprint ?? null;
    member.coreVersion = input.coreVersion ?? null;
    return true;
  },
  activateRoom: async (roomId: number) => {
    const room = h.store.rooms.find((candidate) => candidate.id === roomId);
    if (room) room.status = "active";
  },
  getRoomMemberCount: async (roomId: number) => h.store.members.filter((member) => member.roomId === roomId).length,
  listPublicRooms: async (limit: number) =>
    h.store.rooms
      .filter((room) => room.visibility === "public")
      .slice(0, limit)
      .map((room) => ({ ...room })),
}));

import { appRouter } from "../server/routers";
import { roomCapacityFor } from "../shared/room-capacity";

const callerWithIp = (ip: string) =>
  appRouter.createCaller({
    req: { ip, headers: {} },
    res: { cookie: () => undefined, clearCookie: () => undefined },
    user: null,
  } as never);

const PS1_CAPACITY = roomCapacityFor("ps1");
const FINGERPRINT = "a".repeat(64);
const CORE = "pcsx-rearmed-0.13.2-lockstep-v1";

let ipCounter = 0;
const nextCaller = () => callerWithIp(`10.${(ipCounter += 1)}.0.1`);

async function createPs1Room(visibility: "public" | "private" = "private") {
  const caller = nextCaller();
  const created = await caller.rooms.create({
    name: "Test Room",
    system: "ps1",
    hostName: "Host",
    visibility,
  });
  const room = h.store.rooms.find((candidate) => candidate.id === created.roomId)!;
  return { caller, created, joinCode: room.joinCode };
}

describe("rooms tRPC procedures (behavioral)", () => {
  beforeEach(() => {
    h.store.rooms.length = 0;
    h.store.members.length = 0;
    h.store.nextRoomId = 1;
    h.store.nextMemberId = 1;
  });

  it("creates a room and issues distinct host tokens hashed at rest", async () => {
    const { created } = await createPs1Room();
    expect(created.roomId).toBeGreaterThan(0);
    expect(created.hostToken).not.toBe(created.memberToken);
    expect(h.store.rooms[0].hostTokenHash).toBe(h.sha(created.hostToken));
    const hostMember = h.store.members.find((member) => member.roomId === created.roomId);
    expect(hostMember?.role).toBe("host");
  });

  it("enforces the six-character code contract via Zod", async () => {
    const { created, joinCode } = await createPs1Room();
    const joinCaller = nextCaller();
    await expect(
      joinCaller.rooms.join({ joinCode: joinCode.slice(0, 5), displayName: "Ahmed", joinAs: "player" }),
    ).rejects.toThrow();
    await expect(
      joinCaller.rooms.join({ joinCode: "!!!!!!", displayName: "Ahmed", joinAs: "player" }),
    ).rejects.toThrow();
    void created;
  });

  it("fills a PS1 room to 8 members and rejects the 9th join", async () => {
    const { created, joinCode } = await createPs1Room();
    const joinCaller = nextCaller();
    for (let index = 0; index < 3; index += 1) {
      await joinCaller.rooms.join({ joinCode, displayName: `Player${index}`, joinAs: "player" });
    }
    for (let index = 0; index < 4; index += 1) {
      await joinCaller.rooms.join({ joinCode, displayName: `Spectator${index}`, joinAs: "spectator" });
    }
    expect(h.store.members.filter((member) => member.roomId === created.roomId).length).toBe(8);
    await expect(
      joinCaller.rooms.join({ joinCode, displayName: "Latecomer", joinAs: "spectator" }),
    ).rejects.toThrow(/مكتملة/);
  });

  it("rejects joining a private room through the public lobby", async () => {
    const { created } = await createPs1Room("private");
    const caller = nextCaller();
    await expect(
      caller.rooms.joinPublic({ roomId: created.roomId, displayName: "Outsider", joinAs: "player" }),
    ).rejects.toThrow(/الردهة العامة/);
  });

  it("blocks session start while any active player is not ready", async () => {
    const { caller, created, joinCode } = await createPs1Room();
    const joinCaller = nextCaller();
    const first = await joinCaller.rooms.join({ joinCode, displayName: "Player1", joinAs: "player" });
    await expect(
      caller.rooms.start({ roomId: created.roomId, hostToken: created.hostToken }),
    ).rejects.toThrow(/جاهزين/);

    // A wrong membership token is rejected outright and must not flip readiness.
    await expect(
      caller.rooms.setReady({
        memberId: first.memberId,
        memberToken: "wrong-token-wrong-token-wrong",
        isReady: true,
        gameFingerprint: FINGERPRINT,
        coreVersion: CORE,
      }),
    ).rejects.toThrow(/رمز العضوية/);
    const guest = h.store.members.find((member) => member.id === first.memberId)!;
    expect(guest.isReady).toBe(false);
    await expect(
      caller.rooms.start({ roomId: created.roomId, hostToken: created.hostToken }),
    ).rejects.toThrow(/جاهزين/);
  });

  it("starts a fully ready matched session and activates the room", async () => {
    const { created, joinCode } = await createPs1Room();
    const joinCaller = nextCaller();
    const guest = await joinCaller.rooms.join({ joinCode, displayName: "Player1", joinAs: "player" });
    const hostMember = h.store.members.find((member) => member.roomId === created.roomId && member.role === "host")!;
    const readyCaller = nextCaller();
    await readyCaller.rooms.setReady({ memberId: hostMember.id, memberToken: created.memberToken, isReady: true, gameFingerprint: FINGERPRINT, coreVersion: CORE });
    await readyCaller.rooms.setReady({ memberId: guest.memberId, memberToken: guest.memberToken, isReady: true, gameFingerprint: FINGERPRINT, coreVersion: CORE });
    await expect(readyCaller.rooms.start({ roomId: created.roomId, hostToken: created.hostToken })).resolves.toEqual({ success: true });
    expect(h.store.rooms.find((room) => room.id === created.roomId)?.status).toBe("active");
  });

  it("refuses a foreign host token for session start", async () => {
    const { created } = await createPs1Room();
    const caller = nextCaller();
    await expect(caller.rooms.start({ roomId: created.roomId, hostToken: "f".repeat(32) })).rejects.toThrow(/صلاحية/);
  });

  it("rate-limits room mutations per IP after 15 actions", async () => {
    const caller = callerWithIp("10.99.0.1");
    for (let index = 0; index < 15; index += 1) {
      await caller.rooms.create({ name: `Room ${index}`, system: "ps1", hostName: "Host", visibility: "private" });
    }
    await expect(
      caller.rooms.create({ name: "Room 16", system: "ps1", hostName: "Host", visibility: "private" }),
    ).rejects.toThrow(/عدد كبير من المحاولات/);
  });

  it("caps room creation input lengths via Zod", async () => {
    const caller = nextCaller();
    await expect(
      caller.rooms.create({ name: "x".repeat(65), system: "ps1", hostName: "Host", visibility: "private" }),
    ).rejects.toThrow();
    await expect(
      caller.rooms.create({ name: "Ok Name", system: "dreamcast" as unknown as "ps1", hostName: "Host", visibility: "private" }),
    ).rejects.toThrow();
  });
});
