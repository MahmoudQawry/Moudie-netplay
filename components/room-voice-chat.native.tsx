import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Alert, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import InCallManager from "react-native-incall-manager";
import { mediaDevices, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, type MediaStream } from "react-native-webrtc";
import type { Socket } from "socket.io-client";

type VoiceSignal =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "candidate"; candidate: Record<string, unknown> };

type VoiceMember = { id: number; displayName: string; role: "host" | "player" | "spectator" };
type Props = { socket: Socket | null; isHost: boolean; remoteOnline: boolean; memberId?: number; members?: VoiceMember[] };
export type RoomVoiceChatHandle = { setMicrophoneEnabled: (enabled: boolean) => Promise<void> };
type AudioRoute = "auto" | "speaker" | "bluetooth";
type PeerState = { peer: RTCPeerConnection; remoteDescriptionSet: boolean; pendingCandidates: Record<string, unknown>[] };

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

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

export const RoomVoiceChat = forwardRef<RoomVoiceChatHandle, Props>(function RoomVoiceChat({ socket, isHost, remoteOnline, memberId, members }, ref) {
  const peersRef = useRef(new Map<number, PeerState>());
  const streamRef = useRef<MediaStream | null>(null);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [audioRoute, setAudioRoute] = useState<AudioRoute>("auto");
  const [voiceState, setVoiceState] = useState("الصوت غير متصل");
  const [connectedPeers, setConnectedPeers] = useState(0);

  const remoteTargets = useMemo(() => (members ?? []).filter((member) => member.id !== memberId).map((member) => member.id), [memberId, members]);
  const sendSignal = useCallback((targetMemberId: number | undefined, signal: VoiceSignal) => {
    if (!socket?.connected) return;
    socket.emit("netplay:signal", targetMemberId ? { targetMemberId, signal } : { signal });
  }, [socket]);
  const refreshConnectedCount = useCallback(() => {
    setConnectedPeers(Array.from(peersRef.current.values()).filter(({ peer }) => peer.connectionState === "connected").length);
  }, []);
  const closePeer = useCallback((peerId: number) => {
    peersRef.current.get(peerId)?.peer.close();
    peersRef.current.delete(peerId);
    refreshConnectedCount();
  }, [refreshConnectedCount]);
  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach(({ peer }) => peer.close());
    peersRef.current.clear();
    setConnectedPeers(0);
  }, []);

  const addTracks = useCallback((peer: RTCPeerConnection, stream: MediaStream) => {
    const existing = new Set(peer.getSenders().map((sender) => sender.track?.id).filter(Boolean));
    stream.getTracks().forEach((track) => { if (!existing.has(track.id)) peer.addTrack(track, stream); });
  }, []);
  const ensureLocalStream = useCallback(async () => {
    if (!streamRef.current) streamRef.current = await mediaDevices.getUserMedia({ audio: true, video: false });
    streamRef.current.getAudioTracks().forEach((track) => (track.enabled = true));
    peersRef.current.forEach(({ peer }) => addTracks(peer, streamRef.current!));
    return streamRef.current;
  }, [addTracks]);

  const getPeer = useCallback((peerId: number) => {
    const current = peersRef.current.get(peerId);
    if (current) return current;
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 });
    const state: PeerState = { peer, remoteDescriptionSet: false, pendingCandidates: [] };
    peer.onicecandidate = (event: { candidate: { toJSON: () => Record<string, unknown> } | null }) => {
      if (event.candidate) sendSignal(peerId || undefined, { type: "candidate", candidate: event.candidate.toJSON() });
    };
    peer.onconnectionstatechange = () => {
      refreshConnectedCount();
      if (peer.connectionState === "connected") setVoiceState("الصوت متصل داخل الغرفة");
      else if (peer.connectionState === "connecting") setVoiceState("جارٍ توصيل الصوت…");
      else if (peer.connectionState === "failed") { closePeer(peerId); setVoiceState("فشل اتصال عضو صوتي؛ يمكنك إعادة المحاولة."); }
    };
    peer.ontrack = () => { refreshConnectedCount(); setVoiceState("الصوت متصل داخل الغرفة"); };
    if (streamRef.current) addTracks(peer, streamRef.current);
    peersRef.current.set(peerId, state);
    return state;
  }, [addTracks, closePeer, refreshConnectedCount, sendSignal]);

  const flushCandidates = useCallback(async (state: PeerState) => {
    const queued = state.pendingCandidates.splice(0);
    for (const candidate of queued) await state.peer.addIceCandidate(new RTCIceCandidate(candidate));
  }, []);
  const makeOffer = useCallback(async (targetMemberId?: number, allowPendingEnable = false) => {
    if (!socket?.connected || (!microphoneEnabled && !allowPendingEnable)) return;
    try {
      await ensureLocalStream();
      const state = getPeer(targetMemberId ?? 0);
      const offer = await state.peer.createOffer({ offerToReceiveAudio: true });
      await state.peer.setLocalDescription(offer);
      sendSignal(targetMemberId, { type: "offer", sdp: offer.sdp });
      setVoiceState("جارٍ توصيل الصوت…");
    } catch {
      setVoiceState("تعذر بدء الصوت. تحقق من إذن الميكروفون والاتصال.");
    }
  }, [ensureLocalStream, getPeer, microphoneEnabled, sendSignal, socket]);

  const toggleMicrophone = useCallback(async (requestedEnabled?: boolean) => {
    if (!socket?.connected) {
      Alert.alert("اربط الغرفة أولاً", "اربط قناة NetPlay قبل تفعيل الميكروفون.");
      return;
    }
    const next = requestedEnabled ?? !microphoneEnabled;
    try {
      if (next) {
        if (!(await requestVoicePermissions())) {
          Alert.alert("إذن مطلوب", "اسمح للتطبيق باستخدام الميكروفون وBluetooth من إعدادات Android لتفعيل الدردشة الصوتية.");
          return;
        }
        await ensureLocalStream();
        InCallManager.start({ media: "audio", auto: true });
        InCallManager.setMicrophoneMute(false);
        setAudioRoute("auto");
        const targets = remoteTargets.length ? remoteTargets : (remoteOnline ? [undefined] : []);
        if (targets.length) await Promise.all(targets.map((target) => makeOffer(target, true)));
        setVoiceState(targets.length ? "الميكروفون يعمل. جارٍ ربط أعضاء الغرفة…" : "الميكروفون يعمل. بانتظار دخول عضو آخر.");
      } else {
        streamRef.current?.getAudioTracks().forEach((track) => (track.enabled = false));
        InCallManager.setMicrophoneMute(true);
        setVoiceState("الميكروفون مكتوم؛ تستمر سماع الغرفة.");
      }
      setMicrophoneEnabled(next);
      socket.emit("netplay:voice-status", { microphoneEnabled: next, speakerEnabled: next && audioRoute === "speaker" });
    } catch {
      setVoiceState("تعذر تفعيل الميكروفون. أعد توصيل الغرفة ثم حاول مجدداً.");
    }
  }, [audioRoute, ensureLocalStream, makeOffer, microphoneEnabled, remoteOnline, remoteTargets, socket]);

  const selectSpeaker = () => { InCallManager.setForceSpeakerphoneOn(true); setAudioRoute("speaker"); socket?.emit("netplay:voice-status", { microphoneEnabled, speakerEnabled: true }); };
  const selectBluetooth = async () => {
    try { await InCallManager.chooseAudioRoute("BLUETOOTH"); setAudioRoute("bluetooth"); setVoiceState("تم طلب مخرج Bluetooth."); }
    catch { setVoiceState("لم تتوفر سماعة Bluetooth حالياً. استخدم الوضع التلقائي أو مكبر الصوت."); }
  };

  useEffect(() => {
    if (!socket) return;
    const handleSignal = async (payload: { fromMemberId?: number; signal?: VoiceSignal }) => {
      const signal = payload.signal;
      if (!signal) return;
      const sourceId = Number.isInteger(payload.fromMemberId) ? Number(payload.fromMemberId) : 0;
      try {
        const state = getPeer(sourceId);
        if (signal.type === "offer") {
          await state.peer.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: signal.sdp }));
          state.remoteDescriptionSet = true;
          await flushCandidates(state);
          if (microphoneEnabled) await ensureLocalStream();
          const answer = await state.peer.createAnswer();
          await state.peer.setLocalDescription(answer);
          sendSignal(sourceId || undefined, { type: "answer", sdp: answer.sdp });
          setVoiceState("جارٍ توصيل الصوت…");
        } else if (signal.type === "answer") {
          await state.peer.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.sdp }));
          state.remoteDescriptionSet = true;
          await flushCandidates(state);
        } else if (signal.type === "candidate") {
          if (!state.remoteDescriptionSet) state.pendingCandidates.push(signal.candidate);
          else await state.peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch {
        setVoiceState("تعذر ربط الصوت مع أحد أعضاء الغرفة.");
      }
    };
    const handleDisconnect = () => { closeAllPeers(); setVoiceState("انقطع اتصال الغرفة؛ جارٍ إعادة الاتصال…"); };
    const handleReconnect = () => { setVoiceState("عادت قناة الغرفة. فعّل الميكروفون لإعادة ربط الصوت."); };
    socket.on("netplay:signal", handleSignal);
    socket.on("disconnect", handleDisconnect);
    socket.on("reconnect", handleReconnect);
    return () => { socket.off("netplay:signal", handleSignal); socket.off("disconnect", handleDisconnect); socket.off("reconnect", handleReconnect); };
  }, [closeAllPeers, ensureLocalStream, flushCandidates, getPeer, microphoneEnabled, sendSignal, socket]);

  useEffect(() => {
    if (!microphoneEnabled || !socket?.connected || !remoteTargets.length) return;
    remoteTargets.forEach((target) => { if (!peersRef.current.has(target)) makeOffer(target); });
  }, [makeOffer, microphoneEnabled, remoteTargets, socket]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()); closeAllPeers(); InCallManager.stop(); }, [closeAllPeers]);
  useImperativeHandle(ref, () => ({ setMicrophoneEnabled: async (enabled) => { if (enabled !== microphoneEnabled) await toggleMicrophone(enabled); } }), [microphoneEnabled, toggleMicrophone]);

  if (Platform.OS === "web") return null;
  return (
    <View style={styles.card}>
      <View style={styles.heading}><Text style={styles.title}>الصوت داخل الغرفة</Text><View style={styles.counter}><Text style={styles.counterText}>{connectedPeers} متصل صوتيًا</Text></View></View>
      <Text style={styles.status}>{voiceState}</Text>
      <View style={styles.actions}>
        <Pressable onPress={() => toggleMicrophone()} style={({ pressed }) => [styles.action, microphoneEnabled && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>{microphoneEnabled ? "الميكروفون يعمل" : "الميكروفون متوقف"}</Text></Pressable>
        <Pressable onPress={selectSpeaker} style={({ pressed }) => [styles.action, audioRoute === "speaker" && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>مكبر الهاتف</Text></Pressable>
        <Pressable onPress={selectBluetooth} style={({ pressed }) => [styles.action, audioRoute === "bluetooth" && styles.actionActive, pressed && styles.pressed]}><Text style={styles.actionLabel}>Bluetooth</Text></Pressable>
      </View>
      <Text style={styles.hint}>الصوت يُربط مباشرة بين أعضاء الغرفة. قد يحتاج بعض الاتصالات المقيدة إلى خادم TURN للإنتاج واسع النطاق.</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: "#160D29", borderWidth: 1, borderColor: "#4B3370", borderRadius: 18, padding: 14, marginTop: 16 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#DCA7FF", fontSize: 14, fontWeight: "900", textAlign: "right" },
  counter: { backgroundColor: "#27203A", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  counterText: { color: "#9EEBFF", fontSize: 10, fontWeight: "800" },
  status: { color: "#C5BDD3", fontSize: 12, textAlign: "right", marginTop: 6 },
  actions: { flexDirection: "row-reverse", gap: 7, marginTop: 11 },
  action: { flex: 1, minHeight: 46, borderRadius: 13, backgroundColor: "#231836", borderWidth: 1, borderColor: "#433054", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  actionActive: { backgroundColor: "#5A2993", borderColor: "#B768FF" },
  actionLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", textAlign: "center" },
  hint: { color: "#9086A6", fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 10 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
