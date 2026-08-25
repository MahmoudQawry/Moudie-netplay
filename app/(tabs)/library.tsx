import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { SAVE_STATE_CAPABILITIES, type EmulatorSystemId } from "@/lib/emulator-save-state-capabilities";

const systems = [
  { id: "psp" as const, name: "PSP", engine: "PPSSPP", state: "READY", color: "#62C2EB", description: "Choose a legal PSP game file from Local Play or a PSP room. Save states are stored on this device." },
  { id: "nes" as const, name: "Famicom / NES", engine: "FCEUmm / JSNES", state: "READY", color: "#F4B942", description: "A room session starts after players verify the same game and compatible core." },
  { id: "sega" as const, name: "Sega Genesis", engine: "Genesis Plus GX", state: "READY", color: "#F26B5B", description: "Choose a legal Sega game in Local Play. Your saves and control layout remain on this device." },
  { id: "ps1" as const, name: "PlayStation 1", engine: "PCSX-ReARMed", state: "READY", color: "#9F8DF5", description: "Local saves, ISO support, and custom controls are available in the PS1 player." },
  { id: "arcade" as const, name: "Arcade", engine: "MAME Arcade", state: "READY", color: "#F28A5B", description: "Choose a legal Arcade game file for Local Play or an Arcade room. The same native core is available in both modes." },
];

export default function LibraryScreen() {
  return (
    <ScreenContainer className="px-5">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>LIBRARY</Text>
        <Text style={styles.title}>Systems & Cores</Text>
        <Text style={styles.subtitle}>Choose a play mode first, then select one of the five supported systems for your room or local session.</Text>
        <View style={styles.list}>{systems.map((system) => { const saveCapability = SAVE_STATE_CAPABILITIES[system.id satisfies EmulatorSystemId]; return <View key={system.name} style={styles.card}><View style={[styles.icon, { backgroundColor: system.color }]}><Text style={styles.iconText}>{system.name === "PSP" ? "△" : system.name === "Arcade" ? "▣" : "◈"}</Text></View><View style={styles.cardBody}><Text style={styles.name}>{system.name}</Text><Text style={styles.engine}>{system.engine}</Text><Text style={styles.description}>{system.description}</Text><Text style={[styles.saveState, { color: saveCapability.available ? "#83E0B1" : "#9BAFC4" }]}>{saveCapability.label}</Text></View><Text style={[styles.state, { color: system.color }]}>{system.state}</Text></View>})}</View>
        <View style={styles.notice}><Text style={styles.noticeTitle}>YOUR FILES STAY LOCAL</Text><Text style={styles.noticeText}>Moudie NetPlay coordinates rooms and compatibility checks only. It does not include games or transfer your game files to other players.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 17, paddingBottom: 28 },
  eyebrow: { color: "#62C2EB", fontSize: 13, fontWeight: "900", letterSpacing: 0.8 },
  title: { color: "#F3F7FB", fontSize: 29, fontWeight: "900", marginTop: 5 },
  subtitle: { color: "#9BAFC4", fontSize: 14, lineHeight: 21, marginTop: 8 },
  list: { gap: 11, marginTop: 24 },
  card: { backgroundColor: "#1D2A3C", borderRadius: 18, borderWidth: 1, borderColor: "#30445E", padding: 14, flexDirection: "row", alignItems: "flex-start" },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  iconText: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  cardBody: { flex: 1, marginLeft: 11 },
  name: { color: "#F3F7FB", fontSize: 16, fontWeight: "900" },
  engine: { color: "#7DCBE9", fontSize: 12, fontWeight: "800", marginTop: 2 },
  description: { color: "#9BAFC4", fontSize: 12, lineHeight: 18, marginTop: 6 },
  saveState: { fontSize: 11, fontWeight: "800", marginTop: 7 },
  state: { fontSize: 10, fontWeight: "900", marginLeft: 8 },
  notice: { backgroundColor: "#162235", borderRadius: 16, padding: 15, marginTop: 23 },
  noticeTitle: { color: "#F4C662", fontWeight: "900" },
  noticeText: { color: "#B4C2D0", fontSize: 13, lineHeight: 19, marginTop: 5 },
});
