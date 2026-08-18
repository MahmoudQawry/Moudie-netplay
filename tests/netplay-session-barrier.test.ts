import { describe, expect, it } from "vitest";

import { createSessionBarrier } from "../lib/netplay-session-barrier";

const fingerprint = "a".repeat(64);
const peer = (memberId: number, role: "host" | "player" = "player") => ({ memberId, role, fingerprint, coreVersion: "core-1" });

describe("NetPlay ready barrier", () => {
  it("approves a shared start time and preserves the verified active-player order", () => {
    expect(createSessionBarrier([peer(1, "host"), peer(2)], 1_000)).toEqual({ fingerprint, coreVersion: "core-1", hostMemberId: 1, playerMemberIds: [1, 2], startAt: 4_000 });
  });

  it("supports eight verified active players but refuses a ninth player", () => {
    const eightPlayers = Array.from({ length: 8 }, (_, index) => peer(index + 1, index === 0 ? "host" : "player"));
    expect(createSessionBarrier(eightPlayers, 1_000)?.playerMemberIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(createSessionBarrier([...eightPlayers, peer(9)], 1_000)).toBeNull();
  });

  it("refuses a start when a file or core version differs", () => {
    expect(createSessionBarrier([peer(1, "host"), { ...peer(2), fingerprint: "b".repeat(64) }], 1_000)).toBeNull();
  });
});
