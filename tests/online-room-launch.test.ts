import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(__dirname, "..");
const readProjectFile = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("online room launch safeguards", () => {
  it("uses current launch callbacks when synchronized PS1, PSP, Sega, or Arcade start events arrive", () => {
    const ps1 = readProjectFile("app/ps1/[roomId].tsx");
    const psp = readProjectFile("app/psp/[roomId].tsx");
    const native = readProjectFile("app/native/[system]/[roomId].tsx");

    expect(ps1).toContain("launchGameRef.current(true, false, true)");
    expect(psp).toContain("launchGameRef.current(true, false, true)");
    expect(native).toContain("launchRef.current(true, false, true)");
  });

  it("ships a compact persistent HUD, an OPTIONS menu, free control placement, and explicit Arcade preparation", () => {
    const hud = readProjectFile("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/DraggableHudButton.kt");
    const ps1 = readProjectFile("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/PS1PlayerActivity.kt");
    const universal = readProjectFile("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalLibretroPlayerActivity.kt");
    const famicom = readProjectFile("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/FamicomCompatPlayerActivity.kt");
    const famicomHud = readProjectFile("components/draggable-hud-controls.tsx");
    const famicomRoom = readProjectFile("app/famicom/[roomId].tsx");
    const controller = readProjectFile("components/customizable-controller.tsx");
    const nativeRoom = readProjectFile("app/native/[system]/[roomId].tsx");
    const ps1Room = readProjectFile("app/ps1/[roomId].tsx");
    const module = readProjectFile("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/MoudieEmulatorModule.kt");
    const moduleBridge = readProjectFile("modules/moudie-emulator/src/MoudieEmulatorModule.ts");
    const ps1Client = readProjectFile("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/Ps1NetplayClient.kt");
    const universalClient = readProjectFile("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalNetplayClient.kt");
    const library = readProjectFile("app/library/[system].tsx");
    const oauth = readProjectFile("constants/oauth.ts");

    expect(hud).toContain("$systemId.$orientation.hud.$controlId");
    expect(hud).toContain("fun resizeBy(delta: Float)");
    expect(hud).not.toContain("coerceIn(.65f, 1.75f)");
    [ps1, universal, famicom].forEach((player) => {
      expect(player).toContain("Triple(\"OPTIONS\"");
      expect(player).toContain('"speaker"');
      expect(player).toContain("SAVE GAME");
      expect(player).toContain("LOAD GAME");
      expect(player).toContain("EXIT GAME");
      expect(player).not.toContain("coerceIn(.65f, 1.75f)");
    });
    expect(famicom).toContain("directionalControlBackground()");
    expect(famicom).toContain("isDirection = control.id in setOf(\"up\", \"down\", \"left\", \"right\")");
    expect(famicomHud).toContain("moudie.hud-layout.v2.${system}.${orientation}");
    expect(famicomHud).toContain('"speaker"');
    expect(famicomHud).toContain('"options"');
    expect(famicomHud).toContain("onSave");
    expect(famicomHud).toContain("onLoad");
    expect(famicomHud).toContain("onExit");
    expect(famicomHud).toContain("onEditLayout");
    expect(famicomHud).toContain("EDIT CONTROLS & SCREEN");
    expect(famicomRoom).toContain("screenPanResponder.panHandlers");
    expect(famicomRoom).toContain("onEditLayout={() => { setFocusMode(true); setFocusControlEditor(true);");
    expect(famicomRoom).toContain("moudie.famicom.screen.v1.${startOrientation}");
    expect(controller).not.toContain("Math.max(0, Math.min(100");
    expect(controller).not.toContain("Math.max(30, Math.min(94");
    expect(module).toContain('AsyncFunction("prepareNativeCore")');
    expect(module).toContain('AsyncFunction("prepareFastLaunch")');
    expect(module).toContain('val sourceKey = MessageDigest.getInstance("SHA-256")');
    expect(moduleBridge).toContain("prepareFastLaunch(system: EmulatorSystem");
    expect(nativeRoom).toContain("INSTALL MAME ARCADE CORE");
    expect(ps1).toContain("createFreeControlCanvas()");
    expect(ps1).toContain("retroView.setOnTouchListener");
    expect(universal).toContain("retroView.setOnTouchListener");
    expect(famicom).toContain("retroView.setOnTouchListener");
    expect(library).not.toContain("CHOOSE FILE & CONFIGURE");
    expect(famicomRoom).toContain('nativePlayerRef.current?.requestState("netplay")');
    expect(oauth).toContain("const NATIVE_API_FALLBACK_URL = NATIVE_NETPLAY_SERVICE_URL");
    [ps1, universal, famicom].forEach((player) => expect(player).toContain('"EDIT CONTROLS & SCREEN"'));
    expect(ps1).toContain('RENDERMODE_CONTINUOUSLY');
    expect(ps1).toContain('resizeSelectedControl(-.1f)');
    expect(universal).toContain('resizeSelectedItem(-.1f)');
    expect(ps1).toContain('controlsContainer.addView(createFreeControlCanvas()');
    expect(ps1).toContain('keepControlVisible(view)');
    expect(ps1Client).toContain('reconnectionAttempts = 1');
    expect(ps1Client).toContain('reconnectionDelayMax = 500');
    expect(universalClient).toContain('reconnectionAttempts = 1');
    expect(universalClient).toContain('reconnectionDelayMax = 500');
    expect(ps1Room).toContain("prepareFastLaunch(\"ps1\"");
    expect(nativeRoom).toContain("prepareFastLaunch(system as EmulatorSystem");
  });
});
