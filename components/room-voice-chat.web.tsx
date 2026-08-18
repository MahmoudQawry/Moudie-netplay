import { forwardRef, useImperativeHandle } from "react";
import type { Socket } from "socket.io-client";

type Props = {
  socket: Socket | null;
  isHost: boolean;
  remoteOnline: boolean;
  memberId?: number;
  members?: { id: number; displayName: string; role: "host" | "player" | "spectator" }[];
};

export type RoomVoiceChatHandle = { setMicrophoneEnabled: (enabled: boolean) => Promise<void> };

/** Voice chat uses Android-native WebRTC and is intentionally unavailable in web preview. */
export const RoomVoiceChat = forwardRef<RoomVoiceChatHandle, Props>(function RoomVoiceChat(_props, ref) {
  useImperativeHandle(ref, () => ({ setMicrophoneEnabled: async () => undefined }), []);
  return null;
});
