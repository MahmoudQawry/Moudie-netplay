export type FamicomFocusRuntime = "native-focus" | "web-focus";

/** Android focus uses the native FCEUmm activity because WebView focus cannot
 * reliably receive its own touch gesture for audio on all devices. */
export function getFamicomFocusRuntime(platform: string): FamicomFocusRuntime {
  return platform === "web" ? "web-focus" : "native-focus";
}
