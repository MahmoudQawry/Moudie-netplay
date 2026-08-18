import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CustomizableController } from "@/components/customizable-controller";

type SystemId = "famicom" | "ps1" | "psp" | "sega" | "arcade";

const systemMeta: Record<SystemId, { name: string; initials: string; accent: string; status: string }> = {
  famicom: { name: "Famicom / NES", initials: "NES", accent: "#F5C84C", status: "محرك العائلة" },
  ps1: { name: "PlayStation 1", initials: "PS1", accent: "#B978FF", status: "محرك PS1" },
  psp: { name: "PlayStation Portable", initials: "PSP", accent: "#45DDFC", status: "محرك PSP" },
  sega: { name: "Sega Genesis", initials: "SEGA", accent: "#70E39B", status: "محرك Sega" },
  arcade: { name: "Arcade", initials: "ARCADE", accent: "#FF886D", status: "محرك Arcade" },
};

function isSystemId(value: string | string[] | undefined): value is SystemId {
  return typeof value === "string" && value in systemMeta;
}

export default function LocalPlayScreen() {
  const { system: rawSystem, mode } = useLocalSearchParams<{ system?: string; mode?: string }>();
  const system: SystemId = isSystemId(rawSystem) ? rawSystem : "famicom";
  const meta = systemMeta[system];
  const [editing, setEditing] = useState(false);
  const [lastButton, setLastButton] = useState<string | null>(null);
  const localMode = mode !== "room";

  return (
    <View style={styles.screen}>
      <StatusBar style="light" hidden />
      <View style={styles.canvas}>
        <View style={styles.topOverlay}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} accessibilityLabel="العودة">
            <MaterialCommunityIcons name="arrow-right" size={21} color="#FFFFFF" />
          </Pressable>
          <View style={styles.telemetry}>
            <View style={styles.stat}><Text style={styles.statLabel}>FPS</Text><Text style={[styles.statValue, { color: meta.accent }]}>—</Text></View>
            <View style={styles.divider} />
            <View style={styles.stat}><Text style={styles.statLabel}>PING</Text><Text style={styles.statValue}>{localMode ? "محلي" : "— ms"}</Text></View>
            <View style={styles.divider} />
            <View style={styles.stat}><Text style={styles.statLabel}>PLAYER</Text><Text style={styles.statValue}>P1</Text></View>
          </View>
          <Pressable onPress={() => setEditing((value) => !value)} style={({ pressed }) => [styles.customizeButton, editing && [styles.customizeButtonActive, { borderColor: meta.accent }], pressed && styles.pressed]}>
            <MaterialCommunityIcons name={editing ? "content-save-check-outline" : "tune-variant"} size={18} color={editing ? meta.accent : "#FFFFFF"} />
            <Text style={[styles.customizeText, editing && { color: meta.accent }]}>{editing ? "حفظ" : "تخصيص"}</Text>
          </Pressable>
        </View>

        <View pointerEvents="none" style={styles.centerBrand}>
          <Text style={[styles.centerInitials, { color: `${meta.accent}33` }]}>{meta.initials}</Text>
          {editing ? <Text style={styles.editHint}>اسحب كل زر إلى المكان المناسب ثم اضغط «حفظ»</Text> : <Text style={styles.engineHint}>{meta.status} · {localMode ? "لعب محلي" : "غرفة متصلة"}</Text>}
          {lastButton && !editing && <Text style={styles.buttonHint}>زر {lastButton}</Text>}
        </View>

        <CustomizableController
          system={system}
          editable={editing}
          onButtonChange={(button, down) => { if (down) setLastButton(button); }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  canvas: { flex: 1, backgroundColor: "#000000" },
  topOverlay: { position: "absolute", zIndex: 20, top: 16, left: 14, right: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconButton: { width: 38, height: 38, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(24, 20, 33, 0.86)", borderWidth: 1, borderColor: "#332B46" },
  telemetry: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(9, 9, 12, 0.8)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "#2A2633" },
  stat: { alignItems: "center", minWidth: 42 },
  statLabel: { color: "#85808D", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  statValue: { color: "#F9F7FF", fontSize: 10, fontWeight: "900", marginTop: 1 },
  divider: { height: 20, width: 1, backgroundColor: "#2E2936" },
  customizeButton: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 38, paddingHorizontal: 10, borderRadius: 15, backgroundColor: "rgba(24, 20, 33, 0.86)", borderWidth: 1, borderColor: "#332B46" },
  customizeButtonActive: { backgroundColor: "rgba(85, 47, 130, 0.32)" },
  customizeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  centerBrand: { position: "absolute", zIndex: 1, top: "24%", left: 20, right: 20, alignItems: "center" },
  centerInitials: { fontSize: 58, fontWeight: "900", letterSpacing: 4 },
  engineHint: { color: "#58515E", fontSize: 11, fontWeight: "800", marginTop: 8 },
  editHint: { color: "#CFC6DF", fontSize: 12, fontWeight: "800", marginTop: 8, textAlign: "center" },
  buttonHint: { color: "#8B8197", fontSize: 10, fontWeight: "800", marginTop: 5 },
  pressed: { opacity: 0.7 },
});
