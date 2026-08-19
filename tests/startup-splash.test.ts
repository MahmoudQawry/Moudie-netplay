import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(__dirname, "..");
const readProjectFile = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("Android startup splash safeguards", () => {
  it("does not retain the native splash from JavaScript before React content appears", () => {
    const rootLayout = readProjectFile("app/_layout.tsx");
    expect(rootLayout).not.toContain("preventAutoHideAsync");
    expect(rootLayout).not.toContain("SplashScreen.hideAsync");
  });

  it("provides a native timeout fallback that releases the splash screen", () => {
    const activity = readProjectFile("android/app/src/main/java/com/app/moudienetplay/MainActivity.kt");
    expect(activity).toContain("startupHandler.postDelayed(startupSplashFallback, 4000L)");
    expect(activity).toContain("Runnable { SplashScreenManager.hide() }");
    expect(activity).toContain("startupHandler.removeCallbacks(startupSplashFallback)");
  });
});
