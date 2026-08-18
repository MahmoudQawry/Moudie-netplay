import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { RoomChat } from "@/components/room-chat";
import { RoomVoiceChat } from "@/components/room-voice-chat";
import { haptic } from "@/lib/haptics";
import { createNetplaySocket } from "@/lib/netplay-socket";
import { getRoomCredential, type RoomCredential } from "@/lib/room-storage";
import { trpc } from "@/lib/trpc";
import MoudieEmulatorModule from "@/modules/moudie-emulator/src/MoudieEmulatorModule";

const PSP_EXTENSIONS = [".iso", ".cso", ".chd", ".pbp"];

export default function PSPRoomScreen() {
  const { roomId, orientation, aspectRatio } = useLocalSearchParams<{ roomId: string; orientation?: string; aspectRatio?: string }>();
  const numericRoomId = Number(roomId);
  const playerAspect: "fit" | "4:3" | "16:9" = aspectRatio === "fit" || aspectRatio === "4:3" || aspectRatio === "16:9" ? aspectRatio : "4:3";
  const playerOptions = {
    orientation: orientation === "portrait" ? "portrait" as const : "landscape" as const,
    aspectRatio: playerAspect,
  };
  const [credential, setCredential] = useState<RoomCredential | null | undefined>(undefined);
  const socketRef = useRef<ReturnType<typeof createNetplaySocket> | null>(null);
  const [roomConnected, setRoomConnected] = useState(false);
  const [remoteOnline, setRemoteOnline] = useState(false);
  const [game, setGame] = useState<{ name: string; uri: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [launching, setLaunching] = useState(false);
  const snapshot = trpc.rooms.snapshot.useQuery({ roomId: numericRoomId, memberId: credential?.memberId ?? 0, memberToken: credential?.memberToken ?? "" }, { enabled: Boolean(credential && Number.isFinite(numericRoomId)), refetchInterval: 4000 });

  useEffect(() => { if (Number.isFinite(numericRoomId)) getRoomCredential(numericRoomId).then(setCredential); }, [numericRoomId]);
  useEffect(() => {
    if (!credential || Platform.OS === "web") return;
    const socket = createNetplaySocket({ roomId: numericRoomId, memberId: credential.memberId, memberToken: credential.memberToken });
    socketRef.current = socket;
    const connected = () => setRoomConnected(true);
    const disconnected = () => { setRoomConnected(false); setRemoteOnline(false); };
    const presence = (payload: { memberId?: number; online?: boolean }) => { if (payload.memberId !== credential.memberId) setRemoteOnline(Boolean(payload.online)); };
    socket.on("connect", connected); socket.on("disconnect", disconnected); socket.on("netplay:presence", presence); socket.connect();
    return () => { socket.off("connect", connected); socket.off("disconnect", disconnected); socket.off("netplay:presence", presence); socket.disconnect(); if (socketRef.current === socket) socketRef.current = null; };
  }, [credential, numericRoomId]);

  const pickGame = async () => {
    try {
      setPicking(true);
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.name || !asset.uri) throw new Error("Could not read the selected file.");
      if (!PSP_EXTENSIONS.some((extension) => asset.name.toLowerCase().endsWith(extension))) {
        Alert.alert("Unsupported file", "Choose a PSP ISO, CSO, CHD, or PBP file.");
        return;
      }
      setGame({ name: asset.name, uri: asset.uri }); haptic.success();
    } catch (error) { haptic.error(); Alert.alert("Could not choose game", error instanceof Error ? error.message : "Try again."); } finally { setPicking(false); }
  };

  const launchGame = async () => {
    if (!game) return;
    if (Platform.OS === "web") { Alert.alert("Android APK required", "The native PSP player is available in the Android APK only."); return; }
    try { setLaunching(true); await MoudieEmulatorModule.launchNativeGame("psp", game.uri, game.name, playerOptions); }
    catch (error) { haptic.error(); Alert.alert("Could not start PSP", error instanceof Error ? error.message : "Try again."); }
    finally { setLaunching(false); }
  };

  const host = snapshot.data?.members.find((member) => member.id === credential?.memberId)?.role === "host";
  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}><Pressable onPress={() => router.replace({ pathname: "/room/[roomId]", params: { roomId: String(roomId ?? "") } })}><Text style={styles.back}>‹ BACK TO ROOM</Text></Pressable><Text style={styles.chip}>PSP ROOM</Text></View>
        <Text style={styles.eyebrow}>PPSSPP CORE</Text><Text style={styles.title}>PlayStation Portable</Text>
        <Text style={styles.subtitle}>Choose a legal PSP game file, then enter the player from this room. Text chat and voice controls remain available for everyone in the room.</Text>
        <View style={styles.preview}><Text style={styles.previewMark}>PSP</Text><Text style={styles.gameName}>{game?.name || "NO GAME SELECTED"}</Text><Text style={styles.previewText}>{game ? "Ready for PPSSPP" : "Supports ISO, CSO, CHD, and PBP"}</Text></View>
        <Pressable onPress={pickGame} disabled={picking || launching} style={({ pressed }) => [styles.primary, (pressed || picking || launching) && styles.disabled]}>{picking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{game ? "CHANGE PSP GAME" : "CHOOSE PSP GAME"}</Text>}</Pressable>
        {game && <Pressable onPress={launchGame} disabled={launching || picking} style={({ pressed }) => [styles.launch, (pressed || launching || picking) && styles.disabled]}>{launching ? <ActivityIndicator color="#071018" /> : <Text style={styles.launchText}>{`START PSP · ${playerOptions.orientation.toUpperCase()} · ${playerOptions.aspectRatio === "fit" ? "FIT" : playerOptions.aspectRatio}`}</Text>}</Pressable>}
        <View style={styles.note}><Text style={styles.noteTitle}>ROOM CONTROLS</Text><Text style={styles.noteText}>Use the CHAT and MIC buttons inside the game surface. Use EDIT to move controls and pinch or SIZE − / + to resize them. Each orientation keeps its own layout.</Text></View>
        {Platform.OS !== "web" && <><RoomChat socket={roomConnected ? socketRef.current : null} title="PSP ROOM CHAT" /><RoomVoiceChat socket={roomConnected ? socketRef.current : null} isHost={Boolean(host)} remoteOnline={remoteOnline} /></>}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 10, paddingBottom: 30 }, topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, back: { color: "#AABDD1", fontSize: 13, fontWeight: "900" }, chip: { color: "#73E8FF", fontSize: 11, fontWeight: "900", backgroundColor: "#123242", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 }, eyebrow: { color: "#66E4FF", fontSize: 11, letterSpacing: 1.2, fontWeight: "900", marginTop: 24 }, title: { color: "#F5F7FF", fontSize: 28, fontWeight: "900", marginTop: 4 }, subtitle: { color: "#B8C4D2", fontSize: 13, lineHeight: 20, marginTop: 8 }, preview: { minHeight: 190, alignItems: "center", justifyContent: "center", borderRadius: 22, borderWidth: 1, borderColor: "#266A85", backgroundColor: "#071721", marginTop: 20, padding: 18 }, previewMark: { color: "#071721", backgroundColor: "#50E4FF", borderRadius: 28, overflow: "hidden", paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, fontWeight: "900" }, gameName: { color: "#F5F7FF", fontSize: 16, fontWeight: "900", marginTop: 16, textAlign: "center" }, previewText: { color: "#9FC1D0", fontSize: 11, marginTop: 6 }, primary: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#157898", marginTop: 18 }, primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" }, launch: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#72E8FF", marginTop: 10 }, launchText: { color: "#071018", fontSize: 13, fontWeight: "900" }, disabled: { opacity: .55 }, note: { backgroundColor: "#162235", borderColor: "#2E5873", borderWidth: 1, borderRadius: 17, padding: 14, marginTop: 18 }, noteTitle: { color: "#77E9FF", fontSize: 12, fontWeight: "900" }, noteText: { color: "#C0D5E0", fontSize: 11, lineHeight: 17, marginTop: 6 },
});
