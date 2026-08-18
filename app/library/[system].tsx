import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { NeonCircuitBackground } from "@/components/neon-circuit-background";
import { ScreenContainer } from "@/components/screen-container";
import MoudieEmulatorModule from "@/modules/moudie-emulator/src/MoudieEmulatorModule";
import type { EmulatorCoreCapability, EmulatorSystem } from "@/modules/moudie-emulator/src/MoudieEmulator.types";

const routeSystems: Record<string, EmulatorSystem> = { famicom: "nes", nes: "nes", ps1: "ps1", psp: "psp", sega: "sega", arcade: "arcade" };

const displayMeta: Record<EmulatorSystem, { title: string; subtitle: string; color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  nes: { title: "Famicom / NES", subtitle: "Classic controller · Up to 4 controller slots when supported", color: "#F6C453", icon: "controller-classic-outline" },
  ps1: { title: "PlayStation 1", subtitle: "PCSX-ReARMed · Save states and full controller editing", color: "#B978FF", icon: "sony-playstation" },
  psp: { title: "PlayStation Portable", subtitle: "PPSSPP · PSP network profile for supported games", color: "#33D8FF", icon: "gamepad-outline" },
  sega: { title: "Sega Genesis", subtitle: "Genesis Plus GX · 3 or 6 button layouts", color: "#68E69A", icon: "gamepad-variant-outline" },
  arcade: { title: "Arcade", subtitle: "MAME Arcade · Arcade controls and COIN support", color: "#FF8364", icon: "controller-classic-outline" },
};

export default function EmulatorLibraryScreen() {
  const { system: rawSystem } = useLocalSearchParams<{ system?: string }>();
  const system = routeSystems[rawSystem || "famicom"] ?? "nes";
  const meta = displayMeta[system];
  const [capability, setCapability] = useState<EmulatorCoreCapability | null>(null);
  const [loading, setLoading] = useState(false);
  const [installingCore, setInstallingCore] = useState(false);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  const [aspectRatio, setAspectRatio] = useState<"fit" | "4:3" | "16:9">("4:3");

  useEffect(() => { setCapability(MoudieEmulatorModule.getCoreCatalog().find((item) => item.system === system) ?? null); }, [system]);

  const accepted = useMemo(() => capability?.acceptedExtensions.length ? capability.acceptedExtensions.map((extension) => `.${extension.toUpperCase()}`).join(" · ") : "Shown inside the Android APK", [capability]);

  const chooseGame = async () => {
    if (!capability || (!capability.available && !capability.downloadable)) {
      Alert.alert("Android core required", capability?.message || "Install the full Android APK to run this emulator.");
      return;
    }
    try {
      setLoading(true);
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: "*/*" });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri || !asset.name) throw new Error("Could not select a game file.");
      await MoudieEmulatorModule.launchNativeGame(system, asset.uri, asset.name, { orientation, aspectRatio, settingsMode: false });
    } catch (error) {
      Alert.alert("Could not start the game", error instanceof Error ? error.message : "An unexpected error occurred while opening the game file.");
    } finally { setLoading(false); }
  };

  const installArcadeCore = async () => {
    try {
      setInstallingCore(true);
      const result = await MoudieEmulatorModule.prepareNativeCore("arcade");
      setCapability((current) => current ? { ...current, available: result.available, downloadable: false, message: result.message } : current);
      Alert.alert("Arcade core ready", result.message);
    } catch (error) {
      Alert.alert("Could not install Arcade", error instanceof Error ? error.message : "Check your internet connection and storage, then try again.");
    } finally {
      setInstallingCore(false);
    }
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]} containerClassName="bg-background">
      <NeonCircuitBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Back"><MaterialCommunityIcons name="arrow-left" color="#FFFFFF" size={22} /></Pressable><Text style={styles.headerText}>EMULATOR LIBRARY</Text></View>
        <View style={[styles.hero, { borderColor: `${meta.color}88` }]}>
          <View style={[styles.heroGlow, { backgroundColor: meta.color }]} /><View style={[styles.iconShell, { borderColor: meta.color }]}><MaterialCommunityIcons name={meta.icon} size={45} color={meta.color} /></View>
          <Text style={styles.title}>{meta.title}</Text><Text style={styles.subtitle}>{meta.subtitle}</Text>
          <View style={styles.coreRow}><Text style={[styles.coreName, { color: meta.color }]}>{capability?.coreName || "CHECKING CORE"}</Text><View style={[styles.statusDot, { backgroundColor: capability?.available ? "#62E9A1" : capability?.downloadable ? "#75E9FF" : "#FFB677" }]} /><Text style={styles.statusText}>{capability?.available ? "CORE READY" : capability?.downloadable ? "DOWNLOADS AT FIRST LAUNCH" : "ANDROID APK REQUIRED"}</Text></View>
        </View>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>HOW THIS EMULATOR WORKS</Text>
          <Text style={styles.panelText}>Choose a legal game file stored on your device. Moudie never uploads your game or BIOS. Configure portrait and landscape controls before playing; the game screen remains free of move and resize tools.</Text>
          {system === "ps1" && <Text style={styles.isoNotice}>PS1 supports ISO files as well as BIN, CUE, CHD, and PBP.</Text>}
          <View style={styles.detailRow}><MaterialCommunityIcons name="file-outline" color="#75E9FF" size={18} /><Text style={styles.detailText}>Supported extensions: {accepted}</Text></View>
          <View style={styles.detailRow}><MaterialCommunityIcons name="cellphone-link" color="#C98AFF" size={18} /><Text style={styles.detailText}>Portrait and landscape play are both supported with independent controller layouts.</Text></View>
          <View style={styles.detailRow}><MaterialCommunityIcons name="content-save-outline" color="#F8CF68" size={18} /><Text style={styles.detailText}>Local save/load state is available from the in-game toolbar.</Text></View>
        </View>
        {system === "arcade" && capability?.downloadable && !capability.available && <Pressable onPress={installArcadeCore} disabled={installingCore} style={({ pressed }) => [styles.arcadeInstall, (pressed || installingCore) && styles.launchPressed]}>{installingCore ? <ActivityIndicator color="#071018" /> : <MaterialCommunityIcons name="download" size={22} color="#071018" />}<Text style={styles.arcadeInstallText}>{installingCore ? "DOWNLOADING MAME ARCADE CORE…" : "INSTALL MAME ARCADE CORE"}</Text></Pressable>}
        <View style={styles.settingsPanel}>
          <Text style={styles.settingsTitle}>EMULATOR SETTINGS</Text>
          <Text style={styles.settingsLabel}>PLAY ORIENTATION</Text>
          <View style={styles.settingRow}>{(["portrait", "landscape"] as const).map((value) => <Pressable key={value} onPress={() => setOrientation(value)} style={[styles.settingOption, orientation === value && { borderColor: meta.color, backgroundColor: `${meta.color}28` }]}><Text style={styles.settingOptionText}>{value.toUpperCase()}</Text></Pressable>)}</View>
          <Text style={styles.settingsLabel}>SCREEN RATIO</Text>
          <View style={styles.settingRow}>{(["fit", "4:3", "16:9"] as const).map((value) => <Pressable key={value} onPress={() => setAspectRatio(value)} style={[styles.settingOption, aspectRatio === value && { borderColor: meta.color, backgroundColor: `${meta.color}28` }]}><Text style={styles.settingOptionText}>{value === "fit" ? "FIT" : value}</Text></Pressable>)}</View>
        </View>
        <Pressable onPress={chooseGame} disabled={loading} style={({ pressed }) => [styles.launch, { backgroundColor: meta.color }, (pressed || loading) && styles.launchPressed]}>{loading ? <ActivityIndicator color="#09121D" /> : <MaterialCommunityIcons name="folder-open-outline" size={23} color="#09121D" />}<Text style={styles.launchText}>{loading ? "PREPARING GAME…" : capability?.downloadable && !capability.available ? "CHOOSE GAME & DOWNLOAD CORE" : "CHOOSE GAME & START"}</Text></Pressable>
        <Text style={styles.legal}>By choosing a file, you confirm that you have the right to use it. Moudie does not include ROMs or BIOS files.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 36 }, header: { height: 48, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 }, back: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#1A1530", borderWidth: 1, borderColor: "#3D315B" }, headerText: { color: "#F8F5FF", fontSize: 17, fontWeight: "900", letterSpacing: .4 },
  hero: { overflow: "hidden", backgroundColor: "#160E2B", borderWidth: 1, borderRadius: 26, padding: 23, alignItems: "center" }, heroGlow: { position: "absolute", width: 210, height: 210, borderRadius: 110, opacity: .14, top: -95 }, iconShell: { width: 82, height: 82, borderRadius: 27, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.2)" }, title: { color: "#FFFFFF", fontSize: 23, fontWeight: "900", marginTop: 14 }, subtitle: { color: "#C6BFD7", fontSize: 11, textAlign: "center", lineHeight: 18, marginTop: 6 }, coreRow: { marginTop: 15, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 11, borderRadius: 14, backgroundColor: "rgba(4, 11, 24, .5)" }, coreName: { fontSize: 10, fontWeight: "900" }, statusDot: { width: 7, height: 7, borderRadius: 4 }, statusText: { color: "#B7B0C8", fontSize: 9, fontWeight: "800" },
  panel: { marginTop: 17, borderRadius: 22, padding: 17, backgroundColor: "#151127", borderWidth: 1, borderColor: "#332A4D" }, panelTitle: { color: "#F8F5FF", fontSize: 14, fontWeight: "900" }, panelText: { color: "#BDB6CC", fontSize: 11, lineHeight: 18, marginTop: 8 }, isoNotice: { color: "#D7B5FF", fontSize: 11, lineHeight: 17, marginTop: 10, fontWeight: "800" }, detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderTopWidth: 1, borderTopColor: "#2A233E", paddingTop: 10, marginTop: 10 }, detailText: { color: "#D4CEDF", fontSize: 10, lineHeight: 16, flex: 1 },
  settingsPanel: { marginTop: 17, borderRadius: 22, padding: 17, backgroundColor: "#101C2C", borderWidth: 1, borderColor: "#284865" }, settingsTitle: { color: "#DFF7FF", fontSize: 14, fontWeight: "900" }, settingsLabel: { color: "#91BED4", fontSize: 10, fontWeight: "900", marginTop: 13 }, settingRow: { flexDirection: "row", gap: 8, marginTop: 7 }, settingOption: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "#38536A", backgroundColor: "#13283A" }, settingOptionText: { color: "#F2F8FC", fontSize: 10, fontWeight: "900" },
  arcadeInstall: { marginTop: 17, minHeight: 53, borderRadius: 17, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9, backgroundColor: "#FF8364" }, arcadeInstallText: { color: "#071018", fontSize: 12, fontWeight: "900" },
  launch: { marginTop: 18, minHeight: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 }, launchText: { color: "#08111B", fontSize: 13, fontWeight: "900" }, launchPressed: { opacity: .7, transform: [{ scale: .987 }] }, legal: { color: "#7F7892", fontSize: 9, lineHeight: 15, textAlign: "center", marginTop: 12, paddingHorizontal: 15 },
});
