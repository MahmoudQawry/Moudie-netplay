import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = process.env.ALLOWED_ORIGINS;

async function loadModule() {
  vi.resetModules();
  const mod = await import("../server/_core/cors");
  return mod;
}

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ALLOWED_ORIGINS;
  else process.env.ALLOWED_ORIGINS = ORIGINAL;
});

describe("isAllowedOrigin", () => {
  it("always allows requests without an Origin header (native apps)", async () => {
    delete process.env.ALLOWED_ORIGINS;
    const { isAllowedOrigin } = await loadModule();
    expect(isAllowedOrigin(undefined)).toBe(true);
  });

  it("allows localhost development origins when no allowlist is configured", async () => {
    delete process.env.ALLOWED_ORIGINS;
    const { isAllowedOrigin } = await loadModule();
    expect(isAllowedOrigin("http://localhost:8081")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:19006")).toBe(true);
  });

  it("rejects non-local origins when no allowlist is configured", async () => {
    delete process.env.ALLOWED_ORIGINS;
    const { isAllowedOrigin } = await loadModule();
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
  });

  it("honors the configured allowlist exactly", async () => {
    process.env.ALLOWED_ORIGINS = "https://classic.example.com,https://stage.example.com";
    const { isAllowedOrigin } = await loadModule();
    expect(isAllowedOrigin("https://classic.example.com")).toBe(true);
    expect(isAllowedOrigin("https://stage.example.com")).toBe(true);
    expect(isAllowedOrigin("https://other.example.com")).toBe(false);
    expect(isAllowedOrigin("http://localhost:8081")).toBe(false);
  });

  it("supports an explicit wildcard", async () => {
    process.env.ALLOWED_ORIGINS = "*";
    const { isAllowedOrigin } = await loadModule();
    expect(isAllowedOrigin("https://anything.example.com")).toBe(true);
  });
});
