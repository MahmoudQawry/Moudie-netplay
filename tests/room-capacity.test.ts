import { describe, expect, it } from "vitest";

import {
  MIN_ACTIVE_PLAYERS,
  MAX_ACTIVE_PLAYERS,
  MAX_SPECTATORS,
  MAX_ROOM_MEMBERS,
  ROOM_CAPACITY_LABEL,
  canStartOnlineSession,
} from "../shared/room-capacity";

describe("online room capacity", () => {
  it("uses 2-8 active players and at most 4 spectators", () => {
    expect(MIN_ACTIVE_PLAYERS).toBe(2);
    expect(MAX_ACTIVE_PLAYERS).toBe(8);
    expect(MAX_SPECTATORS).toBe(4);
    expect(MAX_ROOM_MEMBERS).toBe(12);
    expect(ROOM_CAPACITY_LABEL).toBe("2-8 PLAYERS · 4 SPECTATORS");
  });

  it("does not start a game with fewer than two active players", () => {
    expect(canStartOnlineSession(1)).toBe(false);
    expect(canStartOnlineSession(2)).toBe(true);
    expect(canStartOnlineSession(8)).toBe(true);
    expect(canStartOnlineSession(9)).toBe(false);
  });
});
