import { and, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { gameRooms, InsertUser, roomMembers, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

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
  system: "psp" | "nes" | "sega" | "ps1" | "arcade";
  hostName: string;
  maxPlayers: number;
  hostTokenHash: string;
  memberTokenHash: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("خدمة الغرف غير متاحة حالياً.");

  const roomResult = await db.insert(gameRooms).values({
    joinCode: input.joinCode,
    name: input.name,
    system: input.system,
    hostTokenHash: input.hostTokenHash,
    maxPlayers: input.maxPlayers,
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
