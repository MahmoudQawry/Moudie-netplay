import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { RoomChat } from "@/components/room-chat";
import { RoomVoiceChat } from "@/components/room-voice-chat";
import { haptic } from "@/lib/haptics";
import { createNetplaySocket } from "@/lib/netplay-socket";
import { getRoomCredential, type RoomCredential } from "@/lib/room-storage";
import { trpc } from "@/lib/trpc";

const SYSTEM_LABEL: Record<string, string> = { psp: "PSP", nes: "Famicom / NES", sega: "Sega Genesis", ps1: "PlayStation 1", arcade: "Arcade" };

export default function RoomScreen() {
  const { roomId: rawRoomId } = useLocalSearchParams<{ roomId: string }>();
  const roomId = Number(rawRoomId);
  const [credential, setCredential] = useState<RoomCredential | null | undefined>(undefined);
  const socketRef = useRef<ReturnType<typeof createNetplaySocket> | null>(null);
  const [roomConnected, setRoomConnected] = useState(false);
  const [remoteOnline, setRemoteOnline] = useState(false);
  const [playerSetupSystem, setPlayerSetupSystem] = useState<"nes" | "ps1" | "psp" | null>(null);
  const [playerOrientation, setPlayerOrientation] = useState<"portrait" | "landscape">("landscape");
  const [playerAspect, setPlayerAspect] = useState<"fit" | "4:3" | "16:9">("4:3");

  useEffect(() => {
    if (Number.isFinite(roomId)) getRoomCredential(roomId).then(setCredential);
  }, [roomId]);

  useEffect(() => {
    if (!credential || Platform.OS === "web") return;
    const socket = createNetplaySocket({ roomId, memberId: credential.memberId, memberToken: credential.memberToken });
    socketRef.current = socket;
    const connected = () => setRoomConnected(true);
    const disconnected = () => { setRoomConnected(false); setRemoteOnline(false); };
    const joined = (payload: { onlineMemberIds?: number[] }) => setRemoteOnline(Boolean(payload.onlineMemberIds?.some((id) => id !== credential.memberId)));
    const presence = (payload: { memberId?: number; online?: boolean }) => {
      if (payload.memberId !== credential.memberId) setRemoteOnline(Boolean(payload.online));
    };
    socket.on("connect", connected);
    socket.on("disconnect", disconnected);
    socket.on("netplay:joined", joined);
    socket.on("netplay:presence", presence);
    socket.connect();
    return () => {
      socket.off("connect", connected);
      socket.off("disconnect", disconnected);
      socket.off("netplay:joined", joined);
      socket.off("netplay:presence", presence);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [credential, roomId]);

  const snapshotQuery = trpc.rooms.snapshot.useQuery(
    { roomId, memberId: credential?.memberId ?? 0, memberToken: credential?.memberToken ?? "" },
    { enabled: Boolean(credential && roomId), refetchInterval: 4000 },
  );
  const snapshot = snapshotQuery.data;
  const roomIsHost = snapshot?.members.find((member) => member.id === credential?.memberId)?.role === "host";

  const share = async () => {
    if (!snapshot) return;
    haptic.light();
    await Share.share({ message: `Join ${snapshot.room.name} on Moudie NetPlay. Room code: ${snapshot.room.joinCode}` });
  };

  if (credential === undefined || snapshotQuery.isLoading) {
    return <ScreenContainer className="items-center justify-center"><ActivityIndicator color="#62C2EB" size="large" /></ScreenContainer>;
  }
  if (!credential || snapshotQuery.error || !snapshot) {
    return (
      <ScreenContainer className="items-center justify-center px-7">
        <Text style={styles.errorTitle}>Could not open room</Text>
        <Text style={styles.errorText}>This membership may be stored on another device, or the room is no longer available.</Text>
        <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}><Text style={styles.outlineText}>RETURN TO LOBBY</Text></Pressable>
      </ScreenContainer>
    );
  }

  const readyCount = snapshot.members.filter((member) => member.role !== "spectator" && member.isReady).length;
  const playerCount = snapshot.members.filter((member) => member.role !== "spectator").length;
  const spectatorCount = snapshot.members.filter((member) => member.role === "spectator").length;
  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><Text style={styles.backText}>‹ LOBBY</Text></Pressable>
          <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>{snapshot.room.status === "waiting" ? "WAITING FOR PLAYERS" : "SESSION ACTIVE"}</Text></View>
        </View>
        <Text style={styles.system}>{SYSTEM_LABEL[snapshot.room.system]}</Text>
        <Text style={styles.title}>{snapshot.room.name}</Text>
        <Text style={styles.caption}>PRIVATE ROOM · {playerCount}/{snapshot.room.maxPlayers} PLAYERS{spectatorCount ? ` · ${spectatorCount} SPECTATORS` : ""}</Text>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>INVITE CODE</Text>
          <Text style={styles.code}>{snapshot.room.joinCode}</Text>
          <Pressable onPress={share} style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}><Text style={styles.shareText}>SHARE CODE</Text></Pressable>
        </View>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>ROOM MEMBERS</Text><Text style={styles.counter}>{playerCount}/{snapshot.room.maxPlayers} PLAYERS</Text></View>
        <View style={styles.memberList}>
          {snapshot.members.map((member) => (
            <View key={member.id} style={styles.member}>
              <View style={[styles.avatar, member.role === "host" && styles.avatarHost]}><Text style={styles.avatarText}>{member.displayName.slice(0, 1).toUpperCase()}</Text></View>
              <View style={styles.memberText}><Text style={styles.memberName}>{member.displayName}{member.role === "host" ? " · HOST" : member.role === "spectator" ? " · SPECTATOR" : ""}</Text><Text style={styles.memberStatus}>{member.role === "spectator" ? "Watching and talking in the room" : member.isReady ? "READY" : "Checking emulator"}</Text></View>
              <View style={[styles.readyDot, member.isReady ? styles.ready : styles.pending]} />
            </View>
          ))}
        </View>

        {playerSetupSystem && <View style={styles.playerSetup}><Text style={styles.playerSetupTitle}>START PLAY SETUP</Text><Text style={styles.playerSetupLabel}>ORIENTATION</Text><View style={styles.setupRow}>{(["portrait", "landscape"] as const).map((option) => <Pressable key={option} onPress={() => setPlayerOrientation(option)} style={[styles.setupOption, playerOrientation === option && styles.setupOptionActive]}><Text style={styles.setupOptionText}>{option.toUpperCase()}</Text></Pressable>)}</View><Text style={styles.playerSetupLabel}>SCREEN RATIO</Text><View style={styles.setupRow}>{(["fit", "4:3", "16:9"] as const).map((option) => <Pressable key={option} onPress={() => setPlayerAspect(option)} style={[styles.setupOption, playerAspect === option && styles.setupOptionActive]}><Text style={styles.setupOptionText}>{option === "fit" ? "FIT" : option}</Text></Pressable>)}</View><Pressable onPress={() => { const pathname = playerSetupSystem === "nes" ? "/famicom/[roomId]" : playerSetupSystem === "ps1" ? "/ps1/[roomId]" : "/psp/[roomId]"; router.push({ pathname: pathname as never, params: { roomId: String(roomId), orientation: playerOrientation, aspectRatio: playerAspect } } as never); setPlayerSetupSystem(null); }} style={styles.setupConfirm}><Text style={styles.setupConfirmText}>CONFIRM & CONTINUE</Text></Pressable></View>}

        {snapshot.room.system === "nes" ? (
          <Pressable onPress={() => setPlayerSetupSystem("nes")} style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}>
            <Text style={styles.playText}>START PLAY · FAMICOM</Text>
          </Pressable>
        ) : snapshot.room.system === "ps1" ? (
          <Pressable onPress={() => setPlayerSetupSystem("ps1")} style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}>
            <Text style={styles.playText}>START PLAY · PS1</Text>
          </Pressable>
        ) : snapshot.room.system === "psp" ? (
          <Pressable onPress={() => setPlayerSetupSystem("psp")} style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}>
            <Text style={styles.playText}>START PLAY · PSP</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.nextCard}>
              <Text style={styles.nextTitle}>PLAYER PREPARATION</Text>
              <Text style={styles.nextText}>Text chat and voice are available while the {SYSTEM_LABEL[snapshot.room.system]} room player is prepared.</Text>
              <Text style={styles.progress}>{readyCount} READY PLAYERS OUT OF {playerCount}</Text>
            </View>
            {Platform.OS !== "web" && <><RoomChat socket={roomConnected ? socketRef.current : null} title={`${SYSTEM_LABEL[snapshot.room.system]} ROOM CHAT`} />
            <RoomVoiceChat socket={roomConnected ? socketRef.current : null} isHost={Boolean(roomIsHost)} remoteOnline={remoteOnline} memberId={credential.memberId} members={snapshot.members} /></>}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 10, paddingBottom: 28 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  back: { paddingVertical: 7 },
  backText: { color: "#9BAFC4", fontSize: 16, fontWeight: "700" },
  live: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#193A3B", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 99 },
  liveDot: { width: 7, height: 7, borderRadius: 99, backgroundColor: "#48C78E" },
  liveText: { color: "#83E0B1", fontSize: 11, fontWeight: "800" },
  system: { color: "#62C2EB", fontSize: 13, letterSpacing: 1, fontWeight: "900", textAlign: "right", marginTop: 26 },
  title: { color: "#F3F7FB", fontSize: 30, lineHeight: 39, fontWeight: "800", textAlign: "right", marginTop: 4 },
  caption: { color: "#9BAFC4", fontSize: 14, textAlign: "right", marginTop: 4 },
  codeCard: { backgroundColor: "#146C94", borderRadius: 20, padding: 20, marginTop: 22, alignItems: "center" },
  codeLabel: { color: "#D7F2FF", fontSize: 13, fontWeight: "800" },
  code: { color: "#FFFFFF", fontSize: 34, letterSpacing: 7, fontWeight: "900", marginTop: 8, marginLeft: 7 },
  shareButton: { marginTop: 13, backgroundColor: "#FFFFFF", borderRadius: 12, paddingVertical: 9, paddingHorizontal: 16 },
  shareText: { color: "#146C94", fontSize: 13, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 10 },
  sectionTitle: { color: "#F3F7FB", fontSize: 18, fontWeight: "800" },
  counter: { color: "#9BAFC4", fontSize: 13, fontWeight: "700" },
  memberList: { backgroundColor: "#1D2A3C", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "#30445E" },
  member: { minHeight: 67, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderBottomColor: "#30445E", borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#465D76", alignItems: "center", justifyContent: "center" },
  avatarHost: { backgroundColor: "#F26B5B" },
  avatarText: { color: "#FFFFFF", fontWeight: "900" },
  memberText: { flex: 1, marginLeft: 11 },
  memberName: { color: "#F3F7FB", fontSize: 15, fontWeight: "800", textAlign: "right" },
  memberStatus: { color: "#9BAFC4", fontSize: 12, textAlign: "right", marginTop: 3 },
  readyDot: { width: 9, height: 9, borderRadius: 99, marginLeft: 10 },
  ready: { backgroundColor: "#48C78E" },
  pending: { backgroundColor: "#F4B942" },
  nextCard: { backgroundColor: "#162235", borderRadius: 18, padding: 16, marginTop: 22, borderWidth: 1, borderColor: "#30445E" },
  nextTitle: { color: "#F4C662", fontSize: 14, fontWeight: "800", textAlign: "right" },
  nextText: { color: "#C4D0DC", fontSize: 13, lineHeight: 20, textAlign: "right", marginTop: 5 },
  progress: { color: "#8BB7CF", fontSize: 12, fontWeight: "800", textAlign: "right", marginTop: 11 },
  playButton: { minHeight: 54, borderRadius: 16, backgroundColor: "#F26B5B", alignItems: "center", justifyContent: "center", marginTop: 20 },
  playText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  playerSetup: { marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: "#4A7895", backgroundColor: "#102236", padding: 14 },
  playerSetupTitle: { color: "#D8F4FF", fontSize: 14, fontWeight: "900" },
  playerSetupLabel: { color: "#83BFD9", fontSize: 10, fontWeight: "900", marginTop: 12 },
  setupRow: { flexDirection: "row", gap: 8, marginTop: 7 },
  setupOption: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "#35546F", backgroundColor: "#172D43" },
  setupOptionActive: { backgroundColor: "#146C94", borderColor: "#69E8FF" },
  setupOptionText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  setupConfirm: { minHeight: 46, marginTop: 15, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#48C78E" },
  setupConfirmText: { color: "#062817", fontSize: 12, fontWeight: "900" },
  errorTitle: { color: "#F3F7FB", fontSize: 23, fontWeight: "800", textAlign: "center" },
  errorText: { color: "#9BAFC4", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 8 },
  outlineButton: { marginTop: 24, borderWidth: 1, borderColor: "#62C2EB", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14 },
  outlineText: { color: "#62C2EB", fontWeight: "800" },
  pressed: { opacity: 0.72 },
});
