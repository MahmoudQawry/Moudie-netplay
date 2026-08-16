import { describe, expect, it } from "vitest";

import { normalizeSyncId, shouldApplyAuthoritativeState } from "../lib/netplay-sync";

describe("authoritative NetPlay checkpoints", () => {
  it("accepts only safe nonnegative checkpoint ids", () => {
    expect(normalizeSyncId(4)).toBe(4);
    expect(normalizeSyncId("5")).toBe(5);
    expect(normalizeSyncId(-1)).toBeNull();
    expect(normalizeSyncId(1.5)).toBeNull();
  });

  it("never reapplies a stale or duplicated checkpoint", () => {
    expect(shouldApplyAuthoritativeState(8, 9)).toBe(true);
    expect(shouldApplyAuthoritativeState(8, 8)).toBe(false);
    expect(shouldApplyAuthoritativeState(8, 7)).toBe(false);
  });
});
