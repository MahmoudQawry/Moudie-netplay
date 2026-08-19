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
    expect(rootLayout).toContain("MoudieLaunchIntro");
    expect(rootLayout).toContain("StartupRecoveryBoundary");
    expect(rootLayout).toContain('if (Platform.OS !== "web") return;');
  });

  it("lets Android hand the splash to the first React frame rather than revealing an empty screen early", () => {
    const activity = readProjectFile("android/app/src/main/java/com/app/moudienetplay/MainActivity.kt");
    expect(activity).toContain("SplashScreenManager.registerOnActivity(this)");
    expect(activity).not.toContain("startupHandler.postDelayed");
    expect(activity).not.toContain("SplashScreenManager.hide()");
  });

  it("ships an animated Moudie envelope sequence that can always be skipped and a visible recovery screen", () => {
    const intro = readProjectFile("components/moudie-launch-intro.tsx");
    const recovery = readProjectFile("components/startup-recovery-boundary.tsx");
    ["PS1", "PSP", "NES", "SEGA", "ARCADE", "SKIP INTRO", "Moudie"].forEach((label) => expect(intro).toContain(label));
    expect(intro).toContain("setTimeout(() => setVisible(false), 2500)");
    expect(recovery).toContain("TRY AGAIN");
    expect(recovery).toContain("MOUDIE IS READY");
  });
});
