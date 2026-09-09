import { describe, expect, it } from "vitest";

import {
  FAMICOM_MAX_ACTIVE_PLAYERS,
  FAMICOM_MAX_SPECTATORS,
  MIN_ACTIVE_PLAYERS,
  ROOM_CAPACITIES,
  STANDARD_MAX_ACTIVE_PLAYERS,
  STANDARD_MAX_SPECTATORS,
  canStartOnlineSession,
  roomMemberLimit,
} from "../shared/room-capacity";

describe("online room capacity", () => {
  it("uses 4 active players and 4 spectators for four-controller emulators", () => {
    expect(MIN_ACTIVE_PLAYERS).toBe(2);
    expect(STANDARD_MAX_ACTIVE_PLAYERS).toBe(4);
    expect(STANDARD_MAX_SPECTATORS).toBe(4);
    for (const system of ["ps1", "psp", "sega"] as const) {
      expect(ROOM_CAPACITIES[system]).toEqual({ minPlayers: 2, maxPlayers: 4, maxSpectators: 4 });
      expect(roomMemberLimit(system)).toBe(8);
    }
  });

  it("uses 2 active players and 6 spectators for Famicom", () => {
    expect(FAMICOM_MAX_ACTIVE_PLAYERS).toBe(2);
    expect(FAMICOM_MAX_SPECTATORS).toBe(6);
    expect(ROOM_CAPACITIES.nes).toEqual({ minPlayers: 2, maxPlayers: 2, maxSpectators: 6 });
    expect(roomMemberLimit("nes")).toBe(8);
  });

  it("requires at least two active players for every emulator", () => {
    for (const system of ["ps1", "psp", "nes", "sega"] as const) {
      expect(canStartOnlineSession(system, 1)).toBe(false);
      expect(canStartOnlineSession(system, 2)).toBe(true);
    }
  });

  it("never permits more than the configured active-player limit", () => {
    expect(canStartOnlineSession("nes", 2)).toBe(true);
    expect(canStartOnlineSession("nes", 3)).toBe(false);
    expect(canStartOnlineSession("ps1", 4)).toBe(true);
    expect(canStartOnlineSession("ps1", 5)).toBe(false);
  });
});
