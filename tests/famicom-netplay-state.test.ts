import { describe, expect, it } from "vitest";

import { decodeFamicomMessage } from "../lib/famicom-netplay";

describe("Famicom authoritative state messages", () => {
  it("keeps the authoritative sync id with a valid state snapshot", () => {
    expect(decodeFamicomMessage({ type: "state", snapshot: "state-data", syncId: 12 })).toEqual({
      type: "state",
      snapshot: "state-data",
      syncId: 12,
    });
  });

  it("rejects an unnumbered or invalid state snapshot", () => {
    expect(decodeFamicomMessage({ type: "state", snapshot: "state-data" })).toBeNull();
    expect(decodeFamicomMessage({ type: "state", snapshot: "state-data", syncId: -1 })).toBeNull();
  });
});
