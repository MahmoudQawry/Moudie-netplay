import { AccessToken } from "livekit-server-sdk";

export type LiveKitMemberRole = "host" | "player" | "spectator";

type LiveKitRuntime = { url: string; apiKey: string; apiSecret: string };

function configuredRuntime(): LiveKitRuntime | null {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export async function createRoomMediaToken(input: {
  roomId: number;
  memberId: number;
  displayName: string;
  role: LiveKitMemberRole;
}) {
  const runtime = configuredRuntime();
  if (!runtime) return { configured: false as const, message: "خدمة الصوت الجماعي لم تُضبط بعد على الخادم." };

  const roomName = `moudie-room-${input.roomId}`;
  const identity = `member-${input.memberId}`;
  const token = new AccessToken(runtime.apiKey, runtime.apiSecret, {
    identity,
    name: input.displayName,
    ttl: "2h",
    metadata: JSON.stringify({ roomId: input.roomId, memberId: input.memberId, role: input.role }),
    attributes: { role: input.role, roomId: String(input.roomId) },
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublish: input.role !== "spectator",
    canPublishData: true,
    canUpdateOwnMetadata: false,
  });

  return {
    configured: true as const,
    url: runtime.url,
    roomName,
    token: await token.toJwt(),
    canPublish: input.role !== "spectator",
  };
}
