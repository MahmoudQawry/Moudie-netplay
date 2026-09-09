import { AudioSession, LiveKitRoom, registerGlobals, useConnectionState, useLocalParticipant, useParticipants } from "@livekit/react-native";
import { ConnectionState } from "livekit-client";
import { RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, mediaDevices } from "@livekit/react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import { useLanguage } from "@/lib/language";

registerGlobals();

export type VoiceMode = "ptt" | "open";
export type VoiceChannel = "room" | "team";
type VoiceMember = { id: number; displayName: string; role: "host" | "player" | "spectator" };
type MediaToken = { configured: boolean; url?: string; roomName?: string; token?: string; canPublish?: boolean; message?: string };
export type RoomVoiceChatHandle = { setMicrophoneEnabled: (enabled: boolean) => Promise<void>; setSpeakerEnabled?: (enabled: boolean) => Promise<void> };
type SocketLike = { on?: (event: string, listener: (payload: any) => void) => unknown; off?: (event: string, listener?: (payload: any) => void) => unknown; emit?: (event: string, payload?: any) => unknown };
type Props = { mediaToken?: MediaToken | null; memberRole?: VoiceMember["role"]; socket?: unknown; isHost?: boolean; remoteOnline?: boolean; memberId?: number; members?: VoiceMember[] };
type RoomSocketAuth = { roomId?: unknown; memberId?: unknown; memberToken?: unknown };
type VoiceSignal = { kind?: unknown; description?: unknown; candidate?: unknown };
const VOICE_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }];

const VOICE_MODE_KEY = "moudie.voice.mode.v1";
const VOICE_CHANNEL_KEY = "moudie.voice.channel.v1";

/** PUBG-style voice preferences: push-to-talk vs open mic, and room vs team channel. */
function useVoicePreferences() {
  const [mode, setMode] = useState<VoiceMode>("ptt");
  const [channel, setChannel] = useState<VoiceChannel>("room");
  useEffect(() => {
    void (async () => {
      try {
        const [savedMode, savedChannel] = await Promise.all([AsyncStorage.getItem(VOICE_MODE_KEY), AsyncStorage.getItem(VOICE_CHANNEL_KEY)]);
        if (savedMode === "ptt" || savedMode === "open") setMode(savedMode);
        if (savedChannel === "room" || savedChannel === "team") setChannel(savedChannel);
      } catch {
        // Preferences are best-effort; defaults keep push-to-talk in the room channel.
      }
    })();
  }, []);
  const changeMode = async (next: VoiceMode) => { setMode(next); try { await AsyncStorage.setItem(VOICE_MODE_KEY, next); } catch {} };
  const changeChannel = async (next: VoiceChannel) => { setChannel(next); try { await AsyncStorage.setItem(VOICE_CHANNEL_KEY, next); } catch {} };
  return { mode, channel, changeMode, changeChannel };
}

function readSocketAuth(socket: unknown): RoomSocketAuth | null { if (!socket || typeof socket !== "object") return null; const auth = (socket as { auth?: unknown }).auth; return auth && typeof auth === "object" ? auth as RoomSocketAuth : null; }

function VoiceControls({ onMicChange, onSpeakerChange, onModeChange, onChannelChange, microphoneEnabled, speakerEnabled, mode, channel, isSpectator, connectedCount, status, canSpeak }: {
  onMicChange: (enabled: boolean) => Promise<void>; onSpeakerChange: (enabled: boolean) => void;
  onModeChange: (mode: VoiceMode) => void; onChannelChange: (channel: VoiceChannel) => void;
  microphoneEnabled: boolean; speakerEnabled: boolean; mode: VoiceMode; channel: VoiceChannel; isSpectator: boolean;
  connectedCount: number; status: string; canSpeak: boolean;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [pttDown, setPttDown] = useState(false);
  const toggleMic = async () => { if (busy) return; setBusy(true); try { await onMicChange(!microphoneEnabled); } finally { setBusy(false); } };
  // PUBG rule: in the team channel spectators listen only; the room channel is open to everyone.
  const micAllowed = canSpeak || channel === "room";
  return <View style={styles.card}>
    <View style={styles.heading}><Text style={styles.title}>{t("voice")}</Text><View style={styles.counter}><Text style={styles.counterText}>{connectedCount}</Text></View></View>
    <Text style={styles.status}>{status}</Text>
    <Text style={styles.sectionLabel}>{t("voiceMode")}</Text>
    <View style={styles.actions}>
      <Pressable onPress={() => onModeChange("ptt")} style={({ pressed }) => [styles.action, mode === "ptt" && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>{t("voicePushToTalk")}</Text></Pressable>
      <Pressable onPress={() => onModeChange("open")} style={({ pressed }) => [styles.action, mode === "open" && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>{t("voiceOpenMic")}</Text></Pressable>
    </View>
    <Text style={styles.sectionLabel}>{t("voiceChannel")}</Text>
    <View style={styles.actions}>
      <Pressable onPress={() => onChannelChange("room")} style={({ pressed }) => [styles.action, channel === "room" && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>{t("voiceChannelRoom")}</Text></Pressable>
      <Pressable onPress={() => onChannelChange("team")} style={({ pressed }) => [styles.action, channel === "team" && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>{t("voiceChannelTeam")}</Text></Pressable>
    </View>
    {channel === "team" && <Text style={styles.hint}>{t("voiceTeamNote")}</Text>}
    {mode === "open" ? (
      <View style={styles.actions}>
        <Pressable disabled={busy || !micAllowed} onPress={toggleMic} style={({ pressed }) => [styles.action, microphoneEnabled && styles.actionActive, pressed && styles.pressed, !micAllowed && styles.actionDisabled]}><Text style={styles.actionLabel}>{microphoneEnabled ? t("micOn") : t("micOff")}</Text></Pressable>
        <Pressable onPress={() => onSpeakerChange(!speakerEnabled)} style={({ pressed }) => [styles.action, speakerEnabled && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>{speakerEnabled ? t("speakerOn") : t("speakerOff")}</Text></Pressable>
      </View>
    ) : (
      <View style={styles.actions}>
        <Pressable disabled={!micAllowed} onPressIn={async () => { setPttDown(true); try { await onMicChange(true); } catch {} }} onPressOut={async () => { setPttDown(false); try { await onMicChange(false); } catch {} }} style={({ pressed }) => [styles.pttButton, (pttDown || pressed) && styles.pttActive, !micAllowed && styles.actionDisabled]}><Text style={styles.pttLabel}>{t("voiceHoldToTalk")}</Text></Pressable>
        <Pressable onPress={() => onSpeakerChange(!speakerEnabled)} style={({ pressed }) => [styles.action, styles.speakerSmall, speakerEnabled && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>{speakerEnabled ? t("speakerOn") : t("speakerOff")}</Text></Pressable>
      </View>
    )}
    {isSpectator && <Text style={styles.hint}>{t("watchTalkChat")}</Text>}
  </View>;
}

function LiveKitVoiceControls({ memberRole, members, memberId, emitStatus }: { memberRole?: VoiceMember["role"]; members?: VoiceMember[]; memberId?: number; emitStatus: (patch: { microphoneEnabled: boolean; voiceMode?: VoiceMode; voiceChannel?: VoiceChannel }) => void }) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant(); const participants = useParticipants(); const connectionState = useConnectionState(); const [speaker, setSpeaker] = useState(true);
  const { t } = useLanguage();
  const { mode, channel, changeMode, changeChannel } = useVoicePreferences();
  const isSpectator = memberRole === "spectator" || (memberId !== undefined && members?.find((member) => member.id === memberId)?.role === "spectator") || false;
  const canSpeak = !isSpectator;
  useEffect(() => { AudioSession.startAudioSession().catch(() => undefined); InCallManager.start({ media: "audio" }); InCallManager.setForceSpeakerphoneOn(true); localParticipant.setMicrophoneEnabled(false).catch(() => undefined); return () => { InCallManager.stop(); AudioSession.stopAudioSession().catch(() => undefined); }; }, [localParticipant]);
  useEffect(() => { emitStatus({ microphoneEnabled: isMicrophoneEnabled, voiceMode: mode, voiceChannel: channel }); }, [isMicrophoneEnabled, channel, mode]);
  const setMic = async (enabled: boolean) => { await localParticipant.setMicrophoneEnabled(enabled); };
  return <VoiceControls
    microphoneEnabled={isMicrophoneEnabled} speakerEnabled={speaker} mode={mode} channel={channel} isSpectator={isSpectator}
    connectedCount={Math.max(0, participants.length - 1)}
    status={connectionState === ConnectionState.Connected ? t("voiceConnectedRoom") : `${t("voiceConnecting")} ${String(connectionState).toLowerCase()}`}
    canSpeak={canSpeak}
    onMicChange={setMic}
    onModeChange={(next) => { void changeMode(next); if (next === "ptt") void setMic(false); }}
    onChannelChange={(next) => { void changeChannel(next); }}
    onSpeakerChange={(enabled) => { setSpeaker(enabled); InCallManager.setForceSpeakerphoneOn(enabled); }}
  />;
}

function BuiltInWebRtcVoice({ socket, memberId, members, emitStatus, expose }: { socket?: unknown; memberId?: number; members?: VoiceMember[]; emitStatus: (patch: { microphoneEnabled: boolean; voiceMode?: VoiceMode; voiceChannel?: VoiceChannel }) => void; expose: (handle: RoomVoiceChatHandle) => void }) {
  const socketRef = useRef(socket as SocketLike | undefined); const streamRef = useRef<any>(null); const peersRef = useRef(new Map<number, any>()); const remoteStreamsRef = useRef(new Map<number, any>()); const pendingCandidatesRef = useRef(new Map<number, any[]>()); const makingOfferRef = useRef(new Set<number>());
  const { t } = useLanguage();
  const { mode, channel, changeMode, changeChannel } = useVoicePreferences();
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false); const [speakerEnabled, setSpeakerEnabled] = useState(true); const [connectedCount, setConnectedCount] = useState(0); const [status, setStatus] = useState("");
  const isSpectator = memberId !== undefined && members?.find((member) => member.id === memberId)?.role === "spectator" || false;
  const canSpeak = !isSpectator;
  const setSpeaker = (enabled: boolean) => { setSpeakerEnabled(enabled); InCallManager.setForceSpeakerphoneOn(enabled); };
  const setMic = async (enabled: boolean) => { const stream = streamRef.current; if (!stream) return; stream.getAudioTracks().forEach((track: any) => { track.enabled = enabled; }); setMicrophoneEnabled(enabled); emitStatus({ microphoneEnabled: enabled }); };
  useEffect(() => { expose({ setMicrophoneEnabled: setMic, setSpeakerEnabled: async (enabled) => setSpeaker(enabled) }); });
  useEffect(() => {
    const currentSocket = socket as SocketLike | undefined; socketRef.current = currentSocket; const peersForCleanup = peersRef.current; const streamsForCleanup = remoteStreamsRef.current; const localId = Number(memberId); if (!currentSocket?.on || !currentSocket.emit || !Number.isInteger(localId) || localId <= 0) { setStatus(t("voiceWaitingRoom")); return; }
    let disposed = false; const updateCount = () => setConnectedCount(Array.from(peersRef.current.values()).filter((peer: any) => peer.connectionState === "connected").length);
    const requestAudio = async () => { if (Platform.OS === "android") { const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, { title: t("voicePermissionTitle"), message: t("voicePermissionMessage"), buttonPositive: t("voiceAllow") }); if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("microphone-permission-denied"); }
      // PUBG-like voice capture: mono, echo cancellation, noise suppression and auto gain.
      const stream = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } as unknown as Record<string, never>, video: false }); if (disposed) { stream.getTracks().forEach((track: any) => track.stop()); return; } stream.getAudioTracks().forEach((track: any) => { track.enabled = false; }); streamRef.current = stream; AudioSession.startAudioSession().catch(() => undefined); InCallManager.start({ media: "audio" }); InCallManager.setForceSpeakerphoneOn(true); setStatus(t("voiceReadyMuted")); currentSocket.emit?.("netplay:signal", { signal: { kind: "voice-hello" } }); };
    const ensurePeer = (remoteId: number) => { const existing = peersRef.current.get(remoteId); if (existing) return existing; const peer = new RTCPeerConnection({ iceServers: VOICE_ICE_SERVERS }); streamRef.current?.getTracks().forEach((track: any) => peer.addTrack(track, streamRef.current)); peer.addTransceiver("audio", { direction: "sendrecv" }); peer.onicecandidate = (event: any) => { if (event.candidate) currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-candidate", candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate } }); }; peer.ontrack = (event: any) => { if (event.streams?.[0]) remoteStreamsRef.current.set(remoteId, event.streams[0]); }; peer.onconnectionstatechange = () => { if (["failed", "closed", "disconnected"].includes(peer.connectionState)) remoteStreamsRef.current.delete(remoteId); updateCount(); }; peersRef.current.set(remoteId, peer); return peer; };
    const sendOffer = async (remoteId: number) => { if (makingOfferRef.current.has(remoteId) || !streamRef.current) return; makingOfferRef.current.add(remoteId); try { const peer = ensurePeer(remoteId); if (peer.signalingState !== "stable") return; const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false }); await peer.setLocalDescription(offer); currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-offer", description: offer } }); } finally { makingOfferRef.current.delete(remoteId); } };
    const onSignal = async (payload: { fromMemberId?: unknown; signal?: VoiceSignal }) => { const remoteId = Number(payload?.fromMemberId); const signal = payload?.signal; if (!Number.isInteger(remoteId) || remoteId <= 0 || remoteId === localId || !signal || disposed) return; const kind = signal.kind; if (kind === "voice-hello") { currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-ready" } }); if (localId < remoteId) await sendOffer(remoteId); return; } if (kind === "voice-ready") { if (localId < remoteId) await sendOffer(remoteId); return; } if (kind === "voice-offer" && signal.description && streamRef.current) { const peer = ensurePeer(remoteId); await peer.setRemoteDescription(new RTCSessionDescription(signal.description as any)); const queued = pendingCandidatesRef.current.get(remoteId) ?? []; pendingCandidatesRef.current.delete(remoteId); for (const candidate of queued) await peer.addIceCandidate(new RTCIceCandidate(candidate)); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-answer", description: answer } }); return; } if (kind === "voice-answer" && signal.description) { const peer = peersRef.current.get(remoteId); if (peer) await peer.setRemoteDescription(new RTCSessionDescription(signal.description as any)); return; } if (kind === "voice-candidate" && signal.candidate) { const peer = peersRef.current.get(remoteId); if (peer?.remoteDescription) await peer.addIceCandidate(new RTCIceCandidate(signal.candidate as any)); else pendingCandidatesRef.current.set(remoteId, [...(pendingCandidatesRef.current.get(remoteId) ?? []), signal.candidate]); } };
    currentSocket.on?.("netplay:signal", onSignal); void requestAudio().catch(() => { if (!disposed) setStatus(t("voiceMicPermission")); }); return () => { disposed = true; currentSocket.off?.("netplay:signal", onSignal); peersForCleanup.forEach((peer: any) => peer.close()); peersForCleanup.clear(); streamsForCleanup.clear(); streamRef.current?.getTracks().forEach((track: any) => track.stop()); streamRef.current = null; InCallManager.stop(); AudioSession.stopAudioSession().catch(() => undefined); };
  }, [socket, memberId]);
  useEffect(() => { if (mode === "ptt" && microphoneEnabled) void setMic(false); }, [mode]);
  useEffect(() => { emitStatus({ microphoneEnabled, voiceMode: mode, voiceChannel: channel }); }, [microphoneEnabled, channel, mode]);
  return <VoiceControls
    microphoneEnabled={microphoneEnabled} speakerEnabled={speakerEnabled} mode={mode} channel={channel} isSpectator={isSpectator}
    connectedCount={connectedCount}
    status={status || t("voiceBuiltInReady")}
    canSpeak={canSpeak}
    onMicChange={setMic}
    onModeChange={(next) => { void changeMode(next); }}
    onChannelChange={(next) => { void changeChannel(next); }}
    onSpeakerChange={setSpeaker}
  />;
}

export const RoomVoiceChat = forwardRef<RoomVoiceChatHandle, Props>(function RoomVoiceChat({ mediaToken: suppliedToken, socket, memberId, members, memberRole }: Props, ref) {
  const { t } = useLanguage();
  const [mediaToken, setMediaToken] = useState<MediaToken | null | undefined>(suppliedToken); const fallbackHandle = useRef<RoomVoiceChatHandle>({ setMicrophoneEnabled: async () => undefined }); useImperativeHandle(ref, () => ({ setMicrophoneEnabled: (enabled) => fallbackHandle.current.setMicrophoneEnabled(enabled), setSpeakerEnabled: (enabled) => fallbackHandle.current.setSpeakerEnabled?.(enabled) ?? Promise.resolve() }), []);
  const socketRef = useRef<SocketLike | undefined>(socket as SocketLike | undefined);
  useEffect(() => { socketRef.current = socket as SocketLike | undefined; }, [socket]);
  const emitStatus = (patch: { microphoneEnabled: boolean; voiceMode?: VoiceMode; voiceChannel?: VoiceChannel }) => { const socket = socketRef.current; if (!socket?.emit) return; socket.emit?.("netplay:voice-status", { microphoneEnabled: patch.microphoneEnabled, speakerEnabled: true, voiceMode: patch.voiceMode ?? modeRef.current, voiceChannel: patch.voiceChannel ?? channelRef.current }); };
  const modeRef = useRef<VoiceMode>("ptt"); const channelRef = useRef<VoiceChannel>("room");
  useEffect(() => { if (suppliedToken) { setMediaToken(suppliedToken); return; } const auth = readSocketAuth(socket); const roomId = Number(auth?.roomId); const authMemberId = Number(auth?.memberId ?? memberId); const memberToken = typeof auth?.memberToken === "string" ? auth.memberToken : ""; if (!Number.isInteger(roomId) || roomId <= 0 || !Number.isInteger(authMemberId) || authMemberId <= 0 || memberToken.length < 20) { setMediaToken(null); return; } let cancelled = false; const load = async () => { try { const response = await fetch(`${getApiBaseUrl()}/api/trpc/rooms.mediaToken`, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ json: { roomId, memberId: authMemberId, memberToken } }) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const envelope = await response.json() as { result?: { data?: { json?: MediaToken } } }; if (!cancelled) setMediaToken(envelope.result?.data?.json ?? { configured: false, message: t("voiceSfuUnavailable") }); } catch { if (!cancelled) setMediaToken({ configured: false, message: t("voiceSfuUnavailable") }); } }; void load(); return () => { cancelled = true; }; }, [suppliedToken, socket, memberId]);
  if (mediaToken?.configured && mediaToken.url && mediaToken.token) return <LiveKitRoom serverUrl={mediaToken.url} token={mediaToken.token} connect audio={true} video={false} options={{ adaptiveStream: true, publishDefaults: { audioPreset: { maxBitrate: 48000 }, dtx: true, red: true, forceStereo: false } }}><LiveKitVoiceControls memberRole={memberRole} members={members} memberId={memberId} emitStatus={emitStatus} /></LiveKitRoom>;
  return <BuiltInWebRtcVoice socket={socket} memberId={memberId} members={members} emitStatus={emitStatus} expose={(handle) => { fallbackHandle.current = handle; }} />;
});

const styles = StyleSheet.create({ card: { backgroundColor: "#160D29", borderWidth: 1, borderColor: "#4B3370", borderRadius: 18, padding: 14, marginTop: 16 }, heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { color: "#DCA7FF", fontSize: 14, fontWeight: "900" }, counter: { backgroundColor: "#27203A", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }, counterText: { color: "#9EEBFF", fontSize: 10, fontWeight: "800" }, status: { color: "#C5BDD3", fontSize: 12, marginTop: 6 }, sectionLabel: { color: "#9086A6", fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 10 }, actions: { flexDirection: "row", gap: 7, marginTop: 7 }, action: { flex: 1, minHeight: 46, borderRadius: 13, backgroundColor: "#231836", borderWidth: 1, borderColor: "#433054", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }, actionActive: { backgroundColor: "#5A2993", borderColor: "#B768FF" }, actionDisabled: { opacity: 0.45 }, actionLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", textAlign: "center" }, pttButton: { flex: 2, minHeight: 54, borderRadius: 13, backgroundColor: "#2A1B42", borderWidth: 1, borderColor: "#433054", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }, pttActive: { backgroundColor: "#7A2FD1", borderColor: "#C88BFF" }, pttLabel: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", textAlign: "center" }, speakerSmall: { flex: 1 }, hint: { color: "#9086A6", fontSize: 10, lineHeight: 16, marginTop: 10 }, pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] } });
