import { describe, expect, it } from "vitest";

import { SAVE_STATE_CAPABILITIES } from "../lib/emulator-save-state-capabilities";

describe("save state capabilities", () => {
  it("enables save/load for all five supported emulator systems", () => {
    expect(SAVE_STATE_CAPABILITIES.nes.available).toBe(true);
    expect(SAVE_STATE_CAPABILITIES.ps1.available).toBe(true);
    expect(SAVE_STATE_CAPABILITIES.psp.available).toBe(true);
    expect(SAVE_STATE_CAPABILITIES.sega.available).toBe(true);
    expect(SAVE_STATE_CAPABILITIES.arcade.available).toBe(true);
  });
});
