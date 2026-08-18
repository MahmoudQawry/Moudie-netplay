import { getNetplayServiceUrl } from "@/constants/oauth";

export type RealtimeSystem = "ps1" | "psp" | "nes" | "sega" | "arcade";
export type RealtimeRole = "host" | "player" | "spectator";
export type RealtimeMember = { id: number; roomId: number; displayName: string; role: RealtimeRole; isReady: boolean; gameFingerprint: string | null; coreVersion: string | null };
export type RealtimeSnapshot = { room: { id: number; joinCode: string; name: string; system: RealtimeSystem; maxPlayers: number; maxSpectators: number; status: "waiting" | "active" | "closed" }; members: RealtimeMember[] };
export type RealtimeCredential = { roomId: number; memberId: number; memberToken: string; role: RealtimeRole };

type TrpcEnvelope<T> = { result?: { data?: { json?: T } }; error?: { json?: { message?: string } } };

async function request<T>(procedure: string, input: unknown, method: "GET" | "POST"): Promise<T> {
  const baseUrl = getNetplayServiceUrl().replace(/\/$/, "");
  const url = method === "GET" ? `${baseUrl}/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : `${baseUrl}/api/trpc/${procedure}`;
  const response = await fetch(url, method === "POST" ? { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ json: input }) } : { method });
  const body = await response.json() as TrpcEnvelope<T>;
  if (!response.ok || body.error) throw new Error(body.error?.json?.message || "The room service could not complete this request.");
  if (body.result?.data?.json === undefined) throw new Error("The room service returned an invalid response.");
  return body.result.data.json;
}

export function createRealtimeRoom(input: { name: string; system: RealtimeSystem; hostName: string }) {
  return request<RealtimeCredential & { joinCode: string }>("rooms.create", input, "POST");
}

export function joinRealtimeRoom(input: { joinCode: string; displayName: string; joinAs: "player" | "spectator" }) {
  return request<RealtimeCredential>("rooms.join", input, "POST");
}

export function getRealtimeRoomSnapshot(input: { roomId: number; memberId: number; memberToken: string }) {
  return request<RealtimeSnapshot>("rooms.snapshot", input, "GET");
}

export function setRealtimeRoomReady(input: { roomId: number; memberId: number; memberToken: string; isReady: boolean; fingerprint?: string; coreVersion?: string }) {
  return request<boolean>("rooms.setReady", input, "POST");
}
