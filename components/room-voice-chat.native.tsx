import { AudioSession, LiveKitRoom, registerGlobals, useConnectionState, useLocalParticipant, useParticipants } from "@livekit/react-native";
import { ConnectionState } from "livekit-client";
import { RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, mediaDevices } from "@livekit/react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View, ScrollView } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import { useLanguage } from "@/lib/language";

registerGlobals();

type VoiceMember = { id: number; displayName: string; role: "host" | "player" | "spectator" };
type MediaToken = { configured: boolean; url?: string; roomName?: string; token?: string; canPublish?: boolean; message?: string };
export type RoomVoiceChatHandle = { 
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>; 
  setSpeakerEnabled?: (enabled: boolean) => Promise<void>;
  setVoiceMode?: (mode: "ptt" | "open") => void;
  setVoiceChannel?: (channel: "room" | "team") => void;
};
type SocketLike = { on?: (event: string, listener: (payload: any) => void) => unknown; off?: (event: string, listener?: (payload: any) => void) => unknown; emit?: (event: string, payload?: any) => unknown };
type Props = { mediaToken?: MediaToken | null; memberRole?: VoiceMember["role"]; socket?: unknown; isHost?: boolean; remoteOnline?: boolean; memberId?: number; members?: VoiceMember[] };
type RoomSocketAuth = { roomId?: unknown; memberId?: unknown; memberToken?: unknown };
type VoiceSignal = { kind?: unknown; description?: unknown; candidate?: unknown };
type VoiceStatusPayload = { memberId?: number; displayName?: string; microphoneEnabled?: boolean; speakerEnabled?: boolean; isSpeaking?: boolean; voiceMode?: string; voiceChannel?: string };

// PUBG-style ICE servers with TURN for NAT traversal
const VOICE_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  // Free TURN servers for better NAT traversal (PUBG-style reliability)
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

function readSocketAuth(socket: unknown): RoomSocketAuth | null { 
  if (!socket || typeof socket !== "object") return null; 
  const auth = (socket as { auth?: unknown }).auth; 
  return auth && typeof auth === "object" ? auth as RoomSocketAuth : null; 
}

function VoiceControls({ 
  onMicChange, 
  onSpeakerChange, 
  onModeChange,
  onChannelChange,
  onPttPress,
  onPttRelease,
  microphoneEnabled, 
  speakerEnabled, 
  voiceMode,
  voiceChannel,
  connectedCount, 
  status,
  speakingMembers,
  members,
  localMemberId
}: { 
  onMicChange: (enabled: boolean) => Promise<void>; 
  onSpeakerChange: (enabled: boolean) => void;
  onModeChange?: (mode: "ptt" | "open") => void;
  onChannelChange?: (channel: "room" | "team") => void;
  onPttPress?: () => void;
  onPttRelease?: () => void;
  microphoneEnabled: boolean; 
  speakerEnabled: boolean;
  voiceMode: "ptt" | "open";
  voiceChannel: "room" | "team";
  connectedCount: number; 
  status: string;
  speakingMembers?: Map<number, boolean>;
  members?: VoiceMember[];
  localMemberId?: number;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [pttActive, setPttActive] = useState(false);
  
  const toggleMic = async () => { 
    if (busy || voiceMode === "ptt") return; 
    setBusy(true); 
    try { await onMicChange(!microphoneEnabled); } 
    finally { setBusy(false); } 
  };

  const handlePttIn = () => {
    if (voiceMode !== "ptt") return;
    setPttActive(true);
    onPttPress?.();
  };

  const handlePttOut = () => {
    if (voiceMode !== "ptt") return;
    setPttActive(false);
    onPttRelease?.();
  };

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>🎙️ {t("voice")} · PUBG STYLE</Text>
        <View style={styles.counter}><Text style={styles.counterText}>{connectedCount} ONLINE</Text></View>
      </View>
      <Text style={styles.status}>{status}</Text>
      
      {/* PUBG-style voice mode selector */}
      <View style={styles.modeRow}>
        <Text style={styles.modeLabel}>{t("voiceMode")}:</Text>
        <Pressable onPress={() => onModeChange?.("open")} style={[styles.modeChip, voiceMode === "open" && styles.modeChipActive]}>
          <Text style={[styles.modeChipText, voiceMode === "open" && styles.modeChipTextActive]}>{t("voiceOpenMic")}</Text>
        </Pressable>
        <Pressable onPress={() => onModeChange?.("ptt")} style={[styles.modeChip, voiceMode === "ptt" && styles.modeChipActive]}>
          <Text style={[styles.modeChipText, voiceMode === "ptt" && styles.modeChipTextActive]}>{t("voicePushToTalk")}</Text>
        </Pressable>
      </View>

      {/* PUBG-style channel selector */}
      <View style={styles.modeRow}>
        <Text style={styles.modeLabel}>{t("voiceChannel")}:</Text>
        <Pressable onPress={() => onChannelChange?.("room")} style={[styles.modeChip, voiceChannel === "room" && styles.modeChipActive]}>
          <Text style={[styles.modeChipText, voiceChannel === "room" && styles.modeChipTextActive]}>🌍 {t("voiceChannelRoom")}</Text>
        </Pressable>
        <Pressable onPress={() => onChannelChange?.("team")} style={[styles.modeChip, voiceChannel === "team" && styles.modeChipActive]}>
          <Text style={[styles.modeChipText, voiceChannel === "team" && styles.modeChipTextActive]}>👥 {t("voiceChannelTeam")}</Text>
        </Pressable>
      </View>
      {voiceChannel === "team" && <Text style={styles.hint}>{t("voiceTeamNote")}</Text>}

      {/* Speaking indicators - PUBG style */}
      {members && members.length > 0 && (
        <View style={styles.membersList}>
          <Text style={styles.membersTitle}>VOICE ACTIVITY:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.membersScroll}>
            {members.map(member => {
              const isSpeaking = speakingMembers?.get(member.id);
              const isLocal = member.id === localMemberId;
              const isMicOn = isLocal ? microphoneEnabled : isSpeaking;
              return (
                <View key={member.id} style={[styles.memberBadge, isSpeaking && styles.memberSpeaking, isLocal && styles.memberLocal]}>
                  <View style={[styles.speakingDot, isMicOn ? styles.speakingDotActive : styles.speakingDotMuted]} />
                  <Text style={styles.memberName} numberOfLines={1}>{member.displayName.slice(0, 8)}{isLocal ? " (YOU)" : ""}</Text>
                  <Text style={styles.memberRole}>{member.role === "host" ? "HOST" : member.role === "player" ? `P${members.filter(m => m.role !== "spectator").findIndex(m => m.id === member.id) + 1}` : "SPEC"}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.actions}>
        {voiceMode === "open" ? (
          <Pressable disabled={busy} onPress={toggleMic} style={({ pressed }) => [styles.action, microphoneEnabled && styles.actionActive, pressed && styles.pressed]}>
            <Text style={styles.actionLabel}>{microphoneEnabled ? `🔴 ${t("micOn")}` : `⚫ ${t("micOff")}`}</Text>
          </Pressable>
        ) : (
          <Pressable 
            onPressIn={handlePttIn} 
            onPressOut={handlePttOut}
            style={({ pressed }) => [styles.action, styles.pttAction, (pressed || pttActive) && styles.pttActive, pttActive && styles.actionActive]}
          >
            <Text style={styles.actionLabel}>{pttActive ? `🔴 ${t("voiceHoldToTalk")}...` : `🎤 ${t("voicePushToTalk")}`}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => onSpeakerChange(!speakerEnabled)} style={({ pressed }) => [styles.action, speakerEnabled && styles.actionActive, pressed && styles.pressed]}>
          <Text style={styles.actionLabel}>{speakerEnabled ? `🔊 ${t("speakerOn")}` : `🔈 ${t("speakerOff")}`}</Text>
        </Pressable>
      </View>
      
      {voiceMode === "ptt" && <Text style={styles.hint}>💡 Hold the PTT button to talk - PUBG style. Team channel: only players hear you.</Text>}
    </View>
  );
}

function LiveKitVoiceControls({ members, localMemberId, socket }: { members?: VoiceMember[]; localMemberId?: number; socket?: unknown }) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant(); 
  const participants = useParticipants(); 
  const connectionState = useConnectionState(); 
  const [speaker, setSpeaker] = useState(true);
  const [voiceMode, setVoiceMode] = useState<"ptt" | "open">("open");
  const [voiceChannel, setVoiceChannel] = useState<"room" | "team">("room");
  const [speakingMap, setSpeakingMap] = useState<Map<number, boolean>>(new Map());
  const socketRef = useRef(socket as SocketLike | undefined);

  useEffect(() => { socketRef.current = socket as SocketLike | undefined; }, [socket]);

  useEffect(() => { 
    AudioSession.startAudioSession().catch(() => undefined); 
    InCallManager.start({ media: "audio" }); 
    InCallManager.setForceSpeakerphoneOn(true); 
    InCallManager.setKeepScreenOn(true);
    localParticipant.setMicrophoneEnabled(false).catch(() => undefined); 
    return () => { 
      InCallManager.stop(); 
      AudioSession.stopAudioSession().catch(() => undefined); 
    }; 
  }, [localParticipant]);

  // Listen for voice status to show speaking indicators
  useEffect(() => {
    const sock = socketRef.current;
    if (!sock?.on) return;
    const onVoiceStatus = (payload: VoiceStatusPayload) => {
      if (payload?.memberId) {
        setSpeakingMap(prev => {
          const next = new Map(prev);
          next.set(payload.memberId!, !!payload.microphoneEnabled && !!payload.isSpeaking);
          return next;
        });
      }
    };
    sock.on?.("netplay:voice-status", onVoiceStatus);
    return () => { sock.off?.("netplay:voice-status", onVoiceStatus); };
  }, [socket]);

  const handleModeChange = (mode: "ptt" | "open") => {
    setVoiceMode(mode);
    if (mode === "ptt") {
      localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    }
    socketRef.current?.emit?.("netplay:voice-status", { 
      microphoneEnabled: mode === "open" ? isMicrophoneEnabled : false, 
      speakerEnabled: speaker, 
      voiceMode: mode, 
      voiceChannel 
    });
  };

  const handleChannelChange = (channel: "room" | "team") => {
    setVoiceChannel(channel);
    socketRef.current?.emit?.("netplay:voice-status", { 
      microphoneEnabled: isMicrophoneEnabled, 
      speakerEnabled: speaker, 
      voiceMode, 
      voiceChannel: channel 
    });
  };

  const handlePttPress = () => {
    if (voiceMode === "ptt") {
      localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
      socketRef.current?.emit?.("netplay:voice-status", { microphoneEnabled: true, speakerEnabled: speaker, voiceMode, voiceChannel, isSpeaking: true });
    }
  };

  const handlePttRelease = () => {
    if (voiceMode === "ptt") {
      localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      socketRef.current?.emit?.("netplay:voice-status", { microphoneEnabled: false, speakerEnabled: speaker, voiceMode, voiceChannel, isSpeaking: false });
    }
  };

  return (
    <VoiceControls 
      microphoneEnabled={isMicrophoneEnabled} 
      speakerEnabled={speaker}
      voiceMode={voiceMode}
      voiceChannel={voiceChannel}
      connectedCount={Math.max(0, participants.length - 1)} 
      status={connectionState === ConnectionState.Connected ? `LiveKit connected - ${voiceChannel} channel - ${voiceMode} mode` : `Voice ${String(connectionState).toLowerCase()}…`} 
      onMicChange={async (enabled) => { 
        await localParticipant.setMicrophoneEnabled(enabled);
        socketRef.current?.emit?.("netplay:voice-status", { microphoneEnabled: enabled, speakerEnabled: speaker, voiceMode, voiceChannel, isSpeaking: enabled });
      }} 
      onSpeakerChange={(enabled) => { setSpeaker(enabled); InCallManager.setForceSpeakerphoneOn(enabled); }}
      onModeChange={handleModeChange}
      onChannelChange={handleChannelChange}
      onPttPress={handlePttPress}
      onPttRelease={handlePttRelease}
      speakingMembers={speakingMap}
      members={members}
      localMemberId={localMemberId}
    />
  );
}

function BuiltInWebRtcVoice({ socket, memberId, members, expose }: { socket?: unknown; memberId?: number; members?: VoiceMember[]; expose: (handle: RoomVoiceChatHandle) => void }) {
  const socketRef = useRef(socket as SocketLike | undefined); 
  const streamRef = useRef<any>(null); 
  const peersRef = useRef(new Map<number, any>()); 
  const remoteStreamsRef = useRef(new Map<number, any>()); 
  const pendingCandidatesRef = useRef(new Map<number, any[]>()); 
  const makingOfferRef = useRef(new Set<number>()); 
  const speakerEnabledRef = useRef(true);
  const voiceModeRef = useRef<"ptt" | "open">("open");
  const voiceChannelRef = useRef<"room" | "team">("room");
  
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false); 
  const [speakerEnabled, setSpeakerEnabled] = useState(true); 
  const [voiceMode, setVoiceMode] = useState<"ptt" | "open">("open");
  const [voiceChannel, setVoiceChannel] = useState<"room" | "team">("room");
  const [connectedCount, setConnectedCount] = useState(0); 
  const [status, setStatus] = useState("Preparing PUBG-style voice channel…");
  const [speakingMap, setSpeakingMap] = useState<Map<number, boolean>>(new Map());

  const setSpeaker = (enabled: boolean) => { 
    speakerEnabledRef.current = enabled; 
    setSpeakerEnabled(enabled); 
    InCallManager.setForceSpeakerphoneOn(enabled); 
  };

  const setMic = async (enabled: boolean) => { 
    const stream = streamRef.current; 
    if (!stream) return; 
    stream.getAudioTracks().forEach((track: any) => { 
      track.enabled = enabled; 
    }); 
    setMicrophoneEnabled(enabled); 
    socketRef.current?.emit?.("netplay:voice-status", { 
      microphoneEnabled: enabled, 
      speakerEnabled: speakerEnabledRef.current,
      voiceMode: voiceModeRef.current,
      voiceChannel: voiceChannelRef.current,
      isSpeaking: enabled
    }); 
  };

  const handleModeChange = (mode: "ptt" | "open") => {
    setVoiceMode(mode);
    voiceModeRef.current = mode;
    if (mode === "ptt") {
      setMic(false);
    }
    socketRef.current?.emit?.("netplay:voice-status", { 
      microphoneEnabled: mode === "open" ? microphoneEnabled : false, 
      speakerEnabled, 
      voiceMode: mode, 
      voiceChannel 
    });
  };

  const handleChannelChange = (channel: "room" | "team") => {
    setVoiceChannel(channel);
    voiceChannelRef.current = channel;
    socketRef.current?.emit?.("netplay:voice-status", { 
      microphoneEnabled, 
      speakerEnabled, 
      voiceMode, 
      voiceChannel: channel 
    });
  };

  const handlePttPress = () => {
    if (voiceMode === "ptt") {
      setMic(true);
    }
  };

  const handlePttRelease = () => {
    if (voiceMode === "ptt") {
      setMic(false);
    }
  };

  useEffect(() => { 
    expose({ 
      setMicrophoneEnabled: setMic, 
      setSpeakerEnabled: async (enabled) => setSpeaker(enabled),
      setVoiceMode: handleModeChange,
      setVoiceChannel: handleChannelChange
    }); 
  });

  useEffect(() => {
    const currentSocket = socket as SocketLike | undefined; 
    socketRef.current = currentSocket; 
    const peersForCleanup = peersRef.current; 
    const streamsForCleanup = remoteStreamsRef.current; 
    const localId = Number(memberId); 
    if (!currentSocket?.on || !currentSocket.emit || !Number.isInteger(localId) || localId <= 0) { 
      setStatus("Voice waiting for room connection..."); 
      return; 
    }
    let disposed = false; 
    const updateCount = () => setConnectedCount(Array.from(peersRef.current.values()).filter((peer: any) => peer.connectionState === "connected").length);
    
    const requestAudio = async () => { 
      if (Platform.OS === "android") { 
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, { 
          title: "PUBG-style Room Voice", 
          message: "Classic Era needs microphone for PUBG-style voice chat with team/room channels.", 
          buttonPositive: "Allow",
          buttonNegative: "Deny"
        }); 
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("microphone-permission-denied"); 
      }
      // PUBG-style audio constraints with echo cancellation and noise suppression
      const stream = await mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
          sampleSize: 16,
        } as any, 
        video: false 
      }); 
      if (disposed) { 
        stream.getTracks().forEach((track: any) => track.stop()); 
        return; 
      } 
      stream.getAudioTracks().forEach((track: any) => { 
        track.enabled = false; 
        // Enable advanced audio processing if available
        if (track.applyConstraints) {
          track.applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }).catch(() => {});
        }
      }); 
      streamRef.current = stream; 
      await AudioSession.startAudioSession().catch(() => undefined); 
      InCallManager.start({ media: "audio", auto: true }); 
      InCallManager.setForceSpeakerphoneOn(true);
      InCallManager.setKeepScreenOn(true);
      InCallManager.setSpeakerphoneOn(true);
      setStatus("PUBG-style voice ready - choose Team/Room channel"); 
      currentSocket.emit?.("netplay:signal", { signal: { kind: "voice-hello" } }); 
    };

    const ensurePeer = (remoteId: number) => { 
      const existing = peersRef.current.get(remoteId); 
      if (existing) return existing; 
      const peer = new RTCPeerConnection({ 
        iceServers: VOICE_ICE_SERVERS,
        iceTransportPolicy: "all",
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceCandidatePoolSize: 2,
      } as any); 
      streamRef.current?.getTracks().forEach((track: any) => peer.addTrack(track, streamRef.current)); 
      peer.addTransceiver("audio", { 
        direction: "sendrecv",
      } as any); 
      peer.onicecandidate = (event: any) => { 
        if (event.candidate) currentSocket.emit?.("netplay:signal", { 
          targetMemberId: remoteId, 
          signal: { kind: "voice-candidate", candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate } 
        }); 
      }; 
      peer.ontrack = (event: any) => { 
        const stream = event.streams?.[0]; 
        if (stream) { 
          stream.getAudioTracks?.().forEach((track: any) => { 
            track.enabled = true; 
          }); 
          remoteStreamsRef.current.set(remoteId, stream); 
          InCallManager.setForceSpeakerphoneOn(speakerEnabledRef.current); 
          updateCount();
        } 
      }; 
      peer.onconnectionstatechange = () => { 
        if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
          remoteStreamsRef.current.delete(remoteId);
          // Try to reconnect on failure (PUBG-style recovery)
          if (peer.connectionState === "failed") {
            setTimeout(() => {
              if (!disposed && peersRef.current.has(remoteId)) {
                peersRef.current.delete(remoteId);
                currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-hello" } });
              }
            }, 2000);
          }
        }
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
        const offer = await peer.createOffer({ 
          offerToReceiveAudio: true, 
          offerToReceiveVideo: false,
          voiceActivityDetection: true
        } as any); 
        await peer.setLocalDescription(offer); 
        currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-offer", description: offer } }); 
      } finally { 
        makingOfferRef.current.delete(remoteId); 
      } 
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
      if (kind === "voice-ready") { 
        if (localId < remoteId) await sendOffer(remoteId); 
        return; 
      } 
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
        const peer = ensurePeer(remoteId); 
        if (peer.remoteDescription) await peer.addIceCandidate(new RTCIceCandidate(signal.candidate as any)); 
        else pendingCandidatesRef.current.set(remoteId, [...(pendingCandidatesRef.current.get(remoteId) ?? []), signal.candidate]); 
      } 
    };

    const onVoiceStatus = (payload: VoiceStatusPayload) => {
      if (payload?.memberId && payload.memberId !== localId) {
        setSpeakingMap(prev => {
          const next = new Map(prev);
          const isSpeaking = !!payload.microphoneEnabled && (!!payload.isSpeaking || !!payload.microphoneEnabled);
          if (isSpeaking) {
            next.set(payload.memberId!, true);
            // Auto-clear speaking indicator after 2s if no update (PUBG-style)
            setTimeout(() => {
              setSpeakingMap(curr => {
                const updated = new Map(curr);
                // Only clear if still same state
                if (updated.get(payload.memberId!) === true) {
                  updated.set(payload.memberId!, false);
                }
                return updated;
              });
            }, 2000);
          } else {
            next.set(payload.memberId!, false);
          }
          return next;
        });
      }
    };

    currentSocket.on?.("netplay:signal", onSignal);
    currentSocket.on?.("netplay:voice-status", onVoiceStatus);
    void requestAudio().catch(() => { 
      if (!disposed) setStatus("Microphone permission required for PUBG-style voice."); 
    }); 
    
    return () => { 
      disposed = true; 
      currentSocket.off?.("netplay:signal", onSignal);
      currentSocket.off?.("netplay:voice-status", onVoiceStatus);
      peersForCleanup.forEach((peer: any) => peer.close()); 
      peersForCleanup.clear(); 
      streamsForCleanup.clear(); 
      streamRef.current?.getTracks().forEach((track: any) => track.stop()); 
      streamRef.current = null; 
      InCallManager.stop(); 
      AudioSession.stopAudioSession().catch(() => undefined); 
    };
  }, [socket, memberId]);
  
  return (
    <VoiceControls 
      microphoneEnabled={microphoneEnabled} 
      speakerEnabled={speakerEnabled}
      voiceMode={voiceMode}
      voiceChannel={voiceChannel}
      connectedCount={connectedCount} 
      status={status} 
      onMicChange={setMic} 
      onSpeakerChange={setSpeaker}
      onModeChange={handleModeChange}
      onChannelChange={handleChannelChange}
      onPttPress={handlePttPress}
      onPttRelease={handlePttRelease}
      speakingMembers={speakingMap}
      members={members}
      localMemberId={memberId}
    />
  );
}

export const RoomVoiceChat = forwardRef<RoomVoiceChatHandle, Props>(function RoomVoiceChat({ mediaToken: suppliedToken, socket, memberId, members }: Props, ref) {
  const [mediaToken, setMediaToken] = useState<MediaToken | null | undefined>(suppliedToken); 
  const fallbackHandle = useRef<RoomVoiceChatHandle>({ setMicrophoneEnabled: async () => undefined }); 
  useImperativeHandle(ref, () => ({ 
    setMicrophoneEnabled: (enabled) => fallbackHandle.current.setMicrophoneEnabled(enabled), 
    setSpeakerEnabled: (enabled) => fallbackHandle.current.setSpeakerEnabled?.(enabled) ?? Promise.resolve(),
    setVoiceMode: (mode) => fallbackHandle.current.setVoiceMode?.(mode),
    setVoiceChannel: (channel) => fallbackHandle.current.setVoiceChannel?.(channel)
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
          body: JSON.stringify({ json: { roomId, memberId: authMemberId, memberToken } }) 
        }); 
        if (!response.ok) throw new Error(`HTTP ${response.status}`); 
        const envelope = await response.json() as { result?: { data?: { json?: MediaToken } } }; 
        if (!cancelled) setMediaToken(envelope.result?.data?.json ?? { configured: false, message: "Voice SFU unavailable." }); 
      } catch { 
        if (!cancelled) setMediaToken({ configured: false, message: "Voice SFU unavailable - using PUBG-style P2P." }); 
      } 
    }; 
    void load(); 
    return () => { cancelled = true; }; 
  }, [suppliedToken, socket, memberId]);
  
  if (mediaToken?.configured && mediaToken.url && mediaToken.token) {
    return (
      <LiveKitRoom 
        serverUrl={mediaToken.url} 
        token={mediaToken.token} 
        connect 
        audio={true} 
        video={false} 
        options={{ 
          adaptiveStream: true, 
          publishDefaults: { 
            audioPreset: { maxBitrate: 64000, priority: "high" } as any, 
            dtx: true, // Enable DTX for better bandwidth (PUBG-style)
            red: true, // Enable RED for packet loss resilience
            forceStereo: false,
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          } as any,
          dynacast: true,
          stopLocalTrackOnUnpublish: false,
        }}
      >
        <LiveKitVoiceControls members={members} localMemberId={memberId} socket={socket} />
      </LiveKitRoom>
    );
  }
  return <BuiltInWebRtcVoice socket={socket} memberId={memberId} members={members} expose={(handle) => { fallbackHandle.current = handle; }} />;
});

const styles = StyleSheet.create({ 
  card: { backgroundColor: "#160D29", borderWidth: 1, borderColor: "#4B3370", borderRadius: 18, padding: 14, marginTop: 16 }, 
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, 
  title: { color: "#DCA7FF", fontSize: 13, fontWeight: "900" }, 
  counter: { backgroundColor: "#27203A", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }, 
  counterText: { color: "#9EEBFF", fontSize: 10, fontWeight: "800" }, 
  status: { color: "#C5BDD3", fontSize: 11, marginTop: 6, lineHeight: 16 },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  modeLabel: { color: "#9BAFC4", fontSize: 10, fontWeight: "800", minWidth: 55 },
  modeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "#231836", borderWidth: 1, borderColor: "#433054" },
  modeChipActive: { backgroundColor: "#5A2993", borderColor: "#B768FF" },
  modeChipText: { color: "#9BAFC4", fontSize: 10, fontWeight: "700" },
  modeChipTextActive: { color: "#FFFFFF", fontWeight: "900" },
  membersList: { marginTop: 12, backgroundColor: "#1A1230", borderRadius: 12, padding: 8, borderWidth: 1, borderColor: "#3A2A5A" },
  membersTitle: { color: "#7AE8FF", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  membersScroll: { marginTop: 6 },
  memberBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#231836", borderRadius: 14, paddingHorizontal: 8, paddingVertical: 5, marginRight: 6, borderWidth: 1, borderColor: "#433054", minWidth: 85 },
  memberSpeaking: { backgroundColor: "#2A4A2A", borderColor: "#48C78E", shadowColor: "#48C78E", shadowOpacity: 0.3 },
  memberLocal: { borderColor: "#B978FF" },
  speakingDot: { width: 8, height: 8, borderRadius: 4 },
  speakingDotActive: { backgroundColor: "#48C78E" },
  speakingDotMuted: { backgroundColor: "#555" },
  memberName: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", maxWidth: 60 },
  memberRole: { color: "#9BAFC4", fontSize: 8, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 7, marginTop: 12 }, 
  action: { flex: 1, minHeight: 48, borderRadius: 13, backgroundColor: "#231836", borderWidth: 1, borderColor: "#433054", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }, 
  actionActive: { backgroundColor: "#5A2993", borderColor: "#B768FF" }, 
  pttAction: { backgroundColor: "#3A1F0F", borderColor: "#8B5A2B" },
  pttActive: { backgroundColor: "#8B3A1A", borderColor: "#FF8C42", transform: [{ scale: 0.97 }] },
  actionLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", textAlign: "center" }, 
  hint: { color: "#9086A6", fontSize: 10, lineHeight: 15, marginTop: 8 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] } 
});
