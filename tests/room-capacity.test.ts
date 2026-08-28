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
  it("uses 2-8 active players and at most 2 spectators for standard emulators", () => {
    expect(MIN_ACTIVE_PLAYERS).toBe(2);
    expect(STANDARD_MAX_ACTIVE_PLAYERS).toBe(8);
    expect(STANDARD_MAX_SPECTATORS).toBe(2);
    expect(ROOM_CAPACITIES.ps1).toEqual({ minPlayers: 2, maxPlayers: 8, maxSpectators: 2 });
    expect(ROOM_CAPACITIES.psp).toEqual({ minPlayers: 2, maxPlayers: 8, maxSpectators: 2 });
    expect(ROOM_CAPACITIES.sega).toEqual({ minPlayers: 2, maxPlayers: 8, maxSpectators: 2 });
    expect(ROOM_CAPACITIES.arcade).toEqual({ minPlayers: 2, maxPlayers: 8, maxSpectators: 2 });
    expect(roomMemberLimit("ps1")).toBe(10);
  });

  it("exposes the same 8-player and 2-spectator lobby policy for Famicom", () => {
    expect(FAMICOM_MAX_ACTIVE_PLAYERS).toBe(8);
    expect(FAMICOM_MAX_SPECTATORS).toBe(2);
    expect(ROOM_CAPACITIES.nes).toEqual({ minPlayers: 2, maxPlayers: 8, maxSpectators: 2 });
    expect(roomMemberLimit("nes")).toBe(10);
  });

  it("requires at least two active players for every emulator", () => {
    for (const system of ["ps1", "psp", "nes", "sega", "arcade"] as const) {
      expect(canStartOnlineSession(system, 1)).toBe(false);
      expect(canStartOnlineSession(system, 2)).toBe(true);
    }
  });

  it("never permits more than the configured active-player limit", () => {
    expect(canStartOnlineSession("nes", 8)).toBe(true);
    expect(canStartOnlineSession("ps1", 8)).toBe(true);
    expect(canStartOnlineSession("ps1", 9)).toBe(false);
  });
});
