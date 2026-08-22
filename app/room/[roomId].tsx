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
import { useRealtimeRoomSnapshot } from "@/lib/use-realtime-room-snapshot";
import { roomCapacityFor } from "@/shared/room-capacity";

const SYSTEM_LABEL: Record<string, string> = { psp: "PSP", nes: "Famicom / NES", sega: "Sega Genesis", ps1: "PlayStation 1", arcade: "Arcade" };

type MediaToken = { configured: boolean; url?: string; roomName?: string; token?: string; canPublish?: boolean; message?: string };

type RoomSystem = "nes" | "ps1" | "psp" | "sega" | "arcade";

export default function RoomScreen() {
  const { roomId: rawRoomId } = useLocalSearchParams<{ roomId: string }>();
  const roomId = Number(rawRoomId);
  const [credential, setCredential] = useState<RoomCredential | null | undefined>(undefined);
  const [mediaToken, setMediaToken] = useState<MediaToken | null>(null);
  const socketRef = useRef<ReturnType<typeof createNetplaySocket> | null>(null);
  const [roomConnected, setRoomConnected] = useState(false);

  useEffect(() => {
    if (Number.isFinite(roomId)) getRoomCredential(roomId).then(setCredential);
  }, [roomId]);

  const mediaTokenMutation = trpc.rooms.mediaToken.useMutation();
  useEffect(() => {
    if (!credential || Platform.OS === "web") return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await mediaTokenMutation.mutateAsync({ roomId, memberId: credential.memberId, memberToken: credential.memberToken });
        if (!cancelled) setMediaToken(next);
      } catch {
        if (!cancelled) setMediaToken({ configured: false, message: "تعذر تجهيز قناة الصوت. تأكد من إعداد LiveKit على الخادم." });
      }
    };
    refresh();
    const timer = setInterval(refresh, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [credential, mediaTokenMutation, roomId]);

  useEffect(() => {
    if (!credential || Platform.OS === "web") return;
    const socket = createNetplaySocket({ roomId, memberId: credential.memberId, memberToken: credential.memberToken });
    socketRef.current = socket;
    const connected = () => setRoomConnected(true);
    const disconnected = () => setRoomConnected(false);
    socket.on("connect", connected);
    socket.on("disconnect", disconnected);
    socket.connect();
    return () => {
      socket.off("connect", connected);
      socket.off("disconnect", disconnected);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [credential, roomId]);

  const snapshotQuery = useRealtimeRoomSnapshot(roomId, credential, 4_000);
  const snapshot = snapshotQuery.data;
  const roomMember = snapshot?.members.find((member) => member.id === credential?.memberId);
  const roomIsHost = roomMember?.role === "host";

  const share = async () => {
    if (!snapshot) return;
    haptic.light();
    await Share.share({ message: `Join ${snapshot.room.name} on Classic Era by Moudie. Room code: ${snapshot.room.joinCode}` });
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

  const system = snapshot.room.system as RoomSystem;
  const capacity = roomCapacityFor(system);
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
        <Text style={styles.caption}>PRIVATE ROOM · {playerCount}/{capacity.maxPlayers} PLAYERS · {spectatorCount}/{capacity.maxSpectators} SPECTATORS</Text>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>INVITE CODE</Text>
          <Text style={styles.code}>{snapshot.room.joinCode}</Text>
          <Pressable onPress={share} style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}><Text style={styles.shareText}>SHARE CODE</Text></Pressable>
        </View>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>ROOM MEMBERS</Text><Text style={styles.counter}>{playerCount}/{capacity.maxPlayers} PLAYERS · {spectatorCount}/{capacity.maxSpectators} SPECTATORS</Text></View>
        <View style={styles.memberList}>
          {snapshot.members.map((member) => (
            <View key={member.id} style={styles.member}>
              <View style={[styles.avatar, member.role === "host" && styles.avatarHost]}><Text style={styles.avatarText}>{member.displayName.slice(0, 1).toUpperCase()}</Text></View>
              <View style={styles.memberText}><Text style={styles.memberName}>{member.displayName}{member.role === "host" ? " · PLAYER 1 · HOST" : member.role === "spectator" ? " · SPECTATOR" : ` · PLAYER ${snapshot.members.filter((entry) => entry.role !== "spectator").sort((left, right) => (left.role === "host" ? -1 : right.role === "host" ? 1 : left.id - right.id)).findIndex((entry) => entry.id === member.id) + 1}`}</Text><Text style={styles.memberStatus}>{member.role === "spectator" ? "Watching and talking in the room" : member.isReady ? "READY" : "Checking emulator"}</Text></View>
              <View style={[styles.readyDot, member.isReady ? styles.ready : styles.pending]} />
            </View>
          ))}
        </View>

        {Platform.OS !== "web" && <>
          <RoomChat socket={roomConnected ? socketRef.current : null} title={`${SYSTEM_LABEL[snapshot.room.system]} ROOM CHAT`} />
          <RoomVoiceChat mediaToken={mediaToken} memberRole={roomMember?.role} />
        </>}

        {snapshot.room.system === "nes" ? (
          <Pressable onPress={() => router.push({ pathname: "/famicom/[roomId]", params: { roomId: String(roomId) } } as never)} style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}><Text style={styles.playText}>ENTER FAMICOM SETTINGS</Text></Pressable>
        ) : snapshot.room.system === "ps1" ? (
          <Pressable onPress={() => router.push({ pathname: "/ps1/[roomId]", params: { roomId: String(roomId) } } as never)} style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}><Text style={styles.playText}>ENTER PS1 SETTINGS</Text></Pressable>
        ) : snapshot.room.system === "psp" ? (
          <Pressable onPress={() => router.push({ pathname: "/psp/[roomId]", params: { roomId: String(roomId) } } as never)} style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}><Text style={styles.playText}>ENTER PSP SETTINGS</Text></Pressable>
        ) : snapshot.room.system === "sega" || snapshot.room.system === "arcade" ? (
          <Pressable onPress={() => router.push({ pathname: "/native/[system]/[roomId]", params: { system: snapshot.room.system, roomId: String(roomId) } } as never)} style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}><Text style={styles.playText}>ENTER {SYSTEM_LABEL[snapshot.room.system].toUpperCase()} SETTINGS</Text></Pressable>
        ) : (
          <View style={styles.nextCard}><Text style={styles.nextTitle}>PLAYER PREPARATION</Text><Text style={styles.nextText}>Text chat and voice are available while the {SYSTEM_LABEL[snapshot.room.system]} room player is prepared.</Text><Text style={styles.progress}>{readyCount} READY PLAYERS OUT OF {playerCount}</Text></View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 10, paddingBottom: 28 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  back: { paddingVertical: 7 }, backText: { color: "#9BAFC4", fontSize: 16, fontWeight: "700" },
  live: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#193A3B", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 99 }, liveDot: { width: 7, height: 7, borderRadius: 99, backgroundColor: "#48C78E" }, liveText: { color: "#83E0B1", fontSize: 11, fontWeight: "800" },
  system: { color: "#62C2EB", fontSize: 13, letterSpacing: 1, fontWeight: "900", textAlign: "right", marginTop: 26 }, title: { color: "#F3F7FB", fontSize: 30, lineHeight: 39, fontWeight: "800", textAlign: "right", marginTop: 4 }, caption: { color: "#9BAFC4", fontSize: 14, textAlign: "right", marginTop: 4 },
  codeCard: { backgroundColor: "#146C94", borderRadius: 20, padding: 20, marginTop: 22, alignItems: "center" }, codeLabel: { color: "#D7F2FF", fontSize: 13, fontWeight: "800" }, code: { color: "#FFFFFF", fontSize: 34, letterSpacing: 7, fontWeight: "900", marginTop: 8, marginLeft: 7 }, shareButton: { marginTop: 13, backgroundColor: "#FFFFFF", borderRadius: 12, paddingVertical: 9, paddingHorizontal: 16 }, shareText: { color: "#146C94", fontSize: 13, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 10 }, sectionTitle: { color: "#F3F7FB", fontSize: 18, fontWeight: "800" }, counter: { color: "#9BAFC4", fontSize: 13, fontWeight: "700" },
  memberList: { backgroundColor: "#1D2A3C", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "#30445E" }, member: { minHeight: 67, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderBottomColor: "#30445E", borderBottomWidth: 1 }, avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#465D76", alignItems: "center", justifyContent: "center" }, avatarHost: { backgroundColor: "#F26B5B" }, avatarText: { color: "#FFFFFF", fontWeight: "900" }, memberText: { flex: 1, marginLeft: 11 }, memberName: { color: "#F3F7FB", fontSize: 15, fontWeight: "800", textAlign: "right" }, memberStatus: { color: "#9BAFC4", fontSize: 12, textAlign: "right", marginTop: 3 }, readyDot: { width: 9, height: 9, borderRadius: 99, marginLeft: 10 }, ready: { backgroundColor: "#48C78E" }, pending: { backgroundColor: "#F4B942" },
  nextCard: { backgroundColor: "#162235", borderRadius: 18, padding: 16, marginTop: 22, borderWidth: 1, borderColor: "#30445E" }, nextTitle: { color: "#F4C662", fontSize: 14, fontWeight: "800", textAlign: "right" }, nextText: { color: "#C4D0DC", fontSize: 13, lineHeight: 20, textAlign: "right", marginTop: 5 }, progress: { color: "#8BB7CF", fontSize: 12, fontWeight: "800", textAlign: "right", marginTop: 11 }, playButton: { minHeight: 54, borderRadius: 16, backgroundColor: "#F26B5B", alignItems: "center", justifyContent: "center", marginTop: 20 }, playText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" }, errorTitle: { color: "#F3F7FB", fontSize: 23, fontWeight: "800", textAlign: "center" }, errorText: { color: "#9BAFC4", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 8 }, outlineButton: { marginTop: 24, borderWidth: 1, borderColor: "#62C2EB", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14 }, outlineText: { color: "#62C2EB", fontWeight: "800" }, pressed: { opacity: 0.72 },
});
