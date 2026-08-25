import { AudioSession, LiveKitRoom, registerGlobals, useConnectionState, useLocalParticipant, useParticipants } from "@livekit/react-native";
import { ConnectionState } from "livekit-client";
import { RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, mediaDevices } from "@livekit/react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";

registerGlobals();

type VoiceMember = { id: number; displayName: string; role: "host" | "player" | "spectator" };
type MediaToken = { configured: boolean; url?: string; roomName?: string; token?: string; canPublish?: boolean; message?: string };
export type RoomVoiceChatHandle = { setMicrophoneEnabled: (enabled: boolean) => Promise<void>; setSpeakerEnabled?: (enabled: boolean) => Promise<void> };
type SocketLike = { on?: (event: string, listener: (payload: any) => void) => unknown; off?: (event: string, listener?: (payload: any) => void) => unknown; emit?: (event: string, payload?: any) => unknown };
type Props = { mediaToken?: MediaToken | null; memberRole?: VoiceMember["role"]; socket?: unknown; isHost?: boolean; remoteOnline?: boolean; memberId?: number; members?: VoiceMember[] };
type RoomSocketAuth = { roomId?: unknown; memberId?: unknown; memberToken?: unknown };

type VoiceSignal = { kind?: unknown; description?: unknown; candidate?: unknown };
const VOICE_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }];

function readSocketAuth(socket: unknown): RoomSocketAuth | null {
  if (!socket || typeof socket !== "object") return null;
  const auth = (socket as { auth?: unknown }).auth;
  return auth && typeof auth === "object" ? auth as RoomSocketAuth : null;
}

function VoiceControls({ onMicChange, onSpeakerChange, microphoneEnabled, speakerEnabled, connectedCount, status }: {
  onMicChange: (enabled: boolean) => Promise<void>;
  onSpeakerChange: (enabled: boolean) => void;
  microphoneEnabled: boolean;
  speakerEnabled: boolean;
  connectedCount: number;
  status: string;
}) {
  const [busy, setBusy] = useState(false);
  const toggleMic = async () => {
    if (busy) return;
    setBusy(true);
    try { await onMicChange(!microphoneEnabled); } finally { setBusy(false); }
  };
  return <View style={styles.card}>
    <View style={styles.heading}><Text style={styles.title}>ROOM VOICE</Text><View style={styles.counter}><Text style={styles.counterText}>{connectedCount} CONNECTED</Text></View></View>
    <Text style={styles.status}>{status}</Text>
    <View style={styles.actions}>
      <Pressable disabled={busy} onPress={toggleMic} style={({ pressed }) => [styles.action, microphoneEnabled && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>{microphoneEnabled ? "MIC ON" : "MIC OFF"}</Text></Pressable>
      <Pressable onPress={() => onSpeakerChange(!speakerEnabled)} style={({ pressed }) => [styles.action, speakerEnabled && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>{speakerEnabled ? "SPEAKER ON" : "SPEAKER OFF"}</Text></Pressable>
    </View>
    <Text style={styles.hint}>Dedicated room audio uses echo cancellation, noise suppression, automatic gain control and low-latency Opus routing.</Text>
  </View>;
}

function LiveKitVoiceControls() {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const [speaker, setSpeaker] = useState(true);
  useEffect(() => {
    AudioSession.startAudioSession().catch(() => undefined);
    InCallManager.start({ media: "audio" });
    InCallManager.setForceSpeakerphoneOn(true);
    localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    return () => { InCallManager.stop(); AudioSession.stopAudioSession().catch(() => undefined); };
  }, [localParticipant]);
  return <VoiceControls
    microphoneEnabled={isMicrophoneEnabled}
    speakerEnabled={speaker}
    connectedCount={Math.max(0, participants.length - 1)}
    status={connectionState === ConnectionState.Connected ? "Room voice channel connected — all room members can speak and listen" : `Voice ${String(connectionState).toLowerCase()}…`}
    onMicChange={(enabled) => localParticipant.setMicrophoneEnabled(enabled)}
    onSpeakerChange={(enabled) => { setSpeaker(enabled); InCallManager.setForceSpeakerphoneOn(enabled); }}
  />;
}

function BuiltInWebRtcVoice({ socket, memberId, members, expose }: { socket?: unknown; memberId?: number; members?: VoiceMember[]; expose: (handle: RoomVoiceChatHandle) => void }) {
  const socketRef = useRef(socket as SocketLike | undefined);
  const streamRef = useRef<any>(null);
  const peersRef = useRef(new Map<number, any>());
  const remoteStreamsRef = useRef(new Map<number, any>());
  const pendingCandidatesRef = useRef(new Map<number, any[]>());
  const makingOfferRef = useRef(new Set<number>());
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [connectedCount, setConnectedCount] = useState(0);
  const [status, setStatus] = useState("Preparing the built-in room voice channel…");

  const setSpeaker = (enabled: boolean) => {
    setSpeakerEnabled(enabled);
    InCallManager.setForceSpeakerphoneOn(enabled);
  };

  const setMic = async (enabled: boolean) => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((track: any) => { track.enabled = enabled; });
    setMicrophoneEnabled(enabled);
    (socketRef.current as SocketLike | undefined)?.emit?.("netplay:voice-status", { microphoneEnabled: enabled, speakerEnabled });
  };

  useEffect(() => {
    expose({ setMicrophoneEnabled: setMic, setSpeakerEnabled: async (enabled) => setSpeaker(enabled) });
  });

  useEffect(() => {
    const currentSocket = socket as SocketLike | undefined;
    socketRef.current = currentSocket;
    const localId = Number(memberId);
    if (!currentSocket?.on || !currentSocket.emit || !Number.isInteger(localId) || localId <= 0) {
      setStatus("Voice channel is waiting for the room connection.");
      return;
    }
    let disposed = false;
    const updateCount = () => setConnectedCount(Array.from(peersRef.current.values()).filter((peer: any) => peer.connectionState === "connected").length);
    const requestAudio = async () => {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, { title: "Room voice", message: "Moudie needs microphone access for the room voice channel.", buttonPositive: "Allow" });
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("microphone-permission-denied");
      }
      const stream = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (disposed) { stream.getTracks().forEach((track: any) => track.stop()); return; }
      stream.getAudioTracks().forEach((track: any) => { track.enabled = false; });
      streamRef.current = stream;
      AudioSession.startAudioSession().catch(() => undefined);
      InCallManager.start({ media: "audio" });
      InCallManager.setForceSpeakerphoneOn(true);
      setStatus("Built-in room voice ready — microphone is muted.");
      currentSocket.emit?.("netplay:signal", { signal: { kind: "voice-hello" } });
    };

    const ensurePeer = (remoteId: number) => {
      const existing = peersRef.current.get(remoteId);
      if (existing) return existing;
      const peer = new RTCPeerConnection({ iceServers: VOICE_ICE_SERVERS });
      streamRef.current?.getTracks().forEach((track: any) => peer.addTrack(track, streamRef.current));
      peer.onicecandidate = (event: any) => {
        if (event.candidate) currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-candidate", candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate } });
      };
      peer.ontrack = (event: any) => { if (event.streams?.[0]) remoteStreamsRef.current.set(remoteId, event.streams[0]); };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" || peer.connectionState === "closed" || peer.connectionState === "disconnected") remoteStreamsRef.current.delete(remoteId);
        updateCount();
      };
      peersRef.current.set(remoteId, peer);
      return peer;
    };

    const sendOffer = async (remoteId: number) => {
      if (makingOfferRef.current.has(remoteId) || !streamRef.current) return;
      makingOfferRef.current.add(remoteId);
      try {
        const peer = ensurePeer(remoteId);
        if (peer.signalingState !== "stable") return;
        const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
        await peer.setLocalDescription(offer);
        currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-offer", description: offer } });
      } finally { makingOfferRef.current.delete(remoteId); }
    };

    const onSignal = async (payload: { fromMemberId?: unknown; signal?: VoiceSignal }) => {
      const remoteId = Number(payload?.fromMemberId);
      const signal = payload?.signal;
      if (!Number.isInteger(remoteId) || remoteId <= 0 || remoteId === localId || !signal || disposed) return;
      const kind = signal.kind;
      if (kind === "voice-hello") {
        currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-ready" } });
        if (localId < remoteId) await sendOffer(remoteId);
        return;
      }
      if (kind === "voice-ready") { if (localId < remoteId) await sendOffer(remoteId); return; }
      if (kind === "voice-offer" && signal.description && streamRef.current) {
        const peer = ensurePeer(remoteId);
        await peer.setRemoteDescription(new RTCSessionDescription(signal.description as any));
        const queued = pendingCandidatesRef.current.get(remoteId) ?? [];
        pendingCandidatesRef.current.delete(remoteId);
        for (const candidate of queued) await peer.addIceCandidate(new RTCIceCandidate(candidate));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-answer", description: answer } });
        return;
      }
      if (kind === "voice-answer" && signal.description) {
        const peer = peersRef.current.get(remoteId);
        if (peer) await peer.setRemoteDescription(new RTCSessionDescription(signal.description as any));
        return;
      }
      if (kind === "voice-candidate" && signal.candidate) {
        const peer = peersRef.current.get(remoteId);
        if (peer?.remoteDescription) await peer.addIceCandidate(new RTCIceCandidate(signal.candidate as any));
        else pendingCandidatesRef.current.set(remoteId, [...(pendingCandidatesRef.current.get(remoteId) ?? []), signal.candidate]);
      }
    };

    currentSocket.on?.("netplay:signal", onSignal);
    void requestAudio().catch(() => { if (!disposed) setStatus("Microphone permission is required to use room voice."); });
    return () => {
      disposed = true;
      currentSocket.off?.("netplay:signal", onSignal);
      peersRef.current.forEach((peer: any) => peer.close());
      peersRef.current.clear();
      remoteStreamsRef.current.clear();
      streamRef.current?.getTracks().forEach((track: any) => track.stop());
      streamRef.current = null;
      InCallManager.stop();
      AudioSession.stopAudioSession().catch(() => undefined);
    };
  }, [socket, memberId]);

  const roomMembers = members?.length ?? 0;
  return <VoiceControls microphoneEnabled={microphoneEnabled} speakerEnabled={speakerEnabled} connectedCount={connectedCount} status={status || `Built-in voice active for ${roomMembers} room members.`} onMicChange={setMic} onSpeakerChange={setSpeaker} />;
}

export const RoomVoiceChat = forwardRef<RoomVoiceChatHandle, Props>(function RoomVoiceChat({ mediaToken: suppliedToken, socket, memberId, members }: Props, ref) {
  const [mediaToken, setMediaToken] = useState<MediaToken | null | undefined>(suppliedToken);
  const fallbackHandle = useRef<RoomVoiceChatHandle>({ setMicrophoneEnabled: async () => undefined });
  useImperativeHandle(ref, () => ({ setMicrophoneEnabled: (enabled) => fallbackHandle.current.setMicrophoneEnabled(enabled), setSpeakerEnabled: (enabled) => fallbackHandle.current.setSpeakerEnabled?.(enabled) ?? Promise.resolve() }), []);

  useEffect(() => {
    if (suppliedToken) { setMediaToken(suppliedToken); return; }
    const auth = readSocketAuth(socket);
    const roomId = Number(auth?.roomId);
    const authMemberId = Number(auth?.memberId ?? memberId);
    const memberToken = typeof auth?.memberToken === "string" ? auth.memberToken : "";
    if (!Number.isInteger(roomId) || roomId <= 0 || !Number.isInteger(authMemberId) || authMemberId <= 0 || memberToken.length < 20) { setMediaToken(null); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/trpc/rooms.mediaToken`, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ json: { roomId, memberId: authMemberId, memberToken } }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const envelope = await response.json() as { result?: { data?: { json?: MediaToken } } };
        if (!cancelled) setMediaToken(envelope.result?.data?.json ?? { configured: false, message: "Voice SFU unavailable." });
      } catch { if (!cancelled) setMediaToken({ configured: false, message: "Voice SFU unavailable — using the built-in room channel." }); }
    };
    void load(); return () => { cancelled = true; };
  }, [suppliedToken, socket, memberId]);

  if (mediaToken?.configured && mediaToken.url && mediaToken.token) {
    return <LiveKitRoom serverUrl={mediaToken.url} token={mediaToken.token} connect audio={true} video={false} options={{ adaptiveStream: true, publishDefaults: { audioPreset: { maxBitrate: 96000 }, dtx: false, red: true, forceStereo: false } }}><LiveKitVoiceControls /></LiveKitRoom>;
  }
  return <BuiltInWebRtcVoice socket={socket} memberId={memberId} members={members} expose={(handle) => { fallbackHandle.current = handle; }} />;
});

const styles = StyleSheet.create({
  card: { backgroundColor: "#160D29", borderWidth: 1, borderColor: "#4B3370", borderRadius: 18, padding: 14, marginTop: 16 }, heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { color: "#DCA7FF", fontSize: 14, fontWeight: "900" }, counter: { backgroundColor: "#27203A", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }, counterText: { color: "#9EEBFF", fontSize: 10, fontWeight: "800" }, status: { color: "#C5BDD3", fontSize: 12, marginTop: 6 }, actions: { flexDirection: "row", gap: 7, marginTop: 11 }, action: { flex: 1, minHeight: 46, borderRadius: 13, backgroundColor: "#231836", borderWidth: 1, borderColor: "#433054", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }, actionActive: { backgroundColor: "#5A2993", borderColor: "#B768FF" }, actionLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", textAlign: "center" }, hint: { color: "#9086A6", fontSize: 10, lineHeight: 16, marginTop: 10 }, pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
