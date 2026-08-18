import type { StyleProp, ViewStyle } from "react-native";

export type EmulatorSystem = "nes" | "sega" | "ps1" | "psp" | "arcade";

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

export type EmulatorCoreCapability = {
  system: EmulatorSystem;
  title: string;
  coreName: string;
  available: boolean;
  localPlay: boolean;
  netplay: "retroarch" | "psp-network" | "planned";
  maxRoomMembers: number;
  maxControllerSlots: number;
  acceptedExtensions: string[];
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

export const EMULATOR_SYSTEMS: EmulatorSystem[] = ["nes", "ps1", "psp", "sega", "arcade"];
