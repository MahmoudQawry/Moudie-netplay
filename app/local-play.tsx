import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { NeonCircuitBackground } from "@/components/neon-circuit-background";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";

type SystemId = "famicom" | "ps1" | "psp" | "sega" | "arcade";

const SYSTEMS: { id: SystemId; title: string; detail: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; accent: string }[] = [
  { id: "famicom", title: "Famicom / NES", detail: "FCEUmm · Classic 8-bit", icon: "controller-classic-outline", accent: "#F6C453" },
  { id: "ps1", title: "PlayStation 1", detail: "PCSX-ReARMed · BIN, CUE, ISO, CHD, PBP", icon: "sony-playstation", accent: "#B978FF" },
  { id: "psp", title: "PlayStation Portable", detail: "PPSSPP · ISO, CSO, CHD, PBP", icon: "gamepad-outline", accent: "#33D8FF" },
  { id: "sega", title: "Sega Genesis", detail: "Genesis Plus GX · 3 / 6 button layout", icon: "gamepad-variant-outline", accent: "#68E69A" },
  { id: "arcade", title: "Arcade", detail: "MAME · Core downloads at first launch", icon: "controller-classic-outline", accent: "#FF8364" },
];

export default function LocalPlayPickerScreen() {
  const openSystem = (system: SystemId) => {
    haptic.light();
    router.push({ pathname: "/library/[system]" as never, params: { system } } as never);
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]} containerClassName="bg-background">
      <NeonCircuitBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityLabel="Back"><MaterialCommunityIcons name="arrow-left" color="#FFFFFF" size={22} /></Pressable>
          <View><Text style={styles.eyebrow}>LOCAL PLAY</Text><Text style={styles.title}>Choose your system</Text></View>
        </View>
        <Text style={styles.subtitle}>Select one of the five emulators. Your game files, saves, and control layouts stay on this device.</Text>

        <View style={styles.list}>
          {SYSTEMS.map((system) => (
            <Pressable key={system.id} onPress={() => openSystem(system.id)} style={({ pressed }) => [styles.card, { borderColor: `${system.accent}88` }, pressed && styles.pressed]}>
              <View style={[styles.icon, { backgroundColor: `${system.accent}1F`, borderColor: system.accent }]}><MaterialCommunityIcons name={system.icon} size={30} color={system.accent} /></View>
              <View style={styles.copy}><Text style={styles.cardTitle}>{system.title}</Text><Text style={styles.cardDetail}>{system.detail}</Text></View>
              <MaterialCommunityIcons name="chevron-right" size={26} color={system.accent} />
            </Pressable>
          ))}
        </View>

        <View style={styles.notice}><MaterialCommunityIcons name="tune-variant" size={21} color="#7AE8FF" /><Text style={styles.noticeText}>Every emulator supports separate portrait and landscape control layouts. Use EDIT to drag a control, then SIZE − / + or pinch to resize it.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 34 },
  header: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14 },
  back: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#1A1530", borderWidth: 1, borderColor: "#3D315B" },
  eyebrow: { color: "#70E9FF", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: "#F8F5FF", fontSize: 24, fontWeight: "900", marginTop: 2 },
  subtitle: { color: "#C4BDD4", fontSize: 12, lineHeight: 19, marginTop: 14 },
  list: { gap: 11, marginTop: 20 },
  card: { minHeight: 92, flexDirection: "row", alignItems: "center", gap: 13, padding: 13, borderRadius: 20, borderWidth: 1, backgroundColor: "rgba(20, 14, 37, 0.96)" },
  icon: { height: 58, width: 58, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 }, cardTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" }, cardDetail: { color: "#B9B0CB", fontSize: 10, lineHeight: 15, marginTop: 5 },
  notice: { marginTop: 20, flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: "#101B2D", borderWidth: 1, borderColor: "#275176", borderRadius: 18, padding: 13 },
  noticeText: { flex: 1, color: "#BED0E5", fontSize: 11, lineHeight: 17 }, pressed: { opacity: .72, transform: [{ scale: .987 }] },
});
