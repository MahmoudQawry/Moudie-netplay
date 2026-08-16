import { describe, expect, it } from "vitest";

import { getFamicomFocusRuntime } from "../lib/famicom-focus-runtime";

describe("Famicom focus runtime", () => {
  it("uses the native renderer and audio path on Android", () => {
    expect(getFamicomFocusRuntime("android")).toBe("native-focus");
  });

  it("retains the WebView-only path for browser preview", () => {
    expect(getFamicomFocusRuntime("web")).toBe("web-focus");
  });
});
