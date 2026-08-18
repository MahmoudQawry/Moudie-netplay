import { NativeModule, registerWebModule } from "expo";

import type { EmulatorCoreCapability, EmulatorRuntimeStatus, EmulatorSystem, MoudieEmulatorModuleEvents, PreparedLocalGame } from "./MoudieEmulator.types";

class MoudieEmulatorModule extends NativeModule<MoudieEmulatorModuleEvents> {
  getRuntimeStatus(): EmulatorRuntimeStatus {
    return { runtime: "web-preview", supportedSystems: ["nes", "ps1", "psp", "sega", "arcade"], nativeBuildRequired: true };
  }

  getBiosStatus() {
    return {
      nes: { required: false, available: true, message: "Famicom/NES لا يحتاج BIOS." },
      ps1: { required: false, available: false, message: "فحص BIOS المحلي متاح في APK Android فقط." },
      sega: { required: false, available: false, message: "لا يوجد مشغّل Sega مدمج بعد." },
      psp: { required: false, available: false, message: "لا يوجد مشغّل PSP مدمج بعد." },
    };
  }

  getPs1LaunchStatus() {
    return { available: false, message: "مشغّل PS1 الأصلي متاح في نسخة Android فقط." };
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
      message: "المعاينة على الويب تعرض الواجهة فقط؛ التشغيل المحلي يتطلب APK Android.",
    }));
  }

  prepareLocalGame(system: EmulatorSystem, uri: string): PreparedLocalGame {
    return { system, uri, ready: false, message: "تشغيل المحركات الأصلية يتطلب بناء أندرويد جديداً." };
  }

  async launchPS1Game(): Promise<void> {
    throw new Error("مشغّل PS1 الأصلي متاح في نسخة Android فقط.");
  }

  async launchNativeGame(): Promise<void> {
    throw new Error("المشغّل الأصلي متاح في APK Android فقط.");
  }

  async fingerprintPS1Game(): Promise<string> {
    throw new Error("فحص بصمة ملفات PS1 متاح في نسخة Android فقط.");
  }

  async launchFamicomCompatGame(): Promise<void> {
    throw new Error("وضع توافق Famicom الموسّع متاح في نسخة Android فقط.");
  }

  async setFamicomFocusLandscape(): Promise<void> {
    // The browser preview follows the browser's orientation and needs no native request.
  }

  async installPS1Bios(): Promise<Record<string, { required: boolean; available: boolean; files?: string[]; message: string }>> {
    throw new Error("إضافة BIOS محلي متاحة في نسخة Android فقط.");
  }
}

export default registerWebModule(MoudieEmulatorModule, "MoudieEmulator");
