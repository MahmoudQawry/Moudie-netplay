import { AudioSession, LiveKitRoom, registerGlobals, useConnectionState, useLocalParticipant, useParticipants } from "@livekit/react-native";
import { ConnectionState } from "livekit-client";
import InCallManager from "react-native-incall-manager";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

registerGlobals();

type VoiceMember = { id: number; displayName: string; role: "host" | "player" | "spectator" };
type MediaToken = { configured: boolean; url?: string; roomName?: string; token?: string; canPublish?: boolean; message?: string };
type Props = {
  mediaToken?: MediaToken | null;
  memberRole?: VoiceMember["role"];
  // Kept optional for the native emulator room screen so the shared component remains type-safe
  // while that screen migrates to the same SFU token flow.
  socket?: unknown;
  isHost?: boolean;
  remoteOnline?: boolean;
  memberId?: number;
  members?: VoiceMember[];
};

function VoiceControls({ memberRole }: Props) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const [busy, setBusy] = useState(false);
  const [speaker, setSpeaker] = useState(true);

  useEffect(() => {
    let active = true;
    AudioSession.startAudioSession().catch(() => undefined);
    // Communication mode is the correct Android route for two-way voice.
    InCallManager.start({ media: "audio" });
    InCallManager.setForceSpeakerphoneOn(true);
    return () => {
      active = false;
      if (active) return;
      InCallManager.stop();
      AudioSession.stopAudioSession().catch(() => undefined);
    };
  }, []);

  const toggleMic = async () => {
    if (memberRole === "spectator" || busy) return;
    setBusy(true);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } finally {
      setBusy(false);
    }
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
      <Text style={styles.status}>{connected ? "Low-latency voice channel connected" : `Voice ${String(connectionState).toLowerCase()}…`}</Text>
      <View style={styles.actions}>
        <Pressable disabled={memberRole === "spectator" || busy} onPress={toggleMic} style={({ pressed }) => [styles.action, isMicrophoneEnabled && styles.actionActive, pressed && styles.pressed]}>
          <Text style={styles.actionLabel}>{isMicrophoneEnabled ? "MIC ON" : "MIC OFF"}</Text>
        </Pressable>
        <Pressable onPress={toggleSpeaker} style={({ pressed }) => [styles.action, speaker && styles.actionActive, pressed && styles.pressed]}>
          <Text style={styles.actionLabel}>{speaker ? "SPEAKER ON" : "SPEAKER OFF"}</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Voice is routed through LiveKit SFU. The server never receives the game ROM or raw game audio. The client keeps the microphone optional and uses the native communication audio route for stable two-way voice.</Text>
    </View>
  );
}

export function RoomVoiceChat({ mediaToken, memberRole, ...compat }: Props) {
  void compat;
  if (!mediaToken?.configured || !mediaToken.url || !mediaToken.token) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>ROOM VOICE</Text>
        <Text style={styles.status}>{mediaToken?.message ?? "خدمة الصوت الجماعي لم تُجهّز بعد على الخادم."}</Text>
        <Text style={styles.hint}>الإنتاج يحتاج LIVEKIT_URL وLIVEKIT_API_KEY وLIVEKIT_API_SECRET على الخادم فقط. المفتاح السري لا يدخل التطبيق.</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={mediaToken.url}
      token={mediaToken.token}
      connect
      audio={false}
      video={false}
      options={{ adaptiveStream: true }}
    >
      <VoiceControls memberRole={memberRole} />
    </LiveKitRoom>
  );
}

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
