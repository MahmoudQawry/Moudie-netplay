import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const gameRooms = mysqlTable(
  "game_rooms",
  {
    id: int("id").autoincrement().primaryKey(),
    joinCode: varchar("joinCode", { length: 8 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    system: mysqlEnum("system", ["psp", "nes", "sega", "ps1"]).notNull(),
    hostTokenHash: varchar("hostTokenHash", { length: 64 }).notNull(),
    maxPlayers: int("maxPlayers").notNull(),
    status: mysqlEnum("status", ["waiting", "active", "closed"]).default("waiting").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("game_rooms_join_code_unique").on(table.joinCode),
    index("game_rooms_status_idx").on(table.status),
  ],
);

export const roomMembers = mysqlTable(
  "room_members",
  {
    id: int("id").autoincrement().primaryKey(),
    roomId: int("roomId").notNull(),
    displayName: varchar("displayName", { length: 32 }).notNull(),
    role: mysqlEnum("role", ["host", "player"]).default("player").notNull(),
    accessTokenHash: varchar("accessTokenHash", { length: 64 }).notNull(),
    isReady: boolean("isReady").default(false).notNull(),
    gameFingerprint: varchar("gameFingerprint", { length: 128 }),
    coreVersion: varchar("coreVersion", { length: 64 }),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("room_members_room_idx").on(table.roomId),
    uniqueIndex("room_members_access_token_unique").on(table.accessTokenHash),
  ],
);

export type GameRoom = typeof gameRooms.$inferSelect;
export type RoomMember = typeof roomMembers.$inferSelect;
