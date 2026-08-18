import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { NeonCircuitBackground } from "@/components/neon-circuit-background";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { getProfileName, saveProfileName, saveRoomCredential } from "@/lib/room-storage";
import { trpc } from "@/lib/trpc";

type SystemId = "psp" | "nes" | "sega" | "ps1" | "arcade";

const SYSTEMS: { id: SystemId; label: string; detail: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; accent: string }[] = [
  { id: "ps1", label: "PS1", detail: "PlayStation", icon: "gamepad-variant", accent: "#C05DFF" },
  { id: "psp", label: "PSP", detail: "Portable", icon: "gamepad-outline", accent: "#38D4FF" },
  { id: "nes", label: "NES", detail: "Famicom", icon: "controller-classic-outline", accent: "#FF727A" },
  { id: "sega", label: "SEGA", detail: "Genesis", icon: "gamepad-variant-outline", accent: "#70E59A" },
  { id: "arcade", label: "ARCADE", detail: "Arcade", icon: "controller-classic-outline", accent: "#FFAA38" },
];

export default function CreateRoomScreen() {
  const [system, setSystem] = useState<SystemId>("ps1");
  const [name, setName] = useState("Friends Session");
  const [hostName, setHostName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(10);
  const createRoom = trpc.rooms.create.useMutation();

  const create = async () => {
    const normalizedHost = hostName.trim() || (await getProfileName())?.trim() || "Player";
    if (name.trim().length < 2) {
      haptic.error();
      Alert.alert("Room name is too short", "Enter at least two characters.");
      return;
    }
    try {
      const room = await createRoom.mutateAsync({ name: name.trim(), system, hostName: normalizedHost, maxPlayers });
      await saveProfileName(normalizedHost);
      await saveRoomCredential({ roomId: room.roomId, memberId: room.memberId, memberToken: room.memberToken, hostToken: room.hostToken });
      haptic.success();
      router.replace({ pathname: "/room/[roomId]", params: { roomId: String(room.roomId) } });
    } catch (error) {
      haptic.error();
      Alert.alert("Could not create room", error instanceof Error ? error.message : "Try again.");
    }
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]} containerClassName="bg-background">
      <NeonCircuitBackground />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><MaterialCommunityIcons name="arrow-right" size={21} color="#F8F5FF" /></Pressable>
          <View style={styles.titleRow}><Image source={require("@/assets/images/moudie-brand-icon.png")} style={styles.brandIcon} /><Text style={styles.title}>CREATE ROOM</Text></View>
          <View style={styles.headerSpace} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelLead}>CHOOSE AN EMULATOR</Text>
          <Text style={styles.panelSub}>Choose the game system. Every system has a dedicated controller layout inside the player.</Text>
          <View style={styles.systemGrid}>
            {SYSTEMS.map((item) => {
              const selected = system === item.id;
              return (
                <Pressable key={item.id} onPress={() => { haptic.selection(); setSystem(item.id); }} style={({ pressed }) => [styles.systemCard, selected && { borderColor: item.accent, backgroundColor: `${item.accent}18` }, pressed && styles.pressed]}>
                  <MaterialCommunityIcons name={item.icon} size={26} color={item.accent} />
                  <View style={styles.systemCopy}><Text style={[styles.systemTitle, { color: selected ? item.accent : "#F4F0FF" }]}>{item.label}</Text><Text style={styles.systemDetail}>{item.detail}</Text></View>
                  {selected && <View style={[styles.selectedDot, { backgroundColor: item.accent }]} />}
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>ROOM NAME</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Example: Friday Night Race" placeholderTextColor="#827B97" returnKeyType="done" textAlign="left" />
          <Text style={styles.label}>DISPLAY NAME</Text>
          <TextInput value={hostName} onChangeText={setHostName} style={styles.input} placeholder="Visible to your friends" placeholderTextColor="#827B97" returnKeyType="done" textAlign="left" />

          <View style={styles.capacityHeading}><Text style={styles.labelInline}>ROOM CAPACITY</Text><Text style={styles.capacityHint}>UP TO 10 MEMBERS</Text></View>
          <View style={styles.capacityRow}>
            {[2, 4, 6, 8, 10].map((value) => (
              <Pressable key={value} onPress={() => { haptic.selection(); setMaxPlayers(value); }} style={({ pressed }) => [styles.capacity, maxPlayers === value && styles.capacitySelected, pressed && styles.pressed]}><Text style={[styles.capacityText, maxPlayers === value && styles.capacityTextSelected]}>{value}</Text></Pressable>
            ))}
          </View>

          <View style={styles.featureRow}>
            <View style={styles.feature}><MaterialCommunityIcons name="microphone-outline" size={16} color="#69E8FF" /><Text style={styles.featureText}>VOICE</Text></View>
            <View style={styles.feature}><MaterialCommunityIcons name="message-text-outline" size={16} color="#C58AFF" /><Text style={styles.featureText}>CHAT</Text></View>
            <View style={styles.feature}><MaterialCommunityIcons name="eye-outline" size={16} color="#FFD16A" /><Text style={styles.featureText}>SPECTATE</Text></View>
          </View>

          <Pressable onPress={create} disabled={createRoom.isPending} style={({ pressed }) => [styles.primaryButton, (pressed || createRoom.isPending) && styles.buttonPressed]}>
            {createRoom.isPending ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.primaryText}>CREATE ROOM & ENTER PLAYER</Text><MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" /></>}
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 32 },
  header: { height: 57, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#1A102D", borderWidth: 1, borderColor: "#412960" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: { width: 41, height: 41, borderRadius: 12, borderWidth: 1, borderColor: "#594174" },
  title: { color: "#FFFFFF", fontSize: 25, fontWeight: "900" },
  headerSpace: { width: 40 },
  panel: { backgroundColor: "rgba(19, 10, 36, 0.93)", borderWidth: 1, borderColor: "#55377F", borderRadius: 27, padding: 17, marginTop: 12, shadowColor: "#8E49E6", shadowOpacity: 0.23, shadowRadius: 18, elevation: 4 },
  panelLead: { color: "#F8F4FF", fontSize: 19, fontWeight: "900", textAlign: "right" },
  panelSub: { color: "#B8B0CA", fontSize: 12, textAlign: "right", lineHeight: 18, marginTop: 4 },
  systemGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
  systemCard: { width: "47.7%", minHeight: 82, padding: 12, borderRadius: 17, borderWidth: 1, borderColor: "#302044", backgroundColor: "#110A20", flexDirection: "row", alignItems: "center", gap: 9 },
  systemCopy: { flex: 1, alignItems: "flex-end" },
  systemTitle: { fontSize: 15, fontWeight: "900", textAlign: "right" },
  systemDetail: { color: "#9F96B2", fontSize: 10, fontWeight: "700", textAlign: "right", marginTop: 3 },
  selectedDot: { width: 8, height: 8, borderRadius: 4, position: "absolute", top: 10, left: 10 },
  label: { color: "#ECE7F9", fontSize: 13, fontWeight: "900", textAlign: "right", marginTop: 17, marginBottom: 7 },
  input: { minHeight: 51, backgroundColor: "#0E091A", borderRadius: 14, borderWidth: 1, borderColor: "#302144", paddingHorizontal: 14, color: "#F8F4FF", fontSize: 15 },
  capacityHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 17, marginBottom: 7 },
  labelInline: { color: "#ECE7F9", fontSize: 13, fontWeight: "900" },
  capacityHint: { color: "#67E1FF", fontSize: 10, fontWeight: "800" },
  capacityRow: { flexDirection: "row", gap: 7 },
  capacity: { flex: 1, minHeight: 39, borderRadius: 12, borderWidth: 1, borderColor: "#332349", backgroundColor: "#110A20", alignItems: "center", justifyContent: "center" },
  capacitySelected: { borderColor: "#A955F7", backgroundColor: "#4B2377" },
  capacityText: { color: "#A69DB8", fontSize: 13, fontWeight: "900" },
  capacityTextSelected: { color: "#FFFFFF" },
  featureRow: { flexDirection: "row", justifyContent: "space-around", backgroundColor: "#100A1D", borderRadius: 14, marginTop: 16, paddingVertical: 10, borderWidth: 1, borderColor: "#29203B" },
  feature: { flexDirection: "row", alignItems: "center", gap: 5 },
  featureText: { color: "#BBB3C9", fontSize: 11, fontWeight: "800" },
  primaryButton: { minHeight: 54, borderRadius: 17, marginTop: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: "#A54DF3" },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.72 },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
