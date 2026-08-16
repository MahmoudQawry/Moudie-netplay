import type { StyleProp, ViewStyle } from "react-native";

export type EmulatorSystem = "nes" | "sega" | "ps1" | "psp";

export type EmulatorRuntimeStatus = {
  runtime: "android-native" | "web-preview";
  supportedSystems: EmulatorSystem[];
  nativeBuildRequired: boolean;
};

export type PreparedLocalGame = {
  system: EmulatorSystem;
  uri: string;
  ready: boolean;
  message: string;
};

export type MoudieEmulatorModuleEvents = {
  nativeOverlayAction: (payload: { action: string; muted: boolean }) => void;
};
export type OnLoadEventPayload = { url: string };
export type MoudieEmulatorViewProps = {
  url: string;
  onLoad?: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};

export const EMULATOR_SYSTEMS: EmulatorSystem[] = ["nes", "sega", "ps1", "psp"];
