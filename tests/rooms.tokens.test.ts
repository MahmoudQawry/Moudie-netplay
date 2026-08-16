import { describe, expect, it } from "vitest";
import { createAccessToken, createJoinCode, hashAccessToken } from "../server/rooms";

describe("room access credentials", () => {
  it("creates a six-character invitation code from the safe alphabet", () => {
    const code = createJoinCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("creates a non-reversible hash that stays stable for the same token", () => {
    const token = createAccessToken();
    expect(token.length).toBeGreaterThan(30);
    expect(hashAccessToken(token)).toHaveLength(64);
    expect(hashAccessToken(token)).toBe(hashAccessToken(token));
  });
});

