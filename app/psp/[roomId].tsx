import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { RoomChat } from "@/components/room-chat";
import { RoomVoiceChat } from "@/components/room-voice-chat";
import { getNetplayServiceUrl } from "@/constants/oauth";
import { haptic } from "@/lib/haptics";
import { createNetplaySocket } from "@/lib/netplay-socket";
import { setRealtimeRoomReady } from "@/lib/realtime-room-service";
import { getRoomCredential, type RoomCredential } from "@/lib/room-storage";
import { useRealtimeRoomSnapshot } from "@/lib/use-realtime-room-snapshot";
import MoudieEmulatorModule from "@/modules/moudie-emulator/src/MoudieEmulatorModule";

const PSP_EXTENSIONS = [".iso", ".cso", ".chd", ".pbp"];
const PSP_NETPLAY_CORE_VERSION = "ppsspp-libretro-lockstep-v1";

type RoomGame = { name: string; uri: string; fingerprint: string };

export default function PSPRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const numericRoomId = Number(roomId);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  const [aspectRatio, setAspectRatio] = useState<"fit" | "4:3" | "16:9">("4:3");
  const [credential, setCredential] = useState<RoomCredential | null | undefined>(undefined);
  const socketRef = useRef<ReturnType<typeof createNetplaySocket> | null>(null);
  const [roomConnected, setRoomConnected] = useState(false);
  const [remoteOnline, setRemoteOnline] = useState(false);
  const [assignedPlayer, setAssignedPlayer] = useState<1 | 2 | null>(null);
  const [game, setGame] = useState<RoomGame | null>(null);
  const [picking, setPicking] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [gameReady, setGameReady] = useState(false);
  const [startRequested, setStartRequested] = useState(false);
  const [status, setStatus] = useState("Choose the same legal PSP file on both devices.");
  const snapshotQuery = useRealtimeRoomSnapshot(numericRoomId, credential, 4_000);
  const playerOptions = { orientation, aspectRatio };

  useEffect(() => { if (Number.isFinite(numericRoomId)) getRoomCredential(numericRoomId).then(setCredential); }, [numericRoomId]);
  useEffect(() => {
    if (!credential || Platform.OS === "web") return;
    const socket = createNetplaySocket({ roomId: numericRoomId, memberId: credential.memberId, memberToken: credential.memberToken });
    socketRef.current = socket;
    const connected = () => { setRoomConnected(true); setStatus("Room channel connected. Choose your local file and mark READY."); };
    const disconnected = () => { setRoomConnected(false); setRemoteOnline(false); setStatus("Room channel disconnected. Reconnecting automatically…"); };
    const joined = (payload: { onlineMemberIds?: number[]; assignedPlayer?: number }) => {
      setRemoteOnline(Boolean(payload.onlineMemberIds?.some((id) => id !== credential.memberId)));
      setAssignedPlayer(payload.assignedPlayer === 1 || payload.assignedPlayer === 2 ? payload.assignedPlayer : null);
    };
    const presence = (payload: { memberId?: number; online?: boolean }) => { if (payload.memberId !== credential.memberId) setRemoteOnline(Boolean(payload.online)); };
    const start = (payload: { system?: string }) => {
      if (payload.system !== "psp" || !game || !credential) return;
      setStatus("Both devices are ready. Opening the synchronized PSP player…");
      launchGame(true);
    };
    const refused = (payload: { message?: string }) => setStatus(payload.message || "Waiting for the other player to verify the same file.");
    socket.on("connect", connected); socket.on("disconnect", disconnected); socket.on("netplay:joined", joined); socket.on("netplay:presence", presence); socket.on("netplay:session-start", start); socket.on("netplay:session-start-refused", refused); socket.connect();
    return () => { socket.off("connect", connected); socket.off("disconnect", disconnected); socket.off("netplay:joined", joined); socket.off("netplay:presence", presence); socket.off("netplay:session-start", start); socket.off("netplay:session-start-refused", refused); socket.disconnect(); if (socketRef.current === socket) socketRef.current = null; };
    // launchGame reads current room state when the synchronized start event arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credential, game, numericRoomId]);

  const pickGame = async () => {
    try {
      setPicking(true);
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.name || !asset.uri) throw new Error("Could not read the selected file.");
      if (!PSP_EXTENSIONS.some((extension) => asset.name.toLowerCase().endsWith(extension))) throw new Error("Choose a PSP ISO, CSO, CHD, or PBP file.");
      if (Platform.OS === "web") throw new Error("PSP room verification is available in the Android APK only.");
      setStatus("Checking the local PSP file fingerprint…");
      const fingerprint = await MoudieEmulatorModule.fingerprintNativeGame("psp", asset.uri, asset.name);
      setGame({ name: asset.name, uri: asset.uri, fingerprint });
      setGameReady(false); setStartRequested(false);
      setStatus("File verified. Tap READY after the other player selects the same file."); haptic.success();
    } catch (error) { haptic.error(); Alert.alert("Could not choose PSP game", error instanceof Error ? error.message : "Try again."); setStatus("Choose a supported legal PSP file from this device."); }
    finally { setPicking(false); }
  };

  const markGameReady = async () => {
    if (!game || !credential || !roomConnected || !assignedPlayer) return;
    try {
      await setRealtimeRoomReady({ roomId: numericRoomId, memberId: credential.memberId, memberToken: credential.memberToken, isReady: true, fingerprint: game.fingerprint, coreVersion: PSP_NETPLAY_CORE_VERSION });
      socketRef.current?.emit("netplay:session-ready", { system: "psp", fingerprint: game.fingerprint, coreVersion: PSP_NETPLAY_CORE_VERSION });
      setGameReady(true); setStatus("READY confirmed. The host can start when both players use the same file."); haptic.success();
    } catch (error) { Alert.alert("Could not mark ready", error instanceof Error ? error.message : "Try again."); }
  };

  const requestSynchronizedStart = () => {
    if (!gameReady || assignedPlayer !== 1 || !remoteOnline) return;
    socketRef.current?.emit("netplay:session-start-request", { system: "psp" });
    setStartRequested(true); setStatus("Checking both PSP files and the core before the shared start…");
  };

  const launchGame = async (withNetplay = false, settingsMode = false) => {
    if (!game) return;
    if (Platform.OS === "web") { Alert.alert("Android APK required", "The native PSP player is available in the Android APK only."); return; }
    try {
      setLaunching(true);
      const netplay = withNetplay && credential && assignedPlayer ? { serverUrl: getNetplayServiceUrl(), roomId: numericRoomId, memberId: credential.memberId, memberToken: credential.memberToken, system: "psp" as const, fingerprint: game.fingerprint, coreVersion: PSP_NETPLAY_CORE_VERSION, player: assignedPlayer } : undefined;
      if (withNetplay && !netplay) throw new Error("PSP NetPlay needs exactly two ready players with the same game file.");
      await MoudieEmulatorModule.launchNativeGame("psp", game.uri, game.name, { ...playerOptions, settingsMode }, netplay);
    } catch (error) { haptic.error(); const message = error instanceof Error ? error.message : "Try again."; Alert.alert("Could not start PSP", message); setStatus(message); }
    finally { setLaunching(false); }
  };

  const host = snapshotQuery.data?.members.find((member) => member.id === credential?.memberId)?.role === "host";
  const canStart = Boolean(gameReady && assignedPlayer === 1 && remoteOnline && roomConnected && !startRequested);
  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}><Pressable onPress={() => router.replace({ pathname: "/room/[roomId]", params: { roomId: String(roomId ?? "") } })}><Text style={styles.back}>‹ BACK TO ROOM</Text></Pressable><Text style={styles.chip}>PSP ROOM</Text></View>
        <Text style={styles.eyebrow}>PPSSPP CORE · ROOM NETPLAY</Text><Text style={styles.title}>PlayStation Portable</Text>
        <Text style={styles.subtitle}>Each player selects the same legal local PSP file. The room verifies its fingerprint without uploading the game.</Text>
        <View style={styles.preview}><Text style={styles.previewMark}>PSP</Text><Text style={styles.gameName}>{game?.name || "NO GAME SELECTED"}</Text><Text style={styles.previewText}>{assignedPlayer ? `PLAYER ${assignedPlayer} · ${roomConnected ? "ROOM CONNECTED" : "CONNECTING"}` : "SPECTATOR OR WAITING FOR A PLAYER SLOT"}</Text></View>
        <Pressable onPress={pickGame} disabled={picking || launching} style={({ pressed }) => [styles.primary, (pressed || picking || launching) && styles.disabled]}>{picking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{game ? "CHANGE PSP GAME" : "1. CHOOSE PSP GAME"}</Text>}</Pressable>
        <View style={styles.settings}><Text style={styles.settingsTitle}>EMULATOR SETTINGS</Text><Text style={styles.settingsLabel}>PLAY ORIENTATION</Text><View style={styles.settingsRow}>{(["portrait", "landscape"] as const).map((value) => <Pressable key={value} onPress={() => setOrientation(value)} style={[styles.settingOption, orientation === value && styles.settingActive]}><Text style={styles.settingText}>{value.toUpperCase()}</Text></Pressable>)}</View><Text style={styles.settingsLabel}>SCREEN RATIO</Text><View style={styles.settingsRow}>{(["fit", "4:3", "16:9"] as const).map((value) => <Pressable key={value} onPress={() => setAspectRatio(value)} style={[styles.settingOption, aspectRatio === value && styles.settingActive]}><Text style={styles.settingText}>{value === "fit" ? "FIT" : value}</Text></Pressable>)}</View><Text style={styles.settingsHint}>Configure a separate portrait and landscape layout before playing. Edit and resize controls never appear during the match.</Text>{game && <Pressable onPress={() => launchGame(false, true)} disabled={launching || picking} style={({ pressed }) => [styles.configure, (pressed || launching || picking) && styles.disabled]}><Text style={styles.configureText}>CONFIGURE {orientation.toUpperCase()} CONTROLS</Text></Pressable>}</View>
        <View style={styles.statusCard}><Text style={styles.statusTitle}>NETPLAY STATUS</Text><Text style={styles.statusText}>{status}</Text></View>
        {game && roomConnected && assignedPlayer && <Pressable onPress={markGameReady} disabled={gameReady || launching} style={({ pressed }) => [styles.readyButton, (pressed || gameReady || launching) && styles.disabled]}><Text style={styles.readyText}>{gameReady ? "READY CONFIRMED" : "2. READY"}</Text></Pressable>}
        {canStart && <Pressable onPress={requestSynchronizedStart} style={({ pressed }) => [styles.launch, pressed && styles.disabled]}><Text style={styles.launchText}>3. START SYNCHRONIZED PSP SESSION</Text></Pressable>}
        {startRequested && <Text style={styles.wait}>WAITING FOR THE OTHER PLAYER TO VERIFY THE SAME FILE…</Text>}
        <View style={styles.note}><Text style={styles.noteTitle}>ROOM CONTROLS</Text><Text style={styles.noteText}>CHAT and MIC stay at the top of the player in landscape. Spectators remain in the room for voice and text chat.</Text></View>
        {Platform.OS !== "web" && <><RoomChat socket={roomConnected ? socketRef.current : null} title="PSP ROOM CHAT" /><RoomVoiceChat socket={roomConnected ? socketRef.current : null} isHost={Boolean(host)} remoteOnline={remoteOnline} memberId={credential?.memberId} members={snapshotQuery.data?.members ?? []} /></>}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 10, paddingBottom: 30 }, topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, back: { color: "#AABDD1", fontSize: 13, fontWeight: "900" }, chip: { color: "#73E8FF", fontSize: 11, fontWeight: "900", backgroundColor: "#123242", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 }, eyebrow: { color: "#66E4FF", fontSize: 11, letterSpacing: 1.2, fontWeight: "900", marginTop: 24 }, title: { color: "#F5F7FF", fontSize: 28, fontWeight: "900", marginTop: 4 }, subtitle: { color: "#B8C4D2", fontSize: 13, lineHeight: 20, marginTop: 8 }, preview: { minHeight: 180, alignItems: "center", justifyContent: "center", borderRadius: 22, borderWidth: 1, borderColor: "#266A85", backgroundColor: "#071721", marginTop: 20, padding: 18 }, previewMark: { color: "#071721", backgroundColor: "#50E4FF", borderRadius: 28, overflow: "hidden", paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, fontWeight: "900" }, gameName: { color: "#F5F7FF", fontSize: 16, fontWeight: "900", marginTop: 16, textAlign: "center" }, previewText: { color: "#9FC1D0", fontSize: 11, marginTop: 6, textAlign: "center" }, primary: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#157898", marginTop: 18 }, primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" }, settings: { marginTop: 16, borderRadius: 17, borderWidth: 1, borderColor: "#2E5873", backgroundColor: "#11293A", padding: 14 }, settingsTitle: { color: "#C7F7FF", fontSize: 12, fontWeight: "900" }, settingsLabel: { color: "#8FC4D6", fontSize: 10, fontWeight: "900", marginTop: 12 }, settingsRow: { flexDirection: "row", gap: 8, marginTop: 7 }, settingOption: { flex: 1, minHeight: 37, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "#35576B", backgroundColor: "#122235" }, settingActive: { borderColor: "#64EBFF", backgroundColor: "#17607A" }, settingText: { color: "#F1FBFF", fontSize: 10, fontWeight: "900" }, settingsHint: { color: "#B8D4DF", fontSize: 10, lineHeight: 16, marginTop: 12 }, configure: { minHeight: 44, marginTop: 12, borderRadius: 12, backgroundColor: "#23516B", alignItems: "center", justifyContent: "center" }, configureText: { color: "#D9F7FF", fontSize: 10, fontWeight: "900" }, statusCard: { marginTop: 16, borderRadius: 16, padding: 13, backgroundColor: "#152438", borderWidth: 1, borderColor: "#2D5774" }, statusTitle: { color: "#74E5FF", fontSize: 10, fontWeight: "900" }, statusText: { color: "#C7DAE3", fontSize: 11, lineHeight: 17, marginTop: 6 }, readyButton: { minHeight: 52, marginTop: 12, borderRadius: 16, backgroundColor: "#45C987", alignItems: "center", justifyContent: "center" }, readyText: { color: "#08281A", fontSize: 12, fontWeight: "900" }, launch: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#72E8FF", marginTop: 10 }, launchText: { color: "#071018", fontSize: 12, fontWeight: "900" }, wait: { color: "#F7D376", fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 13 }, disabled: { opacity: .55 }, note: { backgroundColor: "#162235", borderColor: "#2E5873", borderWidth: 1, borderRadius: 17, padding: 14, marginTop: 18 }, noteTitle: { color: "#77E9FF", fontSize: 12, fontWeight: "900" }, noteText: { color: "#C0D5E0", fontSize: 11, lineHeight: 17, marginTop: 6 },
});
