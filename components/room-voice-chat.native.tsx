import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Alert, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import InCallManager from "react-native-incall-manager";
import {
  mediaDevices,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  type MediaStream,
} from "react-native-webrtc";
import type { Socket } from "socket.io-client";

type VoiceSignal =
  | { type: "ready" }
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "candidate"; candidate: Record<string, unknown> };

type Props = { socket: Socket | null; isHost: boolean; remoteOnline: boolean };
export type RoomVoiceChatHandle = { setMicrophoneEnabled: (enabled: boolean) => Promise<void> };
type AudioRoute = "auto" | "speaker" | "bluetooth";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

async function requestVoicePermissions() {
  if (Platform.OS !== "android") return true;
  const audio = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  if (audio !== PermissionsAndroid.RESULTS.GRANTED) return false;
  const apiLevel = typeof Platform.Version === "number" ? Platform.Version : Number.parseInt(Platform.Version, 10);
  if (apiLevel >= 31) {
    const bluetooth = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    if (bluetooth !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }
  return true;
}

export const RoomVoiceChat = forwardRef<RoomVoiceChatHandle, Props>(function RoomVoiceChat({ socket, isHost, remoteOnline }, ref) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const offerInFlightRef = useRef(false);
  const remoteDescriptionSetRef = useRef(false);
  const pendingCandidatesRef = useRef<Record<string, unknown>[]>([]);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [audioRoute, setAudioRoute] = useState<AudioRoute>("auto");
  const [voiceState, setVoiceState] = useState("الصوت غير متصل");

  const emitStatus = useCallback(
    (microphone: boolean, route: AudioRoute) => socket?.emit("netplay:voice-status", { microphoneEnabled: microphone, speakerEnabled: route === "speaker" }),
    [socket],
  );

  const closePeer = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    remoteDescriptionSetRef.current = false;
    pendingCandidatesRef.current = [];
  }, []);

  const createPeer = useCallback(() => {
    if (peerRef.current) return peerRef.current;
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 });
    peer.onicecandidate = (event: { candidate: { toJSON: () => Record<string, unknown> } | null }) => {
      if (event.candidate) socket?.emit("netplay:signal", { signal: { type: "candidate", candidate: event.candidate.toJSON() } });
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setVoiceState("الصوت متصل");
      else if (peer.connectionState === "connecting") setVoiceState("جارٍ توصيل الصوت…");
      else if (peer.connectionState === "disconnected") setVoiceState("انقطع الصوت مؤقتاً؛ جارٍ الاستعادة…");
      else if (peer.connectionState === "failed") {
        closePeer();
        setVoiceState("تجري إعادة توصيل الصوت…");
        socket?.emit("netplay:signal", { signal: { type: "ready" } });
      }
    };
    peer.ontrack = () => setVoiceState("الصوت متصل");
    peerRef.current = peer;
    return peer;
  }, [closePeer, socket]);

  const addLocalStream = useCallback(async () => {
    if (streamRef.current) return streamRef.current;
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    streamRef.current = stream;
    const peer = createPeer();
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    return stream;
  }, [createPeer]);

  const flushCandidates = useCallback(async (peer: RTCPeerConnection) => {
    const queued = pendingCandidatesRef.current.splice(0);
    for (const candidate of queued) await peer.addIceCandidate(new RTCIceCandidate(candidate));
  }, []);

  const makeOffer = useCallback(async () => {
    if (!socket?.connected || !isHost || !remoteOnline || !microphoneEnabled || offerInFlightRef.current) return;
    offerInFlightRef.current = true;
    try {
      const peer = createPeer();
      await addLocalStream();
      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      await peer.setLocalDescription(offer);
      socket.emit("netplay:signal", { signal: { type: "offer", sdp: offer.sdp } });
      setVoiceState("جارٍ إرسال طلب صوتي…");
    } catch {
      closePeer();
      setVoiceState("تعذر بدء الصوت. تحقق من إذن الميكروفون.");
    } finally {
      offerInFlightRef.current = false;
    }
  }, [addLocalStream, closePeer, createPeer, isHost, microphoneEnabled, remoteOnline, socket]);

  const toggleMicrophone = async (requestedEnabled?: boolean) => {
    if (!socket?.connected) {
      Alert.alert("اربط الغرفة أولاً", "اربط قناة NetPlay قبل تفعيل الميكروفون.");
      return;
    }
    const next = requestedEnabled ?? !microphoneEnabled;
    const nextRoute = next ? "auto" : audioRoute;
    try {
      if (next) {
        if (!(await requestVoicePermissions())) {
          Alert.alert("إذن مطلوب", "اسمح للتطبيق باستخدام الميكروفون وBluetooth من إعدادات Android لتفعيل الدردشة الصوتية.");
          return;
        }
        await addLocalStream();
        streamRef.current?.getAudioTracks().forEach((track) => (track.enabled = true));
        InCallManager.start({ media: "audio", auto: true });
        InCallManager.setMicrophoneMute(false);
        setAudioRoute("auto");
        setVoiceState(remoteOnline ? "الميكروفون يعمل. جارٍ ربط الصوت…" : "الميكروفون يعمل. بانتظار اللاعب الآخر.");
        socket.emit("netplay:signal", { signal: { type: "ready" } });
      } else {
        streamRef.current?.getAudioTracks().forEach((track) => (track.enabled = false));
        InCallManager.setMicrophoneMute(true);
        setVoiceState("الميكروفون مكتوم؛ تستمر سماع اللاعب الآخر.");
      }
      setMicrophoneEnabled(next);
      emitStatus(next, nextRoute);
    } catch {
      setVoiceState("تعذر تفعيل الميككروفون. أعد توصيل الغرفة ثم حاول مجدداً.");
    }
  };

  const selectSpeaker = () => {
    InCallManager.setForceSpeakerphoneOn(true);
    setAudioRoute("speaker");
    emitStatus(microphoneEnabled, "speaker");
  };

  const selectBluetooth = async () => {
    try {
      await InCallManager.chooseAudioRoute("BLUETOOTH");
      setAudioRoute("bluetooth");
      setVoiceState("تم طلب مخرج Bluetooth. تأكد من اتصال سماعة البلوتوث.");
      emitStatus(microphoneEnabled, "bluetooth");
    } catch {
      setVoiceState("لم تتوفر سماعة Bluetooth حالياً. استخدم الوضع التلقائي أو مكبر الصوت.");
    }
  };

  useEffect(() => {
    if (!socket) return;
    const handleSignal = async (payload: { signal?: VoiceSignal }) => {
      const signal = payload.signal;
      if (!signal) return;
      try {
        if (signal.type === "ready") {
          await makeOffer();
          return;
        }
        const peer = createPeer();
        if (signal.type === "offer") {
          await peer.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: signal.sdp }));
          remoteDescriptionSetRef.current = true;
          await flushCandidates(peer);
          if (microphoneEnabled) await addLocalStream();
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit("netplay:signal", { signal: { type: "answer", sdp: answer.sdp } });
          setVoiceState("جارٍ توصيل الصوت…");
        } else if (signal.type === "answer") {
          await peer.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.sdp }));
          remoteDescriptionSetRef.current = true;
          await flushCandidates(peer);
        } else if (signal.type === "candidate") {
          if (!remoteDescriptionSetRef.current) pendingCandidatesRef.current.push(signal.candidate);
          else await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch {
        setVoiceState("تعذر ربط الصوت بين الهاتفين؛ سيعاد الطلب عند استقرار الشبكة.");
      }
    };
    const handleDisconnect = () => {
      closePeer();
      setVoiceState("انقطع اتصال الغرفة؛ جارٍ إعادة الاتصال…");
    };
    const handleReconnect = () => {
      setVoiceState("عادت قناة الغرفة. جارٍ استعادة الصوت…");
      socket.emit("netplay:signal", { signal: { type: "ready" } });
    };
    socket.on("netplay:signal", handleSignal);
    socket.on("disconnect", handleDisconnect);
    socket.on("reconnect", handleReconnect);
    return () => {
      socket.off("netplay:signal", handleSignal);
      socket.off("disconnect", handleDisconnect);
      socket.off("reconnect", handleReconnect);
    };
  }, [addLocalStream, closePeer, createPeer, flushCandidates, makeOffer, microphoneEnabled, socket]);

  useEffect(() => {
    if (!socket?.connected || !remoteOnline) return;
    if (isHost && microphoneEnabled) makeOffer();
    if (!isHost && microphoneEnabled) socket.emit("netplay:signal", { signal: { type: "ready" } });
  }, [isHost, makeOffer, microphoneEnabled, remoteOnline, socket]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      closePeer();
      InCallManager.stop();
    },
    [closePeer],
  );

  useImperativeHandle(ref, () => ({
    setMicrophoneEnabled: async (enabled: boolean) => {
      if (enabled !== microphoneEnabled) await toggleMicrophone(enabled);
    },
  }), [microphoneEnabled, socket]);

  if (Platform.OS === "web") return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>الصوت داخل الغرفة</Text>
      <Text style={styles.status}>{voiceState}</Text>
      <View style={styles.actions}>
        <Pressable onPress={() => toggleMicrophone()} style={({ pressed }) => [styles.action, microphoneEnabled && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>{microphoneEnabled ? "الميكروفون يعمل" : "الميكروفون متوقف"}</Text></Pressable>
        <Pressable onPress={selectSpeaker} style={({ pressed }) => [styles.action, audioRoute === "speaker" && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>مكبر الهاتف</Text></Pressable>
        <Pressable onPress={selectBluetooth} style={({ pressed }) => [styles.action, audioRoute === "bluetooth" && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>Bluetooth</Text></Pressable>
      </View>
      <Text style={styles.hint}>يختار الوضع التلقائي سماعة الهاتف أو Bluetooth عند الاتصال. استخدم مكبر الهاتف أو Bluetooth فقط عندما تريد تغيير المخرج يدوياً.</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: "#101D2E", borderWidth: 1, borderColor: "#29415B", borderRadius: 16, padding: 13, marginTop: 16 },
  title: { color: "#F4C662", fontSize: 13, fontWeight: "900", textAlign: "right" },
  status: { color: "#B5C7D9", fontSize: 12, textAlign: "right", marginTop: 5 },
  actions: { flexDirection: "row-reverse", gap: 7, marginTop: 11 },
  action: { flex: 1, minHeight: 46, borderRadius: 13, backgroundColor: "#22344A", borderWidth: 1, borderColor: "#3D5873", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  actionActive: { backgroundColor: "#146C94", borderColor: "#62C2EB" },
  actionLabel: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", textAlign: "center" },
  hint: { color: "#879AAF", fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 10 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
