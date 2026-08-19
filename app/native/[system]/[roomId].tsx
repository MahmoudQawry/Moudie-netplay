import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { RoomChat } from "@/components/room-chat";
import { RoomVoiceChat } from "@/components/room-voice-chat";
import { getNetplayServiceUrl } from "@/constants/oauth";
import { createNetplaySocket } from "@/lib/netplay-socket";
import { setRealtimeRoomReady } from "@/lib/realtime-room-service";
import { getRoomCredential, type RoomCredential } from "@/lib/room-storage";
import { useRealtimeRoomSnapshot } from "@/lib/use-realtime-room-snapshot";
import MoudieEmulatorModule from "@/modules/moudie-emulator/src/MoudieEmulatorModule";
import type { EmulatorSystem } from "@/modules/moudie-emulator/src/MoudieEmulator.types";

type RoomSystem = "sega" | "arcade";
type Game = { name: string; uri: string; fingerprint: string };
type PlayerSeat = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
const isPlayerSeat = (value: unknown): value is PlayerSeat => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8;
const SYSTEM_META: Record<RoomSystem, { title: string; color: string }> = { sega: { title: "Sega Genesis", color: "#70E39B" }, arcade: { title: "Arcade", color: "#FF886D" } };

export default function NativeRoomScreen() {
  const { roomId, system: rawSystem } = useLocalSearchParams<{ roomId: string; system: string }>();
  const system: RoomSystem = rawSystem === "arcade" ? "arcade" : "sega";
  const meta = SYSTEM_META[system];
  const numericRoomId = Number(roomId);
  const [credential, setCredential] = useState<RoomCredential | null | undefined>(undefined);
  const [game, setGame] = useState<Game | null>(null);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  const [aspectRatio, setAspectRatio] = useState<"fit" | "4:3" | "16:9">("4:3");
  const [connected, setConnected] = useState(false);
  const [remoteOnline, setRemoteOnline] = useState(false);
  const [assignedPlayer, setAssignedPlayer] = useState<PlayerSeat | null>(null);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [preparingCore, setPreparingCore] = useState(false);
  const [status, setStatus] = useState("Choose the same local file on both devices.");
  const socketRef = useRef<ReturnType<typeof createNetplaySocket> | null>(null);
  const launchRef = useRef<(netplay?: boolean, settingsMode?: boolean, synchronizedStart?: boolean) => Promise<void>>(async () => undefined);
  const catalog = useMemo(() => MoudieEmulatorModule.getCoreCatalog().find((entry) => entry.system === system), [system]);
  const snapshotQuery = useRealtimeRoomSnapshot(numericRoomId, credential, 4_000);
  const coreVersion = `moudie-${system}-libretro-lockstep-v1`;

  useEffect(() => { if (Number.isFinite(numericRoomId)) getRoomCredential(numericRoomId).then(setCredential); }, [numericRoomId]);
  useEffect(() => {
    if (!credential || Platform.OS === "web") return;
    const socket = createNetplaySocket({ roomId: numericRoomId, memberId: credential.memberId, memberToken: credential.memberToken });
    socketRef.current = socket;
    const joined = (payload: { onlineMemberIds?: number[]; assignedPlayer?: number }) => { setConnected(true); setRemoteOnline(Boolean(payload.onlineMemberIds?.some((id) => id !== credential.memberId))); setAssignedPlayer(isPlayerSeat(payload.assignedPlayer) ? payload.assignedPlayer : null); };
    const disconnected = () => { setConnected(false); setRemoteOnline(false); setStatus("Room channel disconnected. Reconnecting automatically…"); };
    const presence = (payload: { memberId?: number; online?: boolean }) => { if (payload.memberId !== credential.memberId) setRemoteOnline(Boolean(payload.online)); };
    const start = (payload: { system?: string }) => { if (payload.system === system) void launchRef.current(true, false, true); };
    socket.on("connect", () => setConnected(true)); socket.on("disconnect", disconnected); socket.on("netplay:joined", joined); socket.on("netplay:presence", presence); socket.on("netplay:session-start", start); socket.on("netplay:session-start-refused", (payload: { message?: string }) => setStatus(payload.message || "Waiting for the other player.")); socket.connect();
    return () => { socket.disconnect(); if (socketRef.current === socket) socketRef.current = null; };
  }, [credential, game, numericRoomId, system]);

  const chooseGame = async () => {
    try {
      setPicking(true);
      if (!catalog || (!catalog.available && !catalog.downloadable)) throw new Error(catalog?.message || "This Android core is not ready.");
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri || !asset.name) throw new Error("Could not read the selected file.");
      const extension = asset.name.split(".").pop()?.toLowerCase() || "";
      if (!catalog.acceptedExtensions.includes(extension)) throw new Error(`Choose a supported ${meta.title} file: ${catalog.acceptedExtensions.map((value) => `.${value}`).join(", ")}`);
      if (Platform.OS === "web") throw new Error("Room verification is available in the Android APK only.");
      setStatus("Checking the local game fingerprint…");
      const fingerprint = await MoudieEmulatorModule.fingerprintNativeGame(system as EmulatorSystem, asset.uri, asset.name);
      setStatus("Preparing the emulator core and local file now for a fast synchronized start…");
      await MoudieEmulatorModule.prepareFastLaunch(system as EmulatorSystem, asset.uri, asset.name);
      setGame({ name: asset.name, uri: asset.uri, fingerprint }); setReady(false);
      setStatus("File, core, and local launch cache are ready. Tap READY after every active player chooses the same file.");
    } catch (error) { const message = error instanceof Error ? error.message : "Try again."; Alert.alert("Could not choose game", message); setStatus(message); }
    finally { setPicking(false); }
  };

  const prepareArcadeCore = async () => {
    try {
      setPreparingCore(true);
      const result = await MoudieEmulatorModule.prepareNativeCore("arcade");
      setStatus(result.message);
      Alert.alert("Arcade core ready", result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Check internet access and storage, then try again.";
      setStatus(message);
      Alert.alert("Could not install Arcade", message);
    } finally {
      setPreparingCore(false);
    }
  };

  const markReady = async () => {
    if (!credential || !game || !assignedPlayer || !connected) return;
    try {
      await setRealtimeRoomReady({ roomId: numericRoomId, memberId: credential.memberId, memberToken: credential.memberToken, isReady: true, fingerprint: game.fingerprint, coreVersion });
      socketRef.current?.emit("netplay:session-ready", { system, fingerprint: game.fingerprint, coreVersion }); setReady(true); setStatus("READY confirmed. The host starts once all active players verify the same file.");
    } catch (error) { Alert.alert("Could not mark ready", error instanceof Error ? error.message : "Try again."); }
  };

  const requestStart = () => { socketRef.current?.emit("netplay:session-start-request", { system }); setStarting(true); setStatus("Checking every active player's file and matching core before synchronized start…"); };
  const launch = async (netplay = false, settingsMode = false, synchronizedStart = false) => {
    if (!game || Platform.OS === "web") return;
    try {
      const session = netplay && credential && assignedPlayer && (synchronizedStart || connected) ? { serverUrl: getNetplayServiceUrl(), roomId: numericRoomId, memberId: credential.memberId, memberToken: credential.memberToken, system, fingerprint: game.fingerprint, coreVersion, player: assignedPlayer } : undefined;
      if (netplay && !session) throw new Error("This room needs an assigned player seat and a verified multiplayer session.");
      await MoudieEmulatorModule.launchNativeGame(system as EmulatorSystem, game.uri, game.name, { orientation, aspectRatio, settingsMode }, session);
    } catch (error) { const message = error instanceof Error ? error.message : "Try again."; Alert.alert(`Could not start ${meta.title}`, message); setStatus(message); }
  };
  launchRef.current = launch;

  const host = snapshotQuery.data?.members.find((member) => member.id === credential?.memberId)?.role === "host";
  const canStart = Boolean(ready && assignedPlayer === 1 && remoteOnline && connected && !starting);
  return <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.top}><Pressable onPress={() => router.replace({ pathname: "/room/[roomId]", params: { roomId: String(roomId) } })}><Text style={styles.back}>‹ BACK TO ROOM</Text></Pressable><Text style={[styles.chip, { color: meta.color }]}>{system.toUpperCase()} ROOM</Text></View>
    <Text style={[styles.eyebrow, { color: meta.color }]}>{catalog?.coreName || "CHECKING CORE"}</Text><Text style={styles.title}>{meta.title}</Text><Text style={styles.copy}>Select the identical local game file on two devices. Moudie checks a fingerprint, synchronizes the start state, then relays only control inputs and state updates.</Text>
    <View style={styles.card}><Text style={styles.file}>{game?.name || "NO GAME SELECTED"}</Text><Text style={styles.fileInfo}>{assignedPlayer ? `PLAYER ${assignedPlayer}` : "SPECTATOR / NO ACTIVE PLAYER SLOT"}</Text></View>
    {system === "arcade" && catalog?.downloadable && !catalog.available && <Pressable onPress={prepareArcadeCore} disabled={preparingCore} style={({ pressed }) => [styles.arcadeCore, (pressed || preparingCore) && styles.disabled]}>{preparingCore ? <ActivityIndicator color="#071018" /> : <Text style={styles.arcadeCoreText}>INSTALL MAME ARCADE CORE</Text>}</Pressable>}
    <Pressable onPress={chooseGame} disabled={picking} style={({ pressed }) => [styles.primary, { backgroundColor: meta.color }, (pressed || picking) && styles.disabled]}>{picking ? <ActivityIndicator color="#071018" /> : <Text style={styles.primaryText}>{game ? "CHANGE GAME FILE" : "1. CHOOSE GAME FILE"}</Text>}</Pressable>
    <View style={styles.settings}><Text style={styles.settingsTitle}>EMULATOR SETTINGS</Text><Text style={styles.label}>PLAY ORIENTATION</Text><View style={styles.row}>{(["portrait", "landscape"] as const).map((value) => <Pressable key={value} onPress={() => setOrientation(value)} style={[styles.option, orientation === value && { borderColor: meta.color }]}><Text style={styles.optionText}>{value.toUpperCase()}</Text></Pressable>)}</View><Text style={styles.label}>SCREEN RATIO</Text><View style={styles.row}>{(["fit", "4:3", "16:9"] as const).map((value) => <Pressable key={value} onPress={() => setAspectRatio(value)} style={[styles.option, aspectRatio === value && { borderColor: meta.color }]}><Text style={styles.optionText}>{value === "fit" ? "FIT" : value}</Text></Pressable>)}</View>{game && <Pressable onPress={() => launch(false, true)} style={styles.configure}><Text style={styles.configureText}>CONFIGURE {orientation.toUpperCase()} CONTROLS</Text></Pressable>}</View>
    <View style={styles.status}><Text style={styles.statusTitle}>NETPLAY STATUS</Text><Text style={styles.statusText}>{status}</Text></View>
    {game && connected && assignedPlayer && <Pressable onPress={markReady} disabled={ready} style={({ pressed }) => [styles.ready, (pressed || ready) && styles.disabled]}><Text style={styles.readyText}>{ready ? "READY CONFIRMED" : "2. READY"}</Text></Pressable>}
    {canStart && <Pressable onPress={requestStart} style={({ pressed }) => [styles.start, pressed && styles.disabled]}><Text style={styles.startText}>3. START SYNCHRONIZED SESSION</Text></Pressable>}
    {Platform.OS !== "web" && <><RoomChat socket={connected ? socketRef.current : null} title={`${meta.title.toUpperCase()} ROOM CHAT`} /><RoomVoiceChat socket={connected ? socketRef.current : null} isHost={Boolean(host)} remoteOnline={remoteOnline} memberId={credential?.memberId} members={snapshotQuery.data?.members ?? []} /></>}
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { paddingVertical: 10, paddingBottom: 30 }, top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, back: { color: "#B2C9DD", fontSize: 13, fontWeight: "900" }, chip: { fontSize: 11, fontWeight: "900", backgroundColor: "#14273A", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 }, eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.1, marginTop: 22 }, title: { color: "#F4F8FD", fontSize: 28, fontWeight: "900", marginTop: 4 }, copy: { color: "#B6C6D7", fontSize: 12, lineHeight: 19, marginTop: 8 }, card: { minHeight: 120, marginTop: 19, borderRadius: 20, backgroundColor: "#0D1C2B", borderColor: "#284A67", borderWidth: 1, alignItems: "center", justifyContent: "center", padding: 16 }, file: { color: "#F4F8FD", fontSize: 15, fontWeight: "900", textAlign: "center" }, fileInfo: { color: "#94B9D0", fontSize: 10, marginTop: 7 }, arcadeCore: { minHeight: 50, marginTop: 14, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#FF8364" }, arcadeCoreText: { color: "#071018", fontSize: 11, fontWeight: "900" }, primary: { minHeight: 53, borderRadius: 16, marginTop: 14, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#071018", fontSize: 12, fontWeight: "900" }, settings: { marginTop: 15, borderRadius: 17, borderColor: "#294C69", borderWidth: 1, backgroundColor: "#102337", padding: 14 }, settingsTitle: { color: "#DDF5FF", fontSize: 12, fontWeight: "900" }, label: { color: "#94BDD5", fontSize: 10, fontWeight: "900", marginTop: 12 }, row: { flexDirection: "row", gap: 8, marginTop: 7 }, option: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "#39566D", backgroundColor: "#14293A" }, optionText: { color: "#EFF8FD", fontSize: 10, fontWeight: "900" }, configure: { minHeight: 44, marginTop: 13, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#224A64" }, configureText: { color: "#DCF7FF", fontSize: 10, fontWeight: "900" }, status: { marginTop: 15, borderRadius: 16, backgroundColor: "#14263A", borderColor: "#2C5371", borderWidth: 1, padding: 13 }, statusTitle: { color: "#7BE8FF", fontSize: 10, fontWeight: "900" }, statusText: { color: "#C8D8E4", fontSize: 11, lineHeight: 17, marginTop: 6 }, ready: { minHeight: 52, marginTop: 11, borderRadius: 16, backgroundColor: "#4BD08E", alignItems: "center", justifyContent: "center" }, readyText: { color: "#08291A", fontSize: 12, fontWeight: "900" }, start: { minHeight: 54, marginTop: 10, borderRadius: 16, backgroundColor: "#73E9FF", alignItems: "center", justifyContent: "center" }, startText: { color: "#071018", fontSize: 12, fontWeight: "900" }, disabled: { opacity: .55 } });
