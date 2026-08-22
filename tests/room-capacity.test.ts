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
  it("uses 2-6 active players and at most 4 spectators for standard emulators", () => {
    expect(MIN_ACTIVE_PLAYERS).toBe(2);
    expect(STANDARD_MAX_ACTIVE_PLAYERS).toBe(6);
    expect(STANDARD_MAX_SPECTATORS).toBe(4);
    expect(ROOM_CAPACITIES.ps1).toEqual({ minPlayers: 2, maxPlayers: 6, maxSpectators: 4 });
    expect(ROOM_CAPACITIES.psp).toEqual({ minPlayers: 2, maxPlayers: 6, maxSpectators: 4 });
    expect(ROOM_CAPACITIES.sega).toEqual({ minPlayers: 2, maxPlayers: 6, maxSpectators: 4 });
    expect(ROOM_CAPACITIES.arcade).toEqual({ minPlayers: 2, maxPlayers: 6, maxSpectators: 4 });
    expect(roomMemberLimit("ps1")).toBe(10);
  });

  it("gives Famicom exactly 2 active seats and up to 6 spectators", () => {
    expect(FAMICOM_MAX_ACTIVE_PLAYERS).toBe(2);
    expect(FAMICOM_MAX_SPECTATORS).toBe(6);
    expect(ROOM_CAPACITIES.nes).toEqual({ minPlayers: 2, maxPlayers: 2, maxSpectators: 6 });
    expect(roomMemberLimit("nes")).toBe(8);
  });

  it("requires at least two active players for every emulator", () => {
    for (const system of ["ps1", "psp", "nes", "sega", "arcade"] as const) {
      expect(canStartOnlineSession(system, 1)).toBe(false);
      expect(canStartOnlineSession(system, 2)).toBe(true);
    }
  });

  it("never permits more than the configured active-player limit", () => {
    expect(canStartOnlineSession("nes", 3)).toBe(false);
    expect(canStartOnlineSession("ps1", 6)).toBe(true);
    expect(canStartOnlineSession("ps1", 7)).toBe(false);
  });
});
