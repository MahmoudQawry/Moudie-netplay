import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useLanguage } from "@/lib/language";
import { RoomChat } from "@/components/room-chat";
import { RoomVoiceChat, type RoomVoiceChatHandle } from "@/components/room-voice-chat";
import { getNetplayServiceUrl } from "@/constants/oauth";
import { haptic } from "@/lib/haptics";
import { createNetplaySocket } from "@/lib/netplay-socket";
import { setRealtimeRoomReady } from "@/lib/realtime-room-service";
import { getRoomCredential, type RoomCredential } from "@/lib/room-storage";
import { useRealtimeRoomSnapshot } from "@/lib/use-realtime-room-snapshot";
import MoudieEmulatorModule from "@/modules/moudie-emulator/src/MoudieEmulatorModule";

const PSP_EXTENSIONS = [".iso", ".cso", ".chd", ".pbp"];
const PSP_NETPLAY_CORE_VERSION = "ppsspp-libretro-lockstep-v2-pubg";

type RoomGame = { name: string; uri: string; fingerprint: string };
type PlayerSeat = 1 | 2 | 3 | 4;
const isPlayerSeat = (value: unknown): value is PlayerSeat => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 4;

export default function PSPRoomScreen() {
  const { t } = useLanguage();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const numericRoomId = Number(roomId);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  const [aspectRatio, setAspectRatio] = useState<"fit" | "4:3" | "16:9">("4:3");
  const [credential, setCredential] = useState<RoomCredential | null | undefined>(undefined);
  const socketRef = useRef<ReturnType<typeof createNetplaySocket> | null>(null);
  const voiceChatRef = useRef<RoomVoiceChatHandle | null>(null);
  const launchGameRef = useRef<(withNetplay?: boolean, settingsMode?: boolean, synchronizedStart?: boolean) => Promise<void>>(async () => undefined);
  const [roomConnected, setRoomConnected] = useState(false);
  const [remoteOnline, setRemoteOnline] = useState(false);
  const [assignedPlayer, setAssignedPlayer] = useState<PlayerSeat | null>(null);
  const [game, setGame] = useState<RoomGame | null>(null);
  const [picking, setPicking] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [gameReady, setGameReady] = useState(false);
  const [startRequested, setStartRequested] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const statusText = status === null ? t("pspInitialStatus") : status;
  const snapshotQuery = useRealtimeRoomSnapshot(numericRoomId, credential, 4_000);
  const playerOptions = { orientation, aspectRatio };

  useEffect(() => { if (Number.isFinite(numericRoomId)) getRoomCredential(numericRoomId).then(setCredential); }, [numericRoomId]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = MoudieEmulatorModule.addListener("nativeOverlayAction", (payload) => {
      if (payload.action === "toggle-microphone") void voiceChatRef.current?.setMicrophoneEnabled(!payload.muted);
      if (payload.action === "toggle-speaker") void voiceChatRef.current?.setSpeakerEnabled?.(!payload.muted);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!credential || Platform.OS === "web") return;
    const socket = createNetplaySocket({ roomId: numericRoomId, memberId: credential.memberId, memberToken: credential.memberToken });
    socketRef.current = socket;
    const connected = () => { setRoomConnected(true); setStatus(t("pspChannelConnected")); };
    const disconnected = () => { setRoomConnected(false); setRemoteOnline(false); setStatus(t("pspChannelDisconnected")); };
    const joined = (payload: { onlineMemberIds?: number[]; assignedPlayer?: number }) => {
      setRemoteOnline(Boolean(payload.onlineMemberIds?.some((id) => id !== credential.memberId)));
      setAssignedPlayer(isPlayerSeat(payload.assignedPlayer) ? payload.assignedPlayer : null);
    };
    const presence = (payload: { memberId?: number; online?: boolean }) => { if (payload.memberId !== credential.memberId) setRemoteOnline(Boolean(payload.online)); };
    const start = (payload: { system?: string }) => {
      if (payload.system !== "psp") return;
      setStatus(t("pspAllReady"));
      void launchGameRef.current(true, false, true);
    };
    const refused = (payload: { message?: string }) => setStatus(payload.message || t("pspWaitingVerify"));
    socket.on("connect", connected); socket.on("disconnect", disconnected); socket.on("netplay:joined", joined); socket.on("netplay:presence", presence); socket.on("netplay:session-start", start); socket.on("netplay:session-start-refused", refused); socket.connect();
    return () => { socket.off("connect", connected); socket.off("disconnect", disconnected); socket.off("netplay:joined", joined); socket.off("netplay:presence", presence); socket.off("netplay:session-start", start); socket.off("netplay:session-start-refused", refused); socket.disconnect(); if (socketRef.current === socket) socketRef.current = null; };
  }, [credential, game, numericRoomId]);

  const pickGame = async () => {
    try {
      setPicking(true);
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.name || !asset.uri) throw new Error(t("unsupportedGameFile"));
      if (!PSP_EXTENSIONS.some((extension) => asset.name.toLowerCase().endsWith(extension))) throw new Error(t("choosePspFile"));
      if (Platform.OS === "web") throw new Error(t("pspAndroidOnly"));
      setStatus(t("pspCheckingFingerprint"));
      const fingerprint = await MoudieEmulatorModule.fingerprintNativeGame("psp", asset.uri, asset.name);
      setStatus(t("pspPreparingCore"));
      await MoudieEmulatorModule.prepareFastLaunch("psp", asset.uri, asset.name);
      setGame({ name: asset.name, uri: asset.uri, fingerprint });
      setGameReady(false); setStartRequested(false);
      setStatus(t("pspCacheReady")); haptic.success();
    } catch (error) { haptic.error(); Alert.alert(t("choosePspGameError"), error instanceof Error ? error.message : t("tryAgain")); setStatus(t("pspPickSupported")); }
    finally { setPicking(false); }
  };

  const markGameReady = async () => {
    if (!game || !credential || !roomConnected || !assignedPlayer) return;
    try {
      await setRealtimeRoomReady({ roomId: numericRoomId, memberId: credential.memberId, memberToken: credential.memberToken, isReady: true, fingerprint: game.fingerprint, coreVersion: PSP_NETPLAY_CORE_VERSION });
      socketRef.current?.emit("netplay:session-ready", { system: "psp", fingerprint: game.fingerprint, coreVersion: PSP_NETPLAY_CORE_VERSION });
      setGameReady(true); setStatus(t("pspReadyConfirmed")); haptic.success();
    } catch (error) { Alert.alert(t("readyError"), error instanceof Error ? error.message : t("tryAgain")); }
  };

  const requestSynchronizedStart = () => {
    if (!gameReady || assignedPlayer !== 1 || !remoteOnline) return;
    socketRef.current?.emit("netplay:session-start-request", { system: "psp" });
    setStartRequested(true); setStatus(t("pspCheckingBoth"));
  };

  const launchGame = async (withNetplay = false, settingsMode = false, synchronizedStart = false) => {
    if (!game) return;
    if (Platform.OS === "web") { Alert.alert(t("androidRequired"), t("pspAndroidOnly")); return; }
    try {
      setLaunching(true);
      const netplay = withNetplay && credential && assignedPlayer && (synchronizedStart || roomConnected) ? { serverUrl: getNetplayServiceUrl(), roomId: numericRoomId, memberId: credential.memberId, memberToken: credential.memberToken, system: "psp" as const, fingerprint: game.fingerprint, coreVersion: PSP_NETPLAY_CORE_VERSION, player: assignedPlayer } : undefined;
      if (withNetplay && !netplay) throw new Error(t("pspNetplayNeedsSeat"));
      await MoudieEmulatorModule.launchNativeGame("psp", game.uri, game.name, { ...playerOptions, settingsMode }, netplay);
    } catch (error) { haptic.error(); const message = error instanceof Error ? error.message : t("tryAgain"); Alert.alert(t("startPspError"), message); setStatus(message); }
    finally { setLaunching(false); }
  };
  launchGameRef.current = launchGame;

  const host = snapshotQuery.data?.members.find((member) => member.id === credential?.memberId)?.role === "host";
  const canStart = Boolean(gameReady && assignedPlayer === 1 && remoteOnline && roomConnected && !startRequested);
  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}><Pressable onPress={() => router.replace({ pathname: "/room/[roomId]", params: { roomId: String(roomId ?? "") } })}><Text style={styles.back}>‹ {t("fcBackToRoom")}</Text></Pressable><Text style={styles.chip}>{t("pspChip")}</Text></View>
        <Text style={styles.eyebrow}>{t("pspEyebrow")}</Text><Text style={styles.title}>PlayStation Portable</Text>
        <Text style={styles.subtitle}>{t("pspSubtitle")}</Text>
        <View style={styles.preview}><Text style={styles.previewMark}>PSP</Text><Text style={styles.gameName}>{game?.name || t("fcNoGame")}</Text><Text style={styles.previewText}>{assignedPlayer ? `${t("rmPlayerShort")} ${assignedPlayer} · ${roomConnected ? t("pspRoomConnected") : t("pspConnecting")}` : t("pspSpectatorWait")}</Text></View>
        <Pressable onPress={pickGame} disabled={picking || launching} style={({ pressed }) => [styles.primary, (pressed || picking || launching) && styles.disabled]}>{picking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{game ? t("pspChangeGame") : t("pspChooseGame")}</Text>}</Pressable>
        <View style={styles.settings}><Text style={styles.settingsTitle}>{t("lsSettingsTitle")}</Text><Text style={styles.settingsLabel}>{t("lsPlayOrientation")}</Text><View style={styles.settingsRow}>{(["portrait", "landscape"] as const).map((value) => <Pressable key={value} onPress={() => setOrientation(value)} style={[styles.settingOption, orientation === value && styles.settingActive]}><Text style={styles.settingText}>{value.toUpperCase()}</Text></Pressable>)}</View><Text style={styles.settingsLabel}>{t("lsScreenRatio")}</Text><View style={styles.settingsRow}>{(["fit", "4:3", "16:9"] as const).map((value) => <Pressable key={value} onPress={() => setAspectRatio(value)} style={[styles.settingOption, aspectRatio === value && styles.settingActive]}><Text style={styles.settingText}>{value === "fit" ? "FIT" : value}</Text></Pressable>)}</View><Text style={styles.settingsHint}>{t("pspSettingsHint")}</Text>{game && <Pressable onPress={() => launchGame(false, true)} disabled={launching || picking} style={({ pressed }) => [styles.configure, (pressed || launching || picking) && styles.disabled]}><Text style={styles.configureText}>{orientation === "portrait" ? t("pspConfigurePortrait") : t("pspConfigureLandscape")}</Text></Pressable>}</View>
        <View style={styles.statusCard}><Text style={styles.statusTitle}>{t("fcNetplayStatus")}</Text><Text style={styles.statusText}>{statusText}</Text></View>
        {game && roomConnected && assignedPlayer && <Pressable onPress={markGameReady} disabled={gameReady || launching} style={({ pressed }) => [styles.readyButton, (pressed || gameReady || launching) && styles.disabled]}><Text style={styles.readyText}>{gameReady ? t("fcReadyConfirmed") : t("pspReady2")}</Text></Pressable>}
        {canStart && <Pressable onPress={requestSynchronizedStart} style={({ pressed }) => [styles.launch, pressed && styles.disabled]}><Text style={styles.launchText}>{t("pspStartSession")}</Text></Pressable>}
        {startRequested && <Text style={styles.wait}>{t("pspWaitingVerify")}</Text>}
        <View style={styles.note}><Text style={styles.noteTitle}>{t("pspRoomControls")}</Text><Text style={styles.noteText}>{t("pspRoomControlsText")}</Text></View>
        {Platform.OS !== "web" && <><RoomChat socket={roomConnected ? socketRef.current : null} title={`PSP · ${t("roomChat")}`} /><RoomVoiceChat ref={voiceChatRef} socket={roomConnected ? socketRef.current : null} isHost={Boolean(host)} remoteOnline={remoteOnline} memberId={credential?.memberId} members={snapshotQuery.data?.members ?? []} /></>}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 10, paddingBottom: 30 }, topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, back: { color: "#AABDD1", fontSize: 13, fontWeight: "900" }, chip: { color: "#73E8FF", fontSize: 11, fontWeight: "900", backgroundColor: "#123242", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 }, eyebrow: { color: "#66E4FF", fontSize: 11, letterSpacing: 1.2, fontWeight: "900", marginTop: 24 }, title: { color: "#F5F7FF", fontSize: 28, fontWeight: "900", marginTop: 4 }, subtitle: { color: "#B8C4D2", fontSize: 13, lineHeight: 20, marginTop: 8 }, preview: { minHeight: 180, alignItems: "center", justifyContent: "center", borderRadius: 22, borderWidth: 1, borderColor: "#266A85", backgroundColor: "#071721", marginTop: 20, padding: 18 }, previewMark: { color: "#071721", backgroundColor: "#50E4FF", borderRadius: 28, overflow: "hidden", paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, fontWeight: "900" }, gameName: { color: "#F5F7FF", fontSize: 16, fontWeight: "900", marginTop: 16, textAlign: "center" }, previewText: { color: "#9FC1D0", fontSize: 11, marginTop: 6, textAlign: "center" }, primary: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#157898", marginTop: 18 }, primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" }, settings: { marginTop: 16, borderRadius: 17, borderWidth: 1, borderColor: "#2E5873", backgroundColor: "#11293A", padding: 14 }, settingsTitle: { color: "#C7F7FF", fontSize: 12, fontWeight: "900" }, settingsLabel: { color: "#8FC4D6", fontSize: 10, fontWeight: "900", marginTop: 12 }, settingsRow: { flexDirection: "row", gap: 8, marginTop: 7 }, settingOption: { flex: 1, minHeight: 37, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "#35576B", backgroundColor: "#122235" }, settingActive: { borderColor: "#64EBFF", backgroundColor: "#17607A" }, settingText: { color: "#F1FBFF", fontSize: 10, fontWeight: "900" }, settingsHint: { color: "#B8D4DF", fontSize: 10, lineHeight: 16, marginTop: 12 }, configure: { minHeight: 44, marginTop: 12, borderRadius: 12, backgroundColor: "#23516B", alignItems: "center", justifyContent: "center" }, configureText: { color: "#D9F7FF", fontSize: 10, fontWeight: "900" }, statusCard: { marginTop: 16, borderRadius: 16, padding: 13, backgroundColor: "#152438", borderWidth: 1, borderColor: "#2D5774" }, statusTitle: { color: "#74E5FF", fontSize: 10, fontWeight: "900" }, statusText: { color: "#C7DAE3", fontSize: 11, lineHeight: 17, marginTop: 6 }, readyButton: { minHeight: 52, marginTop: 12, borderRadius: 16, backgroundColor: "#45C987", alignItems: "center", justifyContent: "center" }, readyText: { color: "#08281A", fontSize: 12, fontWeight: "900" }, launch: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#72E8FF", marginTop: 10 }, launchText: { color: "#071018", fontSize: 12, fontWeight: "900" }, wait: { color: "#F7D376", fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 13 }, disabled: { opacity: .55 }, note: { backgroundColor: "#162235", borderColor: "#2E5873", borderWidth: 1, borderRadius: 17, padding: 14, marginTop: 18 }, noteTitle: { color: "#77E9FF", fontSize: 12, fontWeight: "900" }, noteText: { color: "#C0D5E0", fontSize: 11, lineHeight: 17, marginTop: 6 },
});
