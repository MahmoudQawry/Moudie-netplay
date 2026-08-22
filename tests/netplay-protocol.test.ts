import { describe, expect, it } from "vitest";

import { normalizeNetplayInput } from "../lib/netplay-protocol";

describe("NetPlay input relay", () => {
  it("assigns host input to player one and sanitizes frame numbers", () => {
    expect(normalizeNetplayInput("host", { button: "A", isDown: true, frame: 12.9 })).toEqual({ player: 1, button: "A", isDown: true, frame: 12 });
  });

  it("assigns joined player input to player two by default", () => {
    expect(normalizeNetplayInput("player", { button: "LEFT", isDown: false, frame: -3 })).toEqual({ player: 2, button: "LEFT", isDown: false, frame: 0 });
  });

  it("preserves an authenticated player seat instead of trusting a spoofed seat", () => {
    expect(normalizeNetplayInput("player", { button: "B", isDown: true, frame: 7, player: 8 }, 4)).toEqual({ player: 4, button: "B", isDown: true, frame: 7 });
  });

  it("accepts all eight valid player seats", () => {
    for (const player of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      expect(normalizeNetplayInput("player", { button: "A", isDown: true, frame: 1 }, player)?.player).toBe(player);
    }
  });

  it("rejects malformed input instead of relaying it", () => {
    expect(normalizeNetplayInput("host", { button: "INVALID", isDown: true })).toBeNull();
    expect(normalizeNetplayInput("host", { button: "B", isDown: "yes" })).toBeNull();
  });
});
