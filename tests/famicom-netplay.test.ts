import { describe, expect, it } from "vitest";
import { decodeFamicomMessage, isNesFile, peerIdForRoom } from "../lib/famicom-netplay";

describe("Famicom room protocol", () => {
  it("keeps a deterministic host peer identifier per room", () => {
    expect(peerIdForRoom(28)).toBe("moudie-famicom-room-28");
  });

  it("accepts only local NES files", () => {
    expect(isNesFile("Family Game.NES")).toBe(true);
    expect(isNesFile("archive.zip")).toBe(false);
  });

  it("validates supported network messages", () => {
    expect(decodeFamicomMessage({ type: "input", player: 2, button: "A", isDown: true })).toEqual({ type: "input", player: 2, button: "A", isDown: true });
    expect(decodeFamicomMessage({ type: "state", snapshot: "{}", syncId: 0 })).toEqual({ type: "state", snapshot: "{}", syncId: 0 });
    expect(decodeFamicomMessage({ type: "input", player: 3, button: "A", isDown: true })).toBeNull();
  });
});
