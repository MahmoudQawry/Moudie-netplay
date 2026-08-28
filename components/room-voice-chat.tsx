export { RoomVoiceChat } from "./room-voice-chat.web";

export type RoomVoiceChatHandle = {
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setSpeakerEnabled?: (enabled: boolean) => Promise<void>;
};
