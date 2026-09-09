import { describe, expect, it } from "vitest";
import { decideSeat, roomCapacityFor } from "../shared/room-capacity";

const seats = (players: number, spectators: number) => [
  ...Array.from({ length: players }, () => ({ role: "player" })),
  ...Array.from({ length: spectators }, () => ({ role: "spectator" })),
];

describe("decideSeat", () => {
  it("admits players while standard seats remain (4 players + 4 spectators)", () => {
    const capacity = roomCapacityFor("ps1");
    expect(decideSeat(seats(3, 0), "player", capacity)).toEqual({ allowed: true });
    expect(decideSeat(seats(4, 0), "player", capacity)).toEqual({ allowed: false, reason: "players-full" });
  });

  it("admits spectators until the room is full (8 members)", () => {
    const capacity = roomCapacityFor("ps1");
    expect(decideSeat(seats(4, 3), "spectator", capacity)).toEqual({ allowed: true });
    expect(decideSeat(seats(4, 4), "spectator", capacity)).toEqual({ allowed: false, reason: "room-full" });
  });

  it("treats the host as an active player seat", () => {
    const capacity = roomCapacityFor("nes");
    const members = [{ role: "host" }];
    expect(decideSeat(members, "player", capacity)).toEqual({ allowed: true });
    expect(decideSeat([...members, ...seats(1, 0)], "player", capacity)).toEqual({ allowed: false, reason: "players-full" });
  });

  it("keeps the Famicom 2+6 split separate from standard 4+4 rooms", () => {
    const famicom = roomCapacityFor("nes");
    expect(decideSeat(seats(2, 6), "spectator", famicom)).toEqual({ allowed: false, reason: "room-full" });
    expect(decideSeat(seats(2, 5), "player", famicom)).toEqual({ allowed: false, reason: "players-full" });
  });

  it("rejects players when spectator seats are the only ones full, and vice versa", () => {
    const capacity = roomCapacityFor("psp");
    expect(decideSeat(seats(4, 0), "spectator", capacity)).toEqual({ allowed: true });
    expect(decideSeat(seats(0, 4), "player", capacity)).toEqual({ allowed: true });
    expect(decideSeat(seats(0, 4), "spectator", capacity)).toEqual({ allowed: false, reason: "spectators-full" });
  });
});
