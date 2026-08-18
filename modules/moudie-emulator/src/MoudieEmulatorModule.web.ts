import { NativeModule, registerWebModule } from "expo";

import type { EmulatorCoreCapability, EmulatorRuntimeStatus, EmulatorSystem, MoudieEmulatorModuleEvents, PreparedLocalGame } from "./MoudieEmulator.types";

class MoudieEmulatorModule extends NativeModule<MoudieEmulatorModuleEvents> {
  getRuntimeStatus(): EmulatorRuntimeStatus {
    return { runtime: "web-preview", supportedSystems: ["nes", "ps1", "psp", "sega", "arcade"], nativeBuildRequired: true };
  }

  getBiosStatus() {
    return {
      nes: { required: false, available: true, message: "Famicom/NES does not require a BIOS." },
      ps1: { required: false, available: false, message: "Local BIOS checking is available in the Android APK only." },
      sega: { required: false, available: false, message: "The Sega native player is available in the Android APK only." },
      psp: { required: false, available: false, message: "The PSP native player is available in the Android APK only." },
    };
  }

  getPs1LaunchStatus() {
    return { available: false, message: "The native PS1 player is available in the Android APK only." };
  }

  getCoreCatalog(): EmulatorCoreCapability[] {
    return [
      ["nes", "Famicom / NES", "FCEUmm", "retroarch", 4],
      ["ps1", "PlayStation 1", "PCSX-ReARMed", "retroarch", 8],
      ["psp", "PlayStation Portable", "PPSSPP", "psp-network", 4],
      ["sega", "Sega Genesis / Mega Drive", "Genesis Plus GX", "retroarch", 4],
      ["arcade", "Arcade", "MAME Arcade", "retroarch", 4],
    ].map(([system, title, coreName, netplay, maxControllerSlots]) => ({
      system: system as EmulatorSystem,
      title: title as string,
      coreName: coreName as string,
      available: false,
      downloadable: system === "arcade",
      localPlay: false,
      netplay: netplay as EmulatorCoreCapability["netplay"],
      maxRoomMembers: 10,
      maxControllerSlots: maxControllerSlots as number,
      acceptedExtensions: [],
      message: "The web preview shows the interface only; local emulation requires the Android APK.",
    }));
  }

  prepareLocalGame(system: EmulatorSystem, uri: string): PreparedLocalGame {
    return { system, uri, ready: false, message: "Native cores require the Android APK." };
  }

  async launchPS1Game(): Promise<void> {
    throw new Error("The native PS1 player is available in the Android APK only.");
  }

  async launchNativeGame(): Promise<void> {
    throw new Error("The native player is available in the Android APK only.");
  }

  async fingerprintPS1Game(): Promise<string> {
    throw new Error("PS1 file fingerprinting is available in the Android APK only.");
  }

  async launchFamicomCompatGame(): Promise<void> {
    throw new Error("Famicom compatibility mode is available in the Android APK only.");
  }

  async launchFamicomFocusGame(): Promise<void> {
    throw new Error("Famicom focus mode is available in the Android APK only.");
  }

  async setFamicomFocusLandscape(): Promise<void> {
    // The browser preview follows the browser's orientation and needs no native request.
  }

  async installPS1Bios(): Promise<Record<string, { required: boolean; available: boolean; files?: string[]; message: string }>> {
    throw new Error("Local BIOS installation is available in the Android APK only.");
  }
}

export default registerWebModule(MoudieEmulatorModule, "MoudieEmulator");
