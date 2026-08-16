import { describe, expect, it } from "vitest";

import { createSessionBarrier } from "../lib/netplay-session-barrier";

describe("NetPlay ready barrier", () => {
  it("approves a shared start time only for matching host and player", () => {
    expect(createSessionBarrier([
      { memberId: 1, role: "host", fingerprint: "a".repeat(64), coreVersion: "core-1" },
      { memberId: 2, role: "player", fingerprint: "a".repeat(64), coreVersion: "core-1" },
    ], 1_000)).toEqual({ fingerprint: "a".repeat(64), coreVersion: "core-1", hostMemberId: 1, startAt: 4_000 });
  });

  it("refuses a start when a file or core version differs", () => {
    expect(createSessionBarrier([
      { memberId: 1, role: "host", fingerprint: "a".repeat(64), coreVersion: "core-1" },
      { memberId: 2, role: "player", fingerprint: "b".repeat(64), coreVersion: "core-1" },
    ], 1_000)).toBeNull();
  });
});
