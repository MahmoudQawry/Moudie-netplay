import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { NeonCircuitBackground } from "@/components/neon-circuit-background";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { getProfileName, saveProfileName, saveRoomCredential } from "@/lib/room-storage";
import { joinRealtimeRoom } from "@/lib/realtime-room-service";

type JoinAs = "player" | "spectator";

export default function JoinRoomScreen() {
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joinAs, setJoinAs] = useState<JoinAs>("player");
  const [joining, setJoining] = useState(false);

  useEffect(() => { getProfileName().then((saved) => saved && setDisplayName(saved)); }, []);

  const join = async () => {
    if (joinCode.trim().length !== 6) {
      haptic.error();
      Alert.alert("Check the code", "A room code has six letters or numbers.");
      return;
    }
    if (displayName.trim().length < 2) {
      haptic.error();
      Alert.alert("Add a display name", "Enter at least two characters for your room name.");
      return;
    }
    try {
      setJoining(true);
      const result = await joinRealtimeRoom({ joinCode: joinCode.trim().toUpperCase(), displayName: displayName.trim(), joinAs });
      await saveProfileName(displayName.trim());
      await saveRoomCredential({ roomId: result.roomId, memberId: result.memberId, memberToken: result.memberToken });
      haptic.success();
      router.replace({ pathname: "/room/[roomId]", params: { roomId: String(result.roomId) } });
    } catch (error) {
      haptic.error();
      Alert.alert("Could not join", error instanceof Error ? error.message : "Check the room code and try again.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]} containerClassName="bg-background">
      <NeonCircuitBackground />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><MaterialCommunityIcons name="arrow-right" size={21} color="#F8F5FF" /></Pressable>
          <View style={styles.titleRow}><Image source={require("@/assets/images/moudie-brand-icon.png")} style={styles.brandIcon} /><Text style={styles.title}>JOIN ROOM</Text></View>
          <View style={styles.headerSpace} />
        </View>
        <View style={styles.panel}>
          <Text style={styles.label}>ROOM CODE</Text>
          <TextInput value={joinCode} onChangeText={(value) => setJoinCode(value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} autoCapitalize="characters" autoCorrect={false} maxLength={6} style={styles.codeInput} placeholder="ABC123" placeholderTextColor="#756E87" textAlign="center" returnKeyType="done" />
          <Text style={styles.label}>DISPLAY NAME</Text>
          <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} placeholder="Example: Alex" placeholderTextColor="#827B97" textAlign="left" returnKeyType="done" />

          <Text style={styles.label}>HOW DO YOU WANT TO JOIN?</Text>
          <View style={styles.roleRow}>
            <Pressable onPress={() => { haptic.selection(); setJoinAs("player"); }} style={({ pressed }) => [styles.roleCard, joinAs === "player" && styles.roleSelected, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="gamepad-variant-outline" size={24} color={joinAs === "player" ? "#65E8FF" : "#9B93AD"} />
              <Text style={[styles.roleTitle, joinAs === "player" && styles.roleTitleSelected]}>PLAYER</Text>
              <Text style={styles.roleText}>You control the game</Text>
            </Pressable>
            <Pressable onPress={() => { haptic.selection(); setJoinAs("spectator"); }} style={({ pressed }) => [styles.roleCard, joinAs === "spectator" && styles.roleSelected, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="eye-outline" size={24} color={joinAs === "spectator" ? "#D9A3FF" : "#9B93AD"} />
              <Text style={[styles.roleTitle, joinAs === "spectator" && styles.roleTitleSelected]}>SPECTATOR</Text>
              <Text style={styles.roleText}>Watch, talk, and chat</Text>
            </Pressable>
          </View>

          <Pressable onPress={join} disabled={joining} style={({ pressed }) => [styles.primaryButton, (pressed || joining) && styles.buttonPressed]}>
            {joining ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.primaryText}>JOIN ROOM</Text><MaterialCommunityIcons name="login-variant" size={20} color="#FFFFFF" /></>}
          </Pressable>
        </View>
        <View style={styles.helper}><MaterialCommunityIcons name="shield-lock-outline" size={18} color="#69E8FF" /><Text style={styles.helperText}>Your room code and membership stay on this device. Game files are never sent to the room.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 34, flexGrow: 1 },
  header: { height: 57, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#1A102D", borderWidth: 1, borderColor: "#412960" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: { width: 41, height: 41, borderRadius: 12, borderWidth: 1, borderColor: "#594174" },
  title: { color: "#FFFFFF", fontSize: 25, fontWeight: "900" },
  headerSpace: { width: 40 },
  panel: { backgroundColor: "rgba(19, 10, 36, 0.94)", borderWidth: 1, borderColor: "#55377F", borderRadius: 27, padding: 18, marginTop: 30, shadowColor: "#8E49E6", shadowOpacity: 0.24, shadowRadius: 18, elevation: 4 },
  label: { color: "#EDE7FB", fontSize: 14, fontWeight: "900", textAlign: "right", marginBottom: 8, marginTop: 5 },
  codeInput: { minHeight: 59, backgroundColor: "#0D0818", borderWidth: 1, borderColor: "#34234B", borderRadius: 15, color: "#FFFFFF", fontSize: 24, fontWeight: "900", letterSpacing: 4 },
  input: { minHeight: 51, backgroundColor: "#0D0818", borderWidth: 1, borderColor: "#34234B", borderRadius: 14, paddingHorizontal: 14, color: "#F8F4FF", fontSize: 15, marginBottom: 13 },
  roleRow: { flexDirection: "row", gap: 9, marginTop: 2 },
  roleCard: { flex: 1, minHeight: 103, padding: 12, borderRadius: 17, borderWidth: 1, borderColor: "#302044", backgroundColor: "#110A20", alignItems: "flex-end", justifyContent: "space-between" },
  roleSelected: { backgroundColor: "#2B1748", borderColor: "#A95CF0" },
  roleTitle: { color: "#D7D0E5", fontSize: 14, fontWeight: "900", marginTop: 6 },
  roleTitleSelected: { color: "#FFFFFF" },
  roleText: { color: "#9E95AF", fontSize: 10, textAlign: "right", marginTop: 3 },
  primaryButton: { minHeight: 54, borderRadius: 17, marginTop: 19, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: "#A54DF3" },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  helper: { marginTop: 20, flexDirection: "row", gap: 8, alignItems: "flex-start", paddingHorizontal: 9 },
  helperText: { color: "#B6AEC6", fontSize: 11, lineHeight: 17, textAlign: "right", flex: 1 },
  pressed: { opacity: 0.72 },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
