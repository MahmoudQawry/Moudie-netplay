import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";

import { CustomizableController } from "@/components/customizable-controller";

type SystemId = "famicom" | "ps1" | "psp" | "sega" | "arcade";

const systemMeta: Record<SystemId, { name: string; initials: string; accent: string; status: string }> = {
  famicom: { name: "Famicom / NES", initials: "NES", accent: "#F5C84C", status: "FCEUmm Core" },
  ps1: { name: "PlayStation 1", initials: "PS1", accent: "#B978FF", status: "PCSX-ReARMed Core" },
  psp: { name: "PlayStation Portable", initials: "PSP", accent: "#45DDFC", status: "PPSSPP Core" },
  sega: { name: "Sega Genesis", initials: "SEGA", accent: "#70E39B", status: "Genesis Plus GX Core" },
  arcade: { name: "Arcade", initials: "ARCADE", accent: "#FF886D", status: "MAME Arcade Core" },
};

function isSystemId(value: string | string[] | undefined): value is SystemId {
  return typeof value === "string" && value in systemMeta;
}

export default function LocalPlayScreen() {
  const { system: rawSystem, mode } = useLocalSearchParams<{ system?: string; mode?: string }>();
  const system: SystemId = isSystemId(rawSystem) ? rawSystem : "famicom";
  const meta = systemMeta[system];
  const { width, height } = useWindowDimensions();
  const [editing, setEditing] = useState(false);
  const [lastButton, setLastButton] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [message, setMessage] = useState("");
  const localMode = mode !== "room";
  const orientation = width > height ? "LANDSCAPE" : "PORTRAIT";

  return (
    <View style={styles.screen}>
      <StatusBar style="light" hidden />
      <View style={styles.canvas}>
        <View style={styles.topOverlay}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} accessibilityLabel="Back">
            <MaterialCommunityIcons name="arrow-left" size={21} color="#FFFFFF" />
          </Pressable>
          <View style={styles.telemetry}>
            <View style={styles.stat}><Text style={styles.statLabel}>FPS</Text><Text style={[styles.statValue, { color: meta.accent }]}>—</Text></View>
            <View style={styles.divider} />
            <View style={styles.stat}><Text style={styles.statLabel}>PING</Text><Text style={styles.statValue}>{localMode ? "LOCAL" : "— ms"}</Text></View>
            <View style={styles.divider} />
            <View style={styles.stat}><Text style={styles.statLabel}>PLAYER</Text><Text style={styles.statValue}>P1</Text></View>
          </View>
          <View style={styles.actionRow}>
            <Pressable onPress={() => setChatOpen((value) => !value)} style={({ pressed }) => [styles.iconButton, chatOpen && styles.iconActive, pressed && styles.pressed]} accessibilityLabel="Open text chat">
              <MaterialCommunityIcons name="message-text-outline" size={19} color="#FFFFFF" />
            </Pressable>
            <Pressable onPress={() => setMicMuted((value) => !value)} style={({ pressed }) => [styles.iconButton, !micMuted && styles.micLive, pressed && styles.pressed]} accessibilityLabel="Toggle microphone">
              <MaterialCommunityIcons name={micMuted ? "microphone-off" : "microphone"} size={19} color="#FFFFFF" />
            </Pressable>
            <Pressable onPress={() => setEditing((value) => !value)} style={({ pressed }) => [styles.customizeButton, editing && [styles.customizeButtonActive, { borderColor: meta.accent }], pressed && styles.pressed]}>
              <MaterialCommunityIcons name={editing ? "content-save-check-outline" : "tune-variant"} size={18} color={editing ? meta.accent : "#FFFFFF"} />
              <Text style={[styles.customizeText, editing && { color: meta.accent }]}>{editing ? "SAVE" : "EDIT"}</Text>
            </Pressable>
          </View>
        </View>

        <View pointerEvents="none" style={styles.centerBrand}>
          <Text style={[styles.centerInitials, { color: `${meta.accent}33` }]}>{meta.initials}</Text>
          {editing ? <Text style={styles.editHint}>Drag a control to move it. Select it, then use SIZE − / + to resize it. Layout is saved separately for this system and orientation.</Text> : <Text style={styles.engineHint}>{meta.status} · {localMode ? "LOCAL PLAY" : "ONLINE ROOM"} · {orientation}</Text>}
          {lastButton && !editing && <Text style={styles.buttonHint}>Pressed: {lastButton}</Text>}
        </View>

        <CustomizableController system={system} editable={editing} onButtonChange={(button, down) => { if (down) setLastButton(button); }} />

        {chatOpen && (
          <View style={styles.chatPanel}>
            <View style={styles.chatHeading}><Text style={styles.chatTitle}>TEXT CHAT</Text><Pressable onPress={() => setChatOpen(false)}><MaterialCommunityIcons name="close" size={18} color="#CFC6DF" /></Pressable></View>
            <Text style={styles.chatHint}>{localMode ? "Local messages remain on this device." : "Room messages are sent to connected members."}</Text>
            <View style={styles.chatComposer}>
              <TextInput value={message} onChangeText={setMessage} placeholder="Type a message" placeholderTextColor="#8D839C" style={styles.chatInput} returnKeyType="send" onSubmitEditing={() => setMessage("")} />
              <Pressable onPress={() => setMessage("")} style={styles.sendButton}><MaterialCommunityIcons name="send" size={17} color="#071016" /></Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  canvas: { flex: 1, backgroundColor: "#000000" },
  topOverlay: { position: "absolute", zIndex: 20, top: 16, left: 14, right: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  iconButton: { width: 38, height: 38, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(24, 20, 33, 0.86)", borderWidth: 1, borderColor: "#332B46" },
  iconActive: { backgroundColor: "rgba(91, 55, 150, 0.75)", borderColor: "#B978FF" },
  micLive: { backgroundColor: "rgba(26, 111, 80, 0.78)", borderColor: "#74E5AF" },
  telemetry: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(9, 9, 12, 0.8)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "#2A2633" },
  stat: { alignItems: "center", minWidth: 42 },
  statLabel: { color: "#85808D", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  statValue: { color: "#F9F7FF", fontSize: 10, fontWeight: "900", marginTop: 1 },
  divider: { height: 20, width: 1, backgroundColor: "#2E2936" },
  customizeButton: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 38, paddingHorizontal: 10, borderRadius: 15, backgroundColor: "rgba(24, 20, 33, 0.86)", borderWidth: 1, borderColor: "#332B46" },
  customizeButtonActive: { backgroundColor: "rgba(85, 47, 130, 0.32)" },
  customizeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  centerBrand: { position: "absolute", zIndex: 1, top: "24%", left: 20, right: 20, alignItems: "center" },
  centerInitials: { fontSize: 58, fontWeight: "900", letterSpacing: 4 },
  engineHint: { color: "#58515E", fontSize: 10, fontWeight: "800", marginTop: 8, textAlign: "center" },
  editHint: { color: "#CFC6DF", fontSize: 11, fontWeight: "800", marginTop: 8, textAlign: "center", lineHeight: 17, maxWidth: 330 },
  buttonHint: { color: "#8B8197", fontSize: 10, fontWeight: "800", marginTop: 5 },
  chatPanel: { position: "absolute", zIndex: 30, right: 16, top: 65, width: 255, borderRadius: 18, backgroundColor: "rgba(18, 13, 30, 0.96)", borderWidth: 1, borderColor: "#4D3A6D", padding: 12 },
  chatHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chatTitle: { color: "#F6F0FF", fontSize: 11, fontWeight: "900", letterSpacing: 0.7 },
  chatHint: { color: "#A79DB8", fontSize: 10, lineHeight: 15, marginTop: 7 },
  chatComposer: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 11 },
  chatInput: { flex: 1, height: 38, color: "#FFFFFF", fontSize: 12, paddingHorizontal: 10, backgroundColor: "#0D0917", borderRadius: 11, borderWidth: 1, borderColor: "#332746" },
  sendButton: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#75E7FF" },
  pressed: { opacity: 0.7 },
});
