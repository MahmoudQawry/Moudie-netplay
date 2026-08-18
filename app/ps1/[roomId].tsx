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

// Android's single-file picker cannot guarantee that a CUE's companion BIN remains beside it.
// Accept self-contained formats so the native player receives a complete game image.
const SUPPORTED_EXTENSIONS = [".bin", ".iso", ".chd", ".pbp"] as const;
const PS1_NETPLAY_CORE_VERSION = "pcsx-rearmed-0.13.2-lockstep-v1";
type BiosStatus = Record<string, { required: boolean; available: boolean; files?: string[]; message: string }>;
type RoomVoiceChatHandle = { setMicrophoneEnabled: (enabled: boolean) => Promise<void> };

function isPs1GameFile(name: string) {
  const normalized = name.trim().toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export default function PS1Screen() {
  const { roomId, orientation, aspectRatio } = useLocalSearchParams<{ roomId: string; orientation?: string; aspectRatio?: string }>();
  const numericRoomId = Number(roomId);
  const [playerOrientation, setPlayerOrientation] = useState<"portrait" | "landscape">(orientation === "portrait" ? "portrait" : "landscape");
  const [playerAspect, setPlayerAspect] = useState<"fit" | "4:3" | "16:9">(aspectRatio === "fit" || aspectRatio === "4:3" || aspectRatio === "16:9" ? aspectRatio : "4:3");
  const playerOptions = { orientation: playerOrientation, aspectRatio: playerAspect };
  const [credential, setCredential] = useState<RoomCredential | null | undefined>(undefined);
  const socketRef = useRef<ReturnType<typeof createNetplaySocket> | null>(null);
  const launchGameRef = useRef<(withNetplay?: boolean, settingsMode?: boolean, synchronizedStart?: boolean) => Promise<void>>(async () => undefined);
  const voiceChatRef = useRef<RoomVoiceChatHandle | null>(null);
  const [roomConnected, setRoomConnected] = useState(false);
  const [remoteOnline, setRemoteOnline] = useState(false);
  const [game, setGame] = useState<{ name: string; uri: string; fingerprint: string } | null>(null);
  const [gameReady, setGameReady] = useState(false);
  const [startRequested, setStartRequested] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isInstallingBios, setIsInstallingBios] = useState(false);
  const [biosStatus, setBiosStatus] = useState<BiosStatus | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<{ available: boolean; message: string } | null>(null);
  const [status, setStatus] = useState("Choose a PS1 game file from your device. The file stays local and is never uploaded.");
  const snapshotQuery = useRealtimeRoomSnapshot(numericRoomId, credential);
  const membership = snapshotQuery.data?.members.find((member) => member.id === credential?.memberId);
  const activeMembers = (snapshotQuery.data?.members ?? []).filter((member) => member.role !== "spectator").sort((left, right) => left.role === "host" ? -1 : right.role === "host" ? 1 : left.id - right.id);
  const assignedPlayer = membership?.role === "spectator" ? null : (activeMembers.findIndex((member) => member.id === credential?.memberId) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  const matchingPlayers = game ? activeMembers.filter((member) => member.isReady && member.gameFingerprint === game.fingerprint && member.coreVersion === PS1_NETPLAY_CORE_VERSION) : [];
  const ps1NetplayReady = Boolean(game && credential && activeMembers.length >= 2 && matchingPlayers.length === activeMembers.length);

  const refreshBiosStatus = () => {
    if (Platform.OS === "web") return;
    setBiosStatus(MoudieEmulatorModule.getBiosStatus());
    setRuntimeStatus(MoudieEmulatorModule.getPs1LaunchStatus());
  };

  useEffect(() => {
    refreshBiosStatus();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = MoudieEmulatorModule.addListener("nativeOverlayAction", (payload) => {
      if (payload.action === "toggle-microphone") voiceChatRef.current?.setMicrophoneEnabled(!payload.muted);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Number.isFinite(numericRoomId)) getRoomCredential(numericRoomId).then(setCredential);
  }, [numericRoomId]);

  useEffect(() => {
    if (!credential || Platform.OS === "web") return;
    const socket = createNetplaySocket({ roomId: numericRoomId, memberId: credential.memberId, memberToken: credential.memberToken });
    socketRef.current = socket;
    const connected = () => setRoomConnected(true);
    const disconnected = () => { setRoomConnected(false); setRemoteOnline(false); };
    const joined = (payload: { onlineMemberIds?: number[] }) => setRemoteOnline(Boolean(payload.onlineMemberIds?.some((id) => id !== credential.memberId)));
    const presence = (payload: { memberId?: number; online?: boolean }) => {
      if (payload.memberId !== credential.memberId) setRemoteOnline(Boolean(payload.online));
    };
    const start = (payload: { system?: string }) => {
      if (payload.system !== "ps1") return;
      setStatus("All active players are ready. Opening the PS1 player at the shared start time…");
      void launchGameRef.current(true, false, true);
    };
    socket.on("connect", connected);
    socket.on("disconnect", disconnected);
    socket.on("netplay:joined", joined);
    socket.on("netplay:presence", presence);
    socket.on("netplay:session-start", start);
    socket.connect();
    return () => {
      socket.off("connect", connected);
      socket.off("disconnect", disconnected);
      socket.off("netplay:joined", joined);
      socket.off("netplay:presence", presence);
      socket.off("netplay:session-start", start);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [credential, game, numericRoomId]);

  const pickGame = async () => {
    try {
      setIsPicking(true);
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, base64: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!isPs1GameFile(asset.name)) {
        haptic.error();
        Alert.alert("Unsupported file", "Choose a complete PS1 .bin, .iso, .chd, or .pbp file. A CUE file is not selected here because it needs its companion BIN file.");
        return;
      }
      if (Platform.OS === "web") throw new Error("PS1 game verification and room preparation are available in the Android APK only.");
      setStatus("Checking the local PS1 game fingerprint to verify that the other player selected the same file…");
      const fingerprint = await MoudieEmulatorModule.fingerprintPS1Game(asset.uri, asset.name);
      setGame({ name: asset.name, uri: asset.uri, fingerprint });
      setGameReady(false);
      setStartRequested(false);
      setStatus("The file and its fingerprint are ready. Tap READY after all active players select the same file.");
      haptic.success();
    } catch (error) {
      haptic.error();
      Alert.alert("Could not choose the file", error instanceof Error ? error.message : "Try again and choose a game file from storage.");
    } finally {
      setIsPicking(false);
    }
  };

  const markGameReady = async () => {
    if (!game || !credential || !roomConnected) return;
    try {
      await setRealtimeRoomReady({
        roomId: numericRoomId,
        memberId: credential.memberId,
        memberToken: credential.memberToken,
        isReady: true,
        fingerprint: game.fingerprint,
        coreVersion: PS1_NETPLAY_CORE_VERSION,
      });
      socketRef.current?.emit("netplay:session-ready", { system: "ps1", fingerprint: game.fingerprint, coreVersion: PS1_NETPLAY_CORE_VERSION });
      setGameReady(true);
      setStatus("Your game is marked ready. Wait for all active players, then the host can start the session.");
      haptic.success();
    } catch (error) {
      haptic.error();
      Alert.alert("Could not mark ready", error instanceof Error ? error.message : "Try again.");
    }
  };

  const requestSynchronizedStart = () => {
    if (!gameReady || assignedPlayer !== 1 || !ps1NetplayReady) return;
    socketRef.current?.emit("netplay:session-start-request", { system: "ps1" });
    setStartRequested(true);
    setStatus("Checking every active player's game file and core before sending the start signal…");
  };

  const launchGame = async (withNetplay = false, settingsMode = false, synchronizedStart = false) => {
    if (!game) return;
    if (Platform.OS === "web") {
      Alert.alert("Android APK required", "The native PS1 player runs in the Android APK and is not available in the web preview.");
      return;
    }
    try {
      setIsLaunching(true);
      const netplay = withNetplay && credential && assignedPlayer && game.fingerprint && (synchronizedStart || ps1NetplayReady) ? {
        serverUrl: getNetplayServiceUrl(),
        roomId: numericRoomId,
        memberId: credential.memberId,
        memberToken: credential.memberToken,
        fingerprint: game.fingerprint,
        player: assignedPlayer,
      } : undefined;
      if (withNetplay && !netplay) throw new Error("PS1 NetPlay requires every active player (2–8) to select the same complete game file and core.");
      setStatus(netplay ? "Preparing PS1 NetPlay and assigning this device inside the room…" : "Preparing the game file and opening PCSX-ReARMed…");
      await MoudieEmulatorModule.launchPS1Game(game.uri, game.name, netplay, { ...playerOptions, settingsMode });
      setStatus(netplay ? "The PS1 player is open and linked to the room. Wait for the in-game verification message." : "The local player is open. Returning from the game brings you back to this room.");
    } catch (error) {
      haptic.error();
      const message = error instanceof Error ? error.message : "Could not start the PS1 player.";
      setStatus(message);
      Alert.alert("Could not start the game", message);
    } finally {
      setIsLaunching(false);
    }
  };
  launchGameRef.current = launchGame;

  const pickBios = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Android APK required", "Local BIOS checking and installation are available in the Android APK only.");
      return;
    }
    try {
      setIsInstallingBios(true);
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, base64: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      const nextStatus = await MoudieEmulatorModule.installPS1Bios(asset.uri, asset.name);
      setBiosStatus(nextStatus);
      haptic.success();
      Alert.alert("BIOS added", "The BIOS file was stored locally in the app. It is never uploaded or shared.");
    } catch (error) {
      haptic.error();
      Alert.alert("Could not add BIOS", error instanceof Error ? error.message : "Choose a legal dump with a supported name.");
    } finally {
      setIsInstallingBios(false);
    }
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.replace({ pathname: "/room/[roomId]", params: { roomId: String(roomId ?? "") } })} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Text style={styles.backText}>‹ BACK TO ROOM</Text>
          </Pressable>
          <Text style={styles.chip}>PS1 · BETA</Text>
        </View>

        <Text style={styles.eyebrow}>PCSX REARMED</Text>
        <Text style={styles.title}>PlayStation 1 Player</Text>
        <Text style={styles.subtitle}>Local play inside Moudie NetPlay. The app does not include games or BIOS files; use only files you are legally entitled to use.</Text>

        <View style={styles.preview}>
          <Text style={styles.previewMark}>PS</Text>
          <Text style={styles.previewTitle}>{game ? game.name : "NO GAME SELECTED"}</Text>
          <Text style={styles.previewText}>{game ? "Ready for the native player" : "Supports BIN, ISO, CHD, and PBP"}</Text>
        </View>

        <Pressable onPress={pickGame} disabled={isPicking || isLaunching} style={({ pressed }) => [styles.primaryButton, (pressed || isPicking || isLaunching) && styles.pressed]}>
          {isPicking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{game ? "CHANGE PS1 GAME FILE" : "1. CHOOSE PS1 GAME FILE"}</Text>}
        </Pressable>

        {game && <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>SCREEN & CONTROLLER SETTINGS</Text>
          <Text style={styles.statusText}>Choose the layout first, then open controller calibration. Each direction, action button, chat, microphone, and screen profile is saved separately for portrait and landscape.</Text>
          <View style={styles.settingRow}>{(["portrait", "landscape"] as const).map((value) => <Pressable key={value} onPress={() => setPlayerOrientation(value)} style={[styles.settingOption, playerOrientation === value && styles.settingOptionActive]}><Text style={styles.settingText}>{value.toUpperCase()}</Text></Pressable>)}</View>
          <View style={styles.settingRow}>{(["fit", "4:3", "16:9"] as const).map((value) => <Pressable key={value} onPress={() => setPlayerAspect(value)} style={[styles.settingOption, playerAspect === value && styles.settingOptionActive]}><Text style={styles.settingText}>{value === "fit" ? "FIT" : value}</Text></Pressable>)}</View>
          <Pressable onPress={() => launchGame(false, true)} disabled={isLaunching || isPicking} style={({ pressed }) => [styles.netplayButton, (pressed || isLaunching || isPicking) && styles.netplayDisabled]}><Text style={styles.launchText}>CONFIGURE CONTROLS & SCREEN</Text></Pressable>
        </View>}

        {game && (
          <Pressable onPress={() => launchGame(false)} disabled={isLaunching || isPicking || runtimeStatus?.available === false} style={({ pressed }) => [styles.launchButton, (pressed || isLaunching || isPicking || runtimeStatus?.available === false) && styles.pressed]}>
            {isLaunching ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.launchText}>OPEN LOCAL PS1 PLAYER</Text>}
          </Pressable>
        )}

        {game && <View style={styles.netplayCard}>
          <Text style={styles.statusTitle}>PS1 NetPlay</Text>
          <Text style={styles.statusText}>{ps1NetplayReady ? `Every active player selected the same game. You are Player ${assignedPlayer}.` : `Waiting for READY and a matching file (${matchingPlayers.length}/${activeMembers.length} ready).`}</Text>
          <Pressable onPress={markGameReady} disabled={gameReady || isLaunching || isPicking || !roomConnected} style={({ pressed }) => [styles.netplayButton, (gameReady || pressed || isLaunching || isPicking || !roomConnected) && styles.netplayDisabled]}>
            <Text style={styles.launchText}>{gameReady ? "READY CONFIRMED" : "2. READY"}</Text>
          </Pressable>
          <Pressable onPress={requestSynchronizedStart} disabled={!gameReady || !ps1NetplayReady || assignedPlayer !== 1 || startRequested || isLaunching} style={({ pressed }) => [styles.netplayButton, (!gameReady || !ps1NetplayReady || assignedPlayer !== 1 || startRequested || pressed || isLaunching) && styles.netplayDisabled]}>
            {isLaunching ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.launchText}>{assignedPlayer === 1 ? (startRequested ? "CONFIRMING START…" : "3. START PS1 FOR EVERYONE") : "WAITING FOR HOST TO START"}</Text>}
          </Pressable>
        </View>}

        {Platform.OS !== "web" && <>
          <RoomChat socket={roomConnected ? socketRef.current : null} title="PS1 ROOM CHAT" />
          <RoomVoiceChat ref={voiceChatRef} socket={roomConnected ? socketRef.current : null} isHost={assignedPlayer === 1} remoteOnline={remoteOnline} />
        </>}

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>PS1 PLAYER STATUS</Text>
          <Text style={styles.statusText}>{status}</Text>
          <Text style={styles.statusText}>{runtimeStatus?.message ?? "Checking the local core…"}</Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>BIOS STATUS</Text>
          <Text style={styles.statusText}>{biosStatus?.ps1.message ?? "Checking local BIOS…"}</Text>
          {!biosStatus?.ps1.available && <Text style={styles.biosWarning}>Some games may start with HLE, but a compatible local BIOS improves PCSX-ReARMed compatibility and helps diagnose games that fail to start.</Text>}
          <Pressable onPress={pickBios} disabled={isInstallingBios || isLaunching} style={({ pressed }) => [styles.primaryButton, (pressed || isInstallingBios || isLaunching) && styles.pressed]}>
            {isInstallingBios ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>ADD LEGAL LOCAL BIOS</Text>}
          </Pressable>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>CURRENT BETA LIMIT</Text>
          <Text style={styles.noteText}>PS1 NetPlay starts only when every active player in the room uses a file with the same fingerprint. The game is never uploaded; the room transports controller input and a small initial state only.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 10, paddingBottom: 28 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  back: { paddingVertical: 8 },
  backText: { color: "#9BAFC4", fontSize: 15, fontWeight: "800" },
  chip: { color: "#F4C662", backgroundColor: "#2B2920", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, fontSize: 11, fontWeight: "900" },
  eyebrow: { color: "#62C2EB", fontSize: 12, fontWeight: "900", letterSpacing: 1.1, textAlign: "right", marginTop: 23 },
  title: { color: "#F3F7FB", fontSize: 29, lineHeight: 38, fontWeight: "900", textAlign: "right", marginTop: 4 },
  subtitle: { color: "#9BAFC4", fontSize: 14, lineHeight: 21, textAlign: "right", marginTop: 8 },
  preview: { minHeight: 210, backgroundColor: "#070C15", borderWidth: 1, borderColor: "#31465F", borderRadius: 20, alignItems: "center", justifyContent: "center", padding: 22, marginTop: 22 },
  previewMark: { width: 66, height: 66, borderRadius: 33, textAlign: "center", textAlignVertical: "center", color: "#D8F4FF", backgroundColor: "#13415A", borderWidth: 1, borderColor: "#37799B", fontSize: 25, fontWeight: "900" },
  previewTitle: { color: "#F3F7FB", fontSize: 16, fontWeight: "900", textAlign: "center", marginTop: 13 },
  previewText: { color: "#8FA9C0", fontSize: 12, textAlign: "center", marginTop: 5 },
  primaryButton: { minHeight: 53, borderRadius: 16, backgroundColor: "#146C94", justifyContent: "center", alignItems: "center", marginTop: 15 },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  launchButton: { minHeight: 53, borderRadius: 16, backgroundColor: "#F26B5B", justifyContent: "center", alignItems: "center", marginTop: 10 },
  launchText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  netplayCard: { backgroundColor: "#102A34", borderWidth: 1, borderColor: "#2E7890", borderRadius: 16, padding: 15, marginTop: 18 },
  netplayButton: { minHeight: 49, borderRadius: 14, backgroundColor: "#247F9E", justifyContent: "center", alignItems: "center", marginTop: 12 },
  netplayDisabled: { opacity: 0.45 },
  settingRow: { flexDirection: "row", gap: 8, marginTop: 11 },
  settingOption: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "#39566D", backgroundColor: "#14293A" },
  settingOptionActive: { borderColor: "#62C2EB", backgroundColor: "#14516B" },
  settingText: { color: "#EFF8FD", fontSize: 10, fontWeight: "900" },
  statusCard: { backgroundColor: "#162235", borderColor: "#29415B", borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 18 },
  statusTitle: { color: "#F4C662", fontSize: 13, fontWeight: "900", textAlign: "right" },
  statusText: { color: "#D5E1EB", fontSize: 13, lineHeight: 20, textAlign: "right", marginTop: 5 },
  noteCard: { backgroundColor: "#2A2221", borderLeftWidth: 3, borderLeftColor: "#F4B942", borderRadius: 15, padding: 14, marginTop: 15 },
  noteTitle: { color: "#F4C662", fontSize: 13, fontWeight: "900", textAlign: "right" },
  noteText: { color: "#D5C5BD", fontSize: 12, lineHeight: 19, textAlign: "right", marginTop: 4 },
  biosWarning: { color: "#F4C662", fontSize: 12, lineHeight: 18, textAlign: "right", marginTop: 10 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
