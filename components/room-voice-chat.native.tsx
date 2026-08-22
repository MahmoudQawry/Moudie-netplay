import { AudioSession, LiveKitRoom, registerGlobals, useConnectionState, useLocalParticipant, useParticipants } from "@livekit/react-native";
import { ConnectionState } from "livekit-client";
import InCallManager from "react-native-incall-manager";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getApiBaseUrl } from "@/constants/oauth";

registerGlobals();

type VoiceMember = { id: number; displayName: string; role: "host" | "player" | "spectator" };
type MediaToken = { configured: boolean; url?: string; roomName?: string; token?: string; canPublish?: boolean; message?: string };
type RoomVoiceChatHandle = { setMicrophoneEnabled: (enabled: boolean) => Promise<void>; setSpeakerEnabled: (enabled: boolean) => Promise<void> };
type Props = { mediaToken?: MediaToken | null; memberRole?: VoiceMember["role"]; socket?: unknown; isHost?: boolean; remoteOnline?: boolean; memberId?: number; members?: VoiceMember[] };
type RoomSocketAuth = { roomId?: unknown; memberId?: unknown; memberToken?: unknown };

function readSocketAuth(socket: unknown): RoomSocketAuth | null {
  if (!socket || typeof socket !== "object") return null;
  const auth = (socket as { auth?: unknown }).auth;
  return auth && typeof auth === "object" ? auth as RoomSocketAuth : null;
}

function VoiceControls({ memberRole }: Props) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const [busy, setBusy] = useState(false);
  const [speaker, setSpeaker] = useState(true);

  useEffect(() => {
    AudioSession.startAudioSession().catch(() => undefined);
    InCallManager.start({ media: "audio" });
    InCallManager.setForceSpeakerphoneOn(true);
    localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    return () => {
      InCallManager.stop();
      AudioSession.stopAudioSession().catch(() => undefined);
    };
  }, [localParticipant]);

  const toggleMic = async () => {
    if (memberRole === "spectator" || busy) return;
    setBusy(true);
    try { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); } finally { setBusy(false); }
  };

  const toggleSpeaker = () => {
    const next = !speaker;
    setSpeaker(next);
    InCallManager.setForceSpeakerphoneOn(next);
  };

  const connected = connectionState === ConnectionState.Connected;
  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>ROOM VOICE · SFU</Text>
        <View style={styles.counter}><Text style={styles.counterText}>{Math.max(0, participants.length - 1)} CONNECTED</Text></View>
      </View>
      <Text style={styles.status}>{connected ? "Low-latency HD voice channel connected" : `Voice ${String(connectionState).toLowerCase()}…`}</Text>
      <View style={styles.actions}>
        <Pressable disabled={memberRole === "spectator" || busy} onPress={toggleMic} style={({ pressed }) => [styles.action, isMicrophoneEnabled && styles.actionActive, pressed && styles.pressed]}>
          <Text style={styles.actionLabel}>{isMicrophoneEnabled ? "MIC ON" : "MIC OFF"}</Text>
        </Pressable>
        <Pressable onPress={toggleSpeaker} style={({ pressed }) => [styles.action, speaker && styles.actionActive, pressed && styles.pressed]}>
          <Text style={styles.actionLabel}>{speaker ? "SPEAKER ON" : "SPEAKER OFF"}</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>LiveKit SFU + Opus voice, 96 kbps ceiling, RED redundancy and DTX disabled. Android communication routing plus WebRTC echo cancellation, noise suppression and automatic gain control are kept active for clear voice.</Text>
    </View>
  );
}

export const RoomVoiceChat = forwardRef<RoomVoiceChatHandle, Props>(function RoomVoiceChat({ mediaToken: suppliedToken, memberRole: suppliedRole, socket, memberId }: Props, ref) {
  const [mediaToken, setMediaToken] = useState<MediaToken | null | undefined>(suppliedToken);
  const [memberRole, setMemberRole] = useState<VoiceMember["role"] | undefined>(suppliedRole);

  // The current emulator screens keep a ref for lifecycle compatibility. The voice controls
  // remain user-driven inside the LiveKit room; these methods are safe no-ops until a shared
  // control bridge is required, which avoids invalid ref props during Android compilation.
  useImperativeHandle(ref, () => ({
    setMicrophoneEnabled: async () => undefined,
    setSpeakerEnabled: async (enabled: boolean) => { InCallManager.setForceSpeakerphoneOn(enabled); },
  }), []);

  useEffect(() => {
    if (suppliedToken) { setMediaToken(suppliedToken); return; }
    const auth = readSocketAuth(socket);
    const roomId = Number(auth?.roomId);
    const authMemberId = Number(auth?.memberId ?? memberId);
    const memberToken = typeof auth?.memberToken === "string" ? auth.memberToken : "";
    if (!Number.isInteger(roomId) || roomId <= 0 || !Number.isInteger(authMemberId) || authMemberId <= 0 || memberToken.length < 20) {
      setMediaToken(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/trpc/rooms.mediaToken`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ json: { roomId, memberId: authMemberId, memberToken } }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const envelope = await response.json() as { result?: { data?: { json?: MediaToken } } };
        const token = envelope.result?.data?.json;
        if (!cancelled) {
          setMediaToken(token ?? { configured: false, message: "تعذر تجهيز قناة الصوت." });
          if (token?.canPublish === false) setMemberRole("spectator");
        }
      } catch {
        if (!cancelled) setMediaToken({ configured: false, message: "تعذر الاتصال بخدمة الصوت الجماعي." });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [suppliedToken, socket, memberId]);

  if (!mediaToken?.configured || !mediaToken.url || !mediaToken.token) {
    return <View style={styles.card}><Text style={styles.title}>ROOM VOICE</Text><Text style={styles.status}>{mediaToken?.message ?? "خدمة الصوت الجماعي لم تُجهّز بعد على الخادم."}</Text><Text style={styles.hint}>الإنتاج يحتاج LIVEKIT_URL وLIVEKIT_API_KEY وLIVEKIT_API_SECRET على الخادم فقط. المفتاح السري لا يدخل التطبيق.</Text></View>;
  }

  return (
    <LiveKitRoom
      serverUrl={mediaToken.url}
      token={mediaToken.token}
      connect
      audio={true}
      video={false}
      options={{ adaptiveStream: true, publishDefaults: { audioPreset: { maxBitrate: 96000 }, dtx: false, red: true, forceStereo: false } }}
    >
      <VoiceControls memberRole={memberRole} />
    </LiveKitRoom>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: "#160D29", borderWidth: 1, borderColor: "#4B3370", borderRadius: 18, padding: 14, marginTop: 16 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#DCA7FF", fontSize: 14, fontWeight: "900" },
  counter: { backgroundColor: "#27203A", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  counterText: { color: "#9EEBFF", fontSize: 10, fontWeight: "800" },
  status: { color: "#C5BDD3", fontSize: 12, marginTop: 6 },
  actions: { flexDirection: "row", gap: 7, marginTop: 11 },
  action: { flex: 1, minHeight: 46, borderRadius: 13, backgroundColor: "#231836", borderWidth: 1, borderColor: "#433054", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  actionActive: { backgroundColor: "#5A2993", borderColor: "#B768FF" },
  actionLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", textAlign: "center" },
  hint: { color: "#9086A6", fontSize: 10, lineHeight: 16, marginTop: 10 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});