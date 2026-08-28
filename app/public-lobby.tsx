import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { NeonCircuitBackground } from "@/components/neon-circuit-background";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { getProfileName, saveProfileName, saveRoomCredential } from "@/lib/room-storage";
import { joinPublicRealtimeRoom, listPublicRealtimeRooms, type RealtimePublicRoom } from "@/lib/realtime-room-service";

type JoinAs = "player" | "spectator";

const systemAccent: Record<RealtimePublicRoom["system"], string> = { ps1: "#C05DFF", psp: "#38D4FF", nes: "#FF727A", sega: "#70E59A", arcade: "#FFAA38" };

export default function PublicLobbyScreen() {
  const [displayName, setDisplayName] = useState("");
  const [joinAs, setJoinAs] = useState<JoinAs>("player");
  const [rooms, setRooms] = useState<RealtimePublicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningRoomId, setJoiningRoomId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setRooms(await listPublicRealtimeRooms());
    } catch (error) {
      Alert.alert("Could not load public lobbies", error instanceof Error ? error.message : "Try refreshing in a moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void getProfileName().then((saved) => saved && setDisplayName(saved));
  }, [refresh]);

  const joinLobby = async (room: RealtimePublicRoom) => {
    if (displayName.trim().length < 2) {
      haptic.error();
      Alert.alert("Add a display name", "Enter at least two characters before joining a public lobby.");
      return;
    }
    try {
      setJoiningRoomId(room.id);
      const membership = await joinPublicRealtimeRoom({ roomId: room.id, displayName: displayName.trim(), joinAs });
      await saveProfileName(displayName.trim());
      await saveRoomCredential({ roomId: membership.roomId, memberId: membership.memberId, memberToken: membership.memberToken });
      haptic.success();
      router.replace({ pathname: "/room/[roomId]", params: { roomId: String(membership.roomId) } });
    } catch (error) {
      haptic.error();
      Alert.alert("Could not join public lobby", error instanceof Error ? error.message : "Refresh the lobby list and try again.");
      void refresh();
    } finally {
      setJoiningRoomId(null);
    }
  };

  return <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]} containerClassName="bg-background">
    <NeonCircuitBackground />
    <FlatList
      data={rooms}
      keyExtractor={(room) => String(room.id)}
      contentContainerStyle={styles.content}
      refreshing={loading}
      onRefresh={() => void refresh()}
      ListHeaderComponent={<View>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityLabel="Go back"><MaterialCommunityIcons name="arrow-left" size={21} color="#F8F5FF" /></Pressable>
          <View style={styles.titleRow}><Image source={require("@/assets/images/classic-era-brand-icon.png")} style={styles.brandIcon} /><View><Text style={styles.title}>PUBLIC LOBBY</Text><Text style={styles.subtitle}>OLD EQUAL GOLD</Text></View></View>
          <Pressable onPress={() => router.push({ pathname: "/create-room", params: { visibility: "public" } })} style={({ pressed }) => [styles.hostButton, pressed && styles.pressed]} accessibilityLabel="Host public lobby"><MaterialCommunityIcons name="plus" size={21} color="#081127" /></Pressable>
        </View>
        <View style={styles.hero}><MaterialCommunityIcons name="account-group-outline" size={32} color="#69E8FF" /><View style={styles.heroCopy}><Text style={styles.heroTitle}>FIND A CLASSIC SESSION</Text><Text style={styles.heroText}>Join an open lobby. The room supports up to 8 players and 2 spectators; invite codes are never shown here.</Text></View></View>
        <Text style={styles.label}>YOUR DISPLAY NAME</Text>
        <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} placeholder="Example: Alex" placeholderTextColor="#827B97" returnKeyType="done" textAlign="left" />
        <Text style={styles.label}>JOIN AS</Text>
        <View style={styles.roleRow}>
          <Pressable onPress={() => { haptic.selection(); setJoinAs("player"); }} style={({ pressed }) => [styles.roleButton, joinAs === "player" && styles.roleSelected, pressed && styles.pressed]}><MaterialCommunityIcons name="gamepad-variant-outline" size={18} color={joinAs === "player" ? "#69E8FF" : "#A49CB7"} /><Text style={styles.roleText}>PLAYER</Text></Pressable>
          <Pressable onPress={() => { haptic.selection(); setJoinAs("spectator"); }} style={({ pressed }) => [styles.roleButton, joinAs === "spectator" && styles.roleSelected, pressed && styles.pressed]}><MaterialCommunityIcons name="eye-outline" size={18} color={joinAs === "spectator" ? "#D9A3FF" : "#A49CB7"} /><Text style={styles.roleText}>SPECTATOR</Text></Pressable>
        </View>
        <View style={styles.listHeading}><Text style={styles.listTitle}>OPEN LOBBIES</Text><Pressable onPress={() => void refresh()} style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}><MaterialCommunityIcons name="refresh" size={17} color="#7BEAFF" /><Text style={styles.refreshText}>REFRESH</Text></Pressable></View>
      </View>}
      ListEmptyComponent={loading ? <View style={styles.empty}><ActivityIndicator color="#69E8FF" /><Text style={styles.emptyText}>Checking open lobbies…</Text></View> : <View style={styles.empty}><MaterialCommunityIcons name="radar" size={34} color="#705A91" /><Text style={styles.emptyTitle}>NO OPEN LOBBIES YET</Text><Text style={styles.emptyText}>Host the first public session, or ask a friend for a private room code.</Text></View>}
      renderItem={({ item: room }) => {
        const accent = systemAccent[room.system];
        const canJoin = joinAs === "player" ? room.activePlayers < room.maxPlayers : room.spectators < room.maxSpectators;
        return <View style={[styles.roomCard, { borderColor: `${accent}77` }]}>
          <View style={[styles.systemBadge, { backgroundColor: `${accent}22` }]}><Text style={[styles.systemText, { color: accent }]}>{room.system.toUpperCase()}</Text></View>
          <View style={styles.roomCopy}><Text style={styles.roomName} numberOfLines={1}>{room.name}</Text><Text style={styles.roomStats}>{room.activePlayers}/{room.maxPlayers} PLAYERS · {room.spectators}/{room.maxSpectators} SPECTATORS · {room.readyPlayers} READY</Text></View>
          <Pressable disabled={!canJoin || joiningRoomId !== null} onPress={() => void joinLobby(room)} style={({ pressed }) => [styles.joinButton, (!canJoin || joiningRoomId !== null) && styles.disabled, pressed && styles.pressed]}>{joiningRoomId === room.id ? <ActivityIndicator color="#081127" /> : <Text style={styles.joinText}>{canJoin ? "JOIN" : "FULL"}</Text>}</Pressable>
        </View>;
      }}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 34, flexGrow: 1 },
  header: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#1A102D", borderWidth: 1, borderColor: "#412960" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 9 }, brandIcon: { width: 41, height: 41, borderRadius: 12, borderWidth: 1, borderColor: "#594174" }, title: { color: "#FFFFFF", fontSize: 19, fontWeight: "900", letterSpacing: 0.8 }, subtitle: { color: "#72E8FF", fontSize: 8, fontWeight: "900", letterSpacing: 1.2, marginTop: 1 },
  hostButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#70E9FF" },
  hero: { marginTop: 16, borderRadius: 21, borderWidth: 1, borderColor: "#275B7A", backgroundColor: "#0D2033", padding: 15, flexDirection: "row", alignItems: "center", gap: 12 }, heroCopy: { flex: 1 }, heroTitle: { color: "#F8FCFF", fontSize: 14, fontWeight: "900" }, heroText: { color: "#B5C7D7", fontSize: 11, lineHeight: 16, marginTop: 4 },
  label: { color: "#EDE7FB", fontSize: 12, fontWeight: "900", marginTop: 16, marginBottom: 7 }, input: { minHeight: 49, backgroundColor: "#0D0818", borderWidth: 1, borderColor: "#34234B", borderRadius: 14, paddingHorizontal: 14, color: "#F8F4FF", fontSize: 15 },
  roleRow: { flexDirection: "row", gap: 10 }, roleButton: { flex: 1, minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: "#322244", backgroundColor: "#110A20", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7 }, roleSelected: { borderColor: "#6EE8FF", backgroundColor: "#132845" }, roleText: { color: "#F4F0FF", fontSize: 11, fontWeight: "900" },
  listHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 23, marginBottom: 11 }, listTitle: { color: "#F8F4FF", fontSize: 15, fontWeight: "900", letterSpacing: 0.7 }, refresh: { flexDirection: "row", alignItems: "center", gap: 5, padding: 6 }, refreshText: { color: "#82E9FF", fontSize: 10, fontWeight: "900" },
  roomCard: { minHeight: 82, borderWidth: 1, borderRadius: 17, backgroundColor: "#120C20", padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }, systemBadge: { width: 47, height: 47, borderRadius: 13, justifyContent: "center", alignItems: "center" }, systemText: { fontSize: 10, fontWeight: "900" }, roomCopy: { flex: 1 }, roomName: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" }, roomStats: { color: "#B9B0CD", fontSize: 9, lineHeight: 14, marginTop: 4, fontWeight: "700" }, joinButton: { minWidth: 57, minHeight: 36, paddingHorizontal: 10, borderRadius: 11, backgroundColor: "#70E9FF", alignItems: "center", justifyContent: "center" }, joinText: { color: "#081127", fontSize: 11, fontWeight: "900" }, disabled: { opacity: 0.42 }, separator: { height: 9 },
  empty: { minHeight: 160, padding: 22, alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 18, borderWidth: 1, borderColor: "#2B2140", backgroundColor: "#100A1D" }, emptyTitle: { color: "#E9E4F5", fontSize: 13, fontWeight: "900" }, emptyText: { color: "#9F97B2", textAlign: "center", fontSize: 11, lineHeight: 16, maxWidth: 260 }, pressed: { opacity: 0.75 },
});
