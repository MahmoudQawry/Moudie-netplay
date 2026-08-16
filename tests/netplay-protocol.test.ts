import { describe, expect, it } from "vitest";

import { normalizeNetplayInput } from "../lib/netplay-protocol";

describe("NetPlay input relay", () => {
  it("assigns host input to player one and sanitizes frame numbers", () => {
    expect(normalizeNetplayInput("host", { button: "A", isDown: true, frame: 12.9 })).toEqual({ player: 1, button: "A", isDown: true, frame: 12 });
  });

  it("assigns joined player input to player two", () => {
    expect(normalizeNetplayInput("player", { button: "LEFT", isDown: false, frame: -3 })).toEqual({ player: 2, button: "LEFT", isDown: false, frame: 0 });
  });

  it("rejects malformed input instead of relaying it", () => {
    expect(normalizeNetplayInput("host", { button: "INVALID", isDown: true })).toBeNull();
    expect(normalizeNetplayInput("host", { button: "B", isDown: "yes" })).toBeNull();
  });
});
