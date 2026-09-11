import { io, type Socket } from "socket.io-client";

import { getNetplayServiceUrl } from "@/constants/oauth";

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
  const baseUrl = getNetplayServiceUrl();
  if (!baseUrl) throw new Error("Could not determine the room server. Check the app's internet connection.");
  return io(baseUrl, {
    path: "/api/netplay",
    // PUBG-style: aggressive reconnection for seamless experience
    transports: ["websocket"],
    upgrade: false,
    auth: credentials,
    timeout: 20_000,
    reconnection: true,
    reconnectionAttempts: 30, // Increased from 12 for PUBG-style persistence
    reconnectionDelay: 300, // Faster initial retry (was 1000)
    reconnectionDelayMax: 3_000, // Lower max for quicker recovery (was 8000)
    randomizationFactor: 0.3, // Less randomization for more predictable retries
    // Additional PUBG-style optimizations
    forceNew: false,
    autoConnect: true,
  });
}

// PUBG-style: create universal socket with same improvements
export function createUniversalNetplaySocket(credentials: NetplayCredentials): Socket {
  const baseUrl = getNetplayServiceUrl();
  if (!baseUrl) throw new Error("Could not determine the room server.");
  return io(baseUrl, {
    path: "/api/universal-netplay",
    transports: ["websocket"],
    upgrade: false,
    auth: credentials,
    timeout: 20_000,
    reconnection: true,
    reconnectionAttempts: 30,
    reconnectionDelay: 300,
    reconnectionDelayMax: 3_000,
    randomizationFactor: 0.3,
    forceNew: false,
    autoConnect: true,
  });
}
