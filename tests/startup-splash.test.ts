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

  it("uses a plain Expo activity with no native overlay or pre-draw startup gate", () => {
    const activity = readProjectFile("android/app/src/main/java/com/app/moudienetplay/MainActivity.kt");
    expect(activity).toContain("super.onCreate(null)");
    expect(activity).toContain("ReactActivityDelegateWrapper");
    expect(activity).not.toContain("addContentView");
    expect(activity).not.toContain("WAITING FOR APP");
    expect(activity).not.toContain("ReactRootView");
  });

  it("records uncaught native startup failures without installing another visual overlay", () => {
    const application = readProjectFile("android/app/src/main/java/com/app/moudienetplay/MainApplication.kt");
    expect(application).toContain("Thread.setDefaultUncaughtExceptionHandler");
    expect(application).toContain('Log.e("MoudieStartup"');
  });

  it("plays the animated Moudie envelope intro after the lobby has mounted", () => {
    const rootLayout = readProjectFile("app/_layout.tsx");
    const lobby = readProjectFile("app/(tabs)/index.tsx");
    const intro = readProjectFile("components/moudie-launch-intro.tsx");
    const recovery = readProjectFile("components/startup-recovery-boundary.tsx");
    ["PS1", "PSP", "NES", "SEGA", "ARCADE", "SKIP INTRO", "Moudie"].forEach((label) => expect(intro).toContain(label));
    expect(intro).toContain('import { MaterialCommunityIcons } from "@expo/vector-icons"');
    expect(intro).toContain("Animated.sequence([");
    expect(intro).toContain("Animated.stagger(110");
    expect(intro).toContain("sequence.start(() => setVisible(true))");
    expect(intro).toContain("onPress={() => setVisible(true)}");
    expect(intro).toContain("const [visible, setVisible] = useState(false)");
    expect(recovery).toContain("TRY AGAIN");
    expect(recovery).toContain("MOUDIE IS READY");
    expect(rootLayout).not.toContain("MoudieLaunchIntro");
    expect(lobby).toContain('import { MoudieLaunchIntro } from "@/components/moudie-launch-intro"');
    expect(lobby).toContain("<MoudieLaunchIntro>");
  });
});
