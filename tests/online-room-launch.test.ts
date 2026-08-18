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
    const module = readProjectFile("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/MoudieEmulatorModule.kt");

    expect(hud).toContain("$systemId.$orientation.hud.$controlId");
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
    expect(famicomRoom).toContain("screenPanResponder.panHandlers");
    expect(famicomRoom).toContain("moudie.famicom.screen.v1.${startOrientation}");
    expect(controller).not.toContain("Math.max(0, Math.min(100");
    expect(controller).not.toContain("Math.max(30, Math.min(94");
    expect(module).toContain('AsyncFunction("prepareNativeCore")');
    expect(nativeRoom).toContain("INSTALL MAME ARCADE CORE");
  });
});
