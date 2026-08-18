import { NativeModule, requireNativeModule } from "expo";

import type { EmulatorCoreCapability, EmulatorRuntimeStatus, EmulatorSystem, MoudieEmulatorModuleEvents, PreparedLocalGame } from "./MoudieEmulator.types";

export type PS1NetplayOptions = {
  serverUrl: string;
  roomId: number;
  memberId: number;
  memberToken: string;
  fingerprint: string;
  player: 1 | 2;
};

export type UniversalNetplayOptions = {
  serverUrl: string;
  roomId: number;
  memberId: number;
  memberToken: string;
  system: "psp" | "sega" | "arcade";
  fingerprint: string;
  coreVersion: string;
  player: 1 | 2;
};

export type PlayerLaunchOptions = {
  orientation?: "portrait" | "landscape";
  aspectRatio?: "fit" | "4:3" | "16:9";
  /** Opens controller calibration before gameplay; it never appears during normal play. */
  settingsMode?: boolean;
};

declare class MoudieEmulatorModule extends NativeModule<MoudieEmulatorModuleEvents> {
  getRuntimeStatus(): EmulatorRuntimeStatus;
  getBiosStatus(): Record<string, { required: boolean; available: boolean; files?: string[]; message: string }>;
  getPs1LaunchStatus(): { available: boolean; message: string };
  getCoreCatalog(): EmulatorCoreCapability[];
  prepareLocalGame(system: EmulatorSystem, uri: string): PreparedLocalGame;
  launchPS1Game(uri: string, fileName: string, netplay?: PS1NetplayOptions, options?: PlayerLaunchOptions): Promise<void>;
  launchNativeGame(system: EmulatorSystem, uri: string, fileName: string, options?: PlayerLaunchOptions, netplay?: UniversalNetplayOptions): Promise<void>;
  fingerprintNativeGame(system: EmulatorSystem, uri: string, fileName: string): Promise<string>;
  fingerprintPS1Game(uri: string, fileName: string): Promise<string>;
  launchFamicomCompatGame(uri: string, fileName: string, options?: PlayerLaunchOptions): Promise<void>;
  launchFamicomFocusGame(uri: string, fileName: string, options?: PlayerLaunchOptions): Promise<void>;
  setFamicomFocusLandscape(active: boolean): Promise<void>;
  installPS1Bios(uri: string, fileName: string): Promise<Record<string, { required: boolean; available: boolean; files?: string[]; message: string }>>;
}

/**
 * A missing native module must never prevent Expo Router from mounting the
 * home screen. This can happen after an interrupted installation or on an
 * ABI that does not include the optional emulator libraries. The player
 * screens receive a clear availability status instead of leaving Android on
 * the splash screen.
 */
function unavailableModule(): MoudieEmulatorModule {
  const unavailable = "The emulator module is not ready in this build. Reinstall the latest complete APK.";
  const reject = () => Promise.reject(new Error(unavailable));
  return {
    getRuntimeStatus: () => ({ runtime: "android-native", supportedSystems: [], nativeBuildRequired: true }) as EmulatorRuntimeStatus,
    getBiosStatus: () => ({}),
    getPs1LaunchStatus: () => ({ available: false, message: unavailable }),
    getCoreCatalog: () => [],
    prepareLocalGame: () => { throw new Error(unavailable); },
    launchPS1Game: reject,
    launchNativeGame: reject,
    fingerprintNativeGame: reject,
    fingerprintPS1Game: reject,
    launchFamicomCompatGame: reject,
    launchFamicomFocusGame: reject,
    setFamicomFocusLandscape: reject,
    installPS1Bios: reject,
  } as unknown as MoudieEmulatorModule;
}

let emulatorModule: MoudieEmulatorModule;
try {
  emulatorModule = requireNativeModule<MoudieEmulatorModule>("MoudieEmulator");
} catch {
  emulatorModule = unavailableModule();
}

export default emulatorModule;
