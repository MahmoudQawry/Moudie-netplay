import { and, count, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { gameRooms, InsertUser, roomMembers, users } from "../drizzle/schema";
import { decideSeat, roomCapacityFor, type RoomSystem } from "../shared/room-capacity";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export type RoomServiceDb = NonNullable<ReturnType<typeof drizzle>>;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createRoom(input: {
  joinCode: string;
  name: string;
  system: "psp" | "nes" | "sega" | "ps1";
  hostName: string;
  maxPlayers: number;
  hostTokenHash: string;
  memberTokenHash: string;
  visibility?: "public" | "private";
}) {
  const db = await getDb();
  if (!db) throw new Error("خدمة الغرف غير متاحة حالياً.");

  const roomResult = await db.insert(gameRooms).values({
    joinCode: input.joinCode,
    name: input.name,
    system: input.system,
    hostTokenHash: input.hostTokenHash,
    maxPlayers: input.maxPlayers,
    visibility: input.visibility ?? "private",
  });

  const roomId = Number(roomResult[0].insertId);
  const memberResult = await db.insert(roomMembers).values({
    roomId,
    displayName: input.hostName,
    role: "host",
    accessTokenHash: input.memberTokenHash,
  });

  return { roomId, memberId: Number(memberResult[0].insertId) };
}

export async function findRoomByCode(joinCode: string) {
  const db = await getDb();
  if (!db) throw new Error("خدمة الغرف غير متاحة حالياً.");

  const result = await db.select().from(gameRooms).where(eq(gameRooms.joinCode, joinCode)).limit(1);
  return result[0];
}

export async function findRoomById(roomId: number) {
  const db = await getDb();
  if (!db) throw new Error("خدمة الغرف غير متاحة حالياً.");

  const result = await db.select().from(gameRooms).where(eq(gameRooms.id, roomId)).limit(1);
  return result[0];
}

/** Lists public rooms that are still joinable, newest activity first,
 * with aggregated member counts computed in one members query. */
export async function listPublicRooms(limit: number) {
  const db = await getDb();
  if (!db) throw new Error("خدمة الغرف غير متاحة حالياً.");

  const rooms = await db
    .select()
    .from(gameRooms)
    .where(and(eq(gameRooms.visibility, "public"), inArray(gameRooms.status, ["waiting", "active"])))
    .orderBy(desc(gameRooms.updatedAt))
    .limit(limit);
  if (rooms.length === 0) return [];

  const members = await db
    .select({
      roomId: roomMembers.roomId,
      role: roomMembers.role,
      isReady: roomMembers.isReady,
    })
    .from(roomMembers)
    .where(inArray(roomMembers.roomId, rooms.map((room) => room.id)));

  return rooms.map((room) => {
    const roomMemberRows = members.filter((member) => member.roomId === room.id);
    const activeRoles = roomMemberRows.filter((member) => member.role === "host" || member.role === "player");
    return {
      id: room.id,
      name: room.name,
      system: room.system,
      maxPlayers: room.maxPlayers,
      status: room.status,
      activePlayers: activeRoles.length,
      spectators: roomMemberRows.filter((member) => member.role === "spectator").length,
      readyPlayers: activeRoles.filter((member) => member.isReady).length,
      updatedAt: room.updatedAt,
    };
  });
}

export async function addRoomMember(input: {
  roomId: number;
  displayName: string;
  accessTokenHash: string;
  role?: "player" | "spectator";
}) {
  const db = await getDb();
  if (!db) throw new Error("خدمة الغرف غير متاحة حالياً.");

  const result = await db.insert(roomMembers).values({
    roomId: input.roomId,
    displayName: input.displayName,
    role: input.role ?? "player",
    accessTokenHash: input.accessTokenHash,
  });
  return Number(result[0].insertId);
}

/** Atomically reserves a room seat so concurrent joins cannot exceed capacity.
 * `database` is injectable so behavioral/concurrency tests can drive this
 * function without a live MySQL instance. */
export async function addRoomMemberWithCapacity(input: {
  roomId: number;
  displayName: string;
  accessTokenHash: string;
  role: "player" | "spectator";
  maxPlayers: number;
  maxSpectators: number;
}, database?: RoomServiceDb) {
  const db = database ?? (await getDb());
  if (!db) throw new Error("خدمة الغرف غير متاحة حالياً.");

  return db.transaction(async (tx) => {
    const [room] = await tx.select({ id: gameRooms.id, status: gameRooms.status, system: gameRooms.system })
      .from(gameRooms)
      .where(eq(gameRooms.id, input.roomId))
      .limit(1)
      .for("update");
    if (!room || room.status !== "waiting") throw new Error("الغرفة غير متاحة للانضمام.");

    const members = await tx.select({ role: roomMembers.role }).from(roomMembers).where(eq(roomMembers.roomId, input.roomId));
    const decision = decideSeat(members, input.role, roomCapacityFor(room.system as RoomSystem));
    if (!decision.allowed) {
      if (decision.reason === "players-full") throw new Error(`مقاعد اللعب (${input.maxPlayers}) مكتملة. يمكنك الدخول كمشاهد.`);
      if (decision.reason === "spectators-full") throw new Error(`مقاعد المشاهدة (${input.maxSpectators}) مكتملة.`);
      throw new Error(`الغرفة مكتملة: ${input.maxPlayers} لاعبين و${input.maxSpectators} مشاهدين كحد أقصى.`);
    }

    const result = await tx.insert(roomMembers).values({
      roomId: input.roomId,
      displayName: input.displayName,
      role: input.role,
      accessTokenHash: input.accessTokenHash,
    });
    return Number(result[0].insertId);
  });
}

export async function getRoomMemberCount(roomId: number, role?: "host" | "player" | "spectator") {
  const db = await getDb();
  if (!db) throw new Error("خدمة الغرف غير متاحة حالياً.");

  const where = role ? and(eq(roomMembers.roomId, roomId), eq(roomMembers.role, role)) : eq(roomMembers.roomId, roomId);
  const result = await db.select({ total: count() }).from(roomMembers).where(where);
  return Number(result[0]?.total ?? 0);
}

export async function getMemberByAccessToken(memberId: number, accessTokenHash: string) {
  const db = await getDb();
  if (!db) throw new Error("خدمة الغرف غير متاحة حالياً.");

  const result = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.id, memberId), eq(roomMembers.accessTokenHash, accessTokenHash)))
    .limit(1);
  return result[0];
}

export async function getRoomSnapshot(roomId: number) {
  const db = await getDb();
  if (!db) throw new Error("خدمة الغرف غير متاحة حالياً.");

  const [room] = await db.select().from(gameRooms).where(eq(gameRooms.id, roomId)).limit(1);
  if (!room) return undefined;
  const members = await db
    .select({
      id: roomMembers.id,
      displayName: roomMembers.displayName,
      role: roomMembers.role,
      isReady: roomMembers.isReady,
      gameFingerprint: roomMembers.gameFingerprint,
      coreVersion: roomMembers.coreVersion,
    })
    .from(roomMembers)
    .where(eq(roomMembers.roomId, roomId));
  return { room, members };
}

export async function updateMemberReadiness(input: {
  memberId: number;
  accessTokenHash: string;
  isReady: boolean;
  gameFingerprint?: string;
  coreVersion?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("خدمة الغرف غير متاحة حالياً.");

  const member = await getMemberByAccessToken(input.memberId, input.accessTokenHash);
  if (!member) return false;
  await db
    .update(roomMembers)
    .set({
      isReady: input.isReady,
      gameFingerprint: input.gameFingerprint ?? null,
      coreVersion: input.coreVersion ?? null,
    })
    .where(eq(roomMembers.id, input.memberId));
  return true;
}

export async function activateRoom(roomId: number) {
  const db = await getDb();
  if (!db) throw new Error("خدمة الغرف غير متاحة حالياً.");
  await db.update(gameRooms).set({ status: "active" }).where(eq(gameRooms.id, roomId));
}
