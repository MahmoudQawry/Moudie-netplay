import { forwardRef, useImperativeHandle } from "react";
import { View } from "react-native";

type MediaToken = {
  configured: boolean;
  url?: string;
  roomName?: string;
  token?: string;
  canPublish?: boolean;
  message?: string;
};

export type RoomVoiceChatHandle = {
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setSpeakerEnabled: (enabled: boolean) => Promise<void>;
};

type Props = {
  mediaToken?: MediaToken | null;
  memberRole?: "host" | "player" | "spectator";
  // Kept in the shared public API so TypeScript can type-check the same JSX on
  // native and web. The browser fallback intentionally does not open LiveKit.
  socket?: unknown;
  isHost?: boolean;
  remoteOnline?: boolean;
  memberId?: number;
  members?: Array<{ id: number; displayName: string; role: "host" | "player" | "spectator" }>;
};

export const RoomVoiceChat = forwardRef<RoomVoiceChatHandle, Props>(function RoomVoiceChat(_props, ref) {
  useImperativeHandle(ref, () => ({
    setMicrophoneEnabled: async () => undefined,
    setSpeakerEnabled: async () => undefined,
  }), []);

  return <View />;
});
