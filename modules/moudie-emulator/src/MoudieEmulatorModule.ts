import { NativeModule, requireNativeModule } from "expo";

import type { EmulatorRuntimeStatus, EmulatorSystem, MoudieEmulatorModuleEvents, PreparedLocalGame } from "./MoudieEmulator.types";

export type PS1NetplayOptions = {
  serverUrl: string;
  roomId: number;
  memberId: number;
  memberToken: string;
  fingerprint: string;
  player: 1 | 2;
};

declare class MoudieEmulatorModule extends NativeModule<MoudieEmulatorModuleEvents> {
  getRuntimeStatus(): EmulatorRuntimeStatus;
  getBiosStatus(): Record<string, { required: boolean; available: boolean; files?: string[]; message: string }>;
  getPs1LaunchStatus(): { available: boolean; message: string };
  prepareLocalGame(system: EmulatorSystem, uri: string): PreparedLocalGame;
  launchPS1Game(uri: string, fileName: string, netplay?: PS1NetplayOptions): Promise<void>;
  fingerprintPS1Game(uri: string, fileName: string): Promise<string>;
  launchFamicomCompatGame(uri: string, fileName: string): Promise<void>;
  launchFamicomFocusGame(uri: string, fileName: string): Promise<void>;
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
  const unavailable = "وحدة المحاكاة غير جاهزة في هذه النسخة. أعد تثبيت أحدث APK كاملاً.";
  const reject = () => Promise.reject(new Error(unavailable));
  return {
    getRuntimeStatus: () => ({ runtime: "android-native", supportedSystems: [], nativeBuildRequired: true }) as EmulatorRuntimeStatus,
    getBiosStatus: () => ({}),
    getPs1LaunchStatus: () => ({ available: false, message: unavailable }),
    prepareLocalGame: () => { throw new Error(unavailable); },
    launchPS1Game: reject,
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
