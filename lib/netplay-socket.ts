import { io, type Socket } from "socket.io-client";

import { getApiBaseUrl } from "@/constants/oauth";

export type NetplayCredentials = {
  roomId: number;
  memberId: number;
  memberToken: string;
};

export type NetplayInput = {
  memberId: number;
  player: 1 | 2;
  button: "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B" | "START" | "SELECT";
  isDown: boolean;
  frame: number;
};

export type RoomChatMessage = {
  id: string;
  memberId: number;
  displayName: string;
  text: string;
  sentAt: number;
};

export type VoiceStatus = {
  memberId: number;
  microphoneEnabled: boolean;
  speakerEnabled: boolean;
};

export function createNetplaySocket(credentials: NetplayCredentials): Socket {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) throw new Error("تعذر تحديد خادم الغرفة. تحقق من اتصال التطبيق بالإنترنت.");
  return io(baseUrl, {
    path: "/api/netplay",
    transports: ["websocket", "polling"],
    upgrade: true,
    auth: credentials,
    timeout: 20_000,
    reconnection: true,
    reconnectionAttempts: 12,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 8_000,
    randomizationFactor: 0.5,
  });
}
