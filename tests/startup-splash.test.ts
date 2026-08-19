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
    expect(rootLayout).toContain('if (Platform.OS !== "web") return;');
  });

  it("does not install Expo's native pre-draw splash gate that can retain the Android logo", () => {
    const activity = readProjectFile("android/app/src/main/java/com/app/moudienetplay/MainActivity.kt");
    const manifest = readProjectFile("android/app/src/main/AndroidManifest.xml");
    const config = readProjectFile("app.config.ts");
    expect(activity).not.toContain("SplashScreenManager.registerOnActivity(this)");
    expect(activity).not.toContain("SplashScreenManager.hide()");
    expect(manifest).toContain('android:theme="@style/AppTheme"');
    expect(manifest).not.toContain('android:theme="@style/Theme.App.SplashScreen"');
    expect(config).not.toContain('"expo-splash-screen"');
  });

  it("lets the native Moudie recovery layer detect a mounted React root without importing the emulator module from startup", () => {
    const activity = readProjectFile("android/app/src/main/java/com/app/moudienetplay/MainActivity.kt");
    const rootLayout = readProjectFile("app/_layout.tsx");
    expect(activity).toContain("installNativeStartupOverlay()");
    expect(activity).toContain("fun markReactContentReady()");
    expect(activity).toContain("hasMountedReactContent");
    expect(activity).toContain("ReactRootView");
    expect(activity).toContain("WAITING FOR APP…");
    expect(rootLayout).not.toContain("MoudieEmulatorModule.markStartupReady()");
  });

  it("delays the animated Moudie envelope until after the lobby and native recovery layers are visible", () => {
    const rootLayout = readProjectFile("app/_layout.tsx");
    const lobby = readProjectFile("app/(tabs)/index.tsx");
    const intro = readProjectFile("components/moudie-launch-intro.tsx");
    const recovery = readProjectFile("components/startup-recovery-boundary.tsx");
    ["PS1", "PSP", "NES", "SEGA", "ARCADE", "SKIP INTRO", "Moudie"].forEach((label) => expect(intro).toContain(label));
    expect(intro).toContain("const reveal = setTimeout(() => {");
    expect(intro).toContain("setVisible(true);");
    expect(intro).toContain("setTimeout(() => setVisible(false), 3800)");
    expect(recovery).toContain("TRY AGAIN");
    expect(recovery).toContain("MOUDIE IS READY");
    expect(rootLayout).not.toContain("MoudieLaunchIntro");
    expect(lobby).toContain('import { MoudieLaunchIntro } from "@/components/moudie-launch-intro"');
    expect(lobby).toContain("<MoudieLaunchIntro>");
  });
});
