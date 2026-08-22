import { View } from "react-native";

type Props = {
  mediaToken?: { configured: boolean; url?: string; roomName?: string; token?: string; canPublish?: boolean; message?: string } | null;
  memberRole?: "host" | "player" | "spectator";
};

export function RoomVoiceChat(_props: Props) {
  return <View />;
}
