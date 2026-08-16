import { describe, expect, it } from "vitest";

describe("social login configuration", () => {
  const configuredIt = process.env.SOCIAL_LOGIN_E2E === "true" ? it : it.skip;

  configuredIt("validates the configured Facebook app access token with the official debug endpoint", async () => {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    expect(appId, "FACEBOOK_APP_ID is required").toBeTruthy();
    expect(appSecret, "FACEBOOK_APP_SECRET is required").toBeTruthy();

    const appToken = `${appId}|${appSecret}`;
    const url = new URL("https://graph.facebook.com/debug_token");
    url.searchParams.set("input_token", appToken);
    url.searchParams.set("access_token", appToken);
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    expect(response.ok, "Facebook rejected the configured app credentials").toBe(true);
    const payload = await response.json() as { data?: { app_id?: string; is_valid?: boolean } };
    expect(payload.data?.is_valid).toBe(true);
    expect(String(payload.data?.app_id)).toBe(String(appId));
  }, 15_000);
});
