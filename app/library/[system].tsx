import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { NeonCircuitBackground } from "@/components/neon-circuit-background";
import { ScreenContainer } from "@/components/screen-container";
import MoudieEmulatorModule from "@/modules/moudie-emulator/src/MoudieEmulatorModule";
import type { EmulatorCoreCapability, EmulatorSystem } from "@/modules/moudie-emulator/src/MoudieEmulator.types";

const routeSystems: Record<string, EmulatorSystem> = {
  famicom: "nes",
  nes: "nes",
  ps1: "ps1",
  psp: "psp",
  sega: "sega",
  arcade: "arcade",
};

const displayMeta: Record<EmulatorSystem, { title: string; subtitle: string; color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  nes: { title: "Famicom / NES", subtitle: "يد عائلة كلاسيكية · حتى 4 مقاعد عند دعم اللعبة", color: "#F6C453", icon: "controller-classic-outline" },
  ps1: { title: "PlayStation 1", subtitle: "PCSX-ReARMed · حفظ حالات وتحكم كامل", color: "#B978FF", icon: "gamepad-variant-outline" },
  psp: { title: "PlayStation Portable", subtitle: "PPSSPP · شبكة PSP مخصصة للألعاب الداعمة", color: "#33D8FF", icon: "sony-playstation" },
  sega: { title: "Sega Genesis", subtitle: "Genesis Plus GX · تخطيط 3 أو 6 أزرار", color: "#68E69A", icon: "gamepad-variant-outline" },
  arcade: { title: "Arcade", subtitle: "MAME Arcade · أزرار الآركيد والـCOIN", color: "#FF8364", icon: "controller-classic-outline" },
};

export default function EmulatorLibraryScreen() {
  const { system: rawSystem } = useLocalSearchParams<{ system?: string }>();
  const system = routeSystems[rawSystem || "famicom"] ?? "nes";
  const meta = displayMeta[system];
  const [capability, setCapability] = useState<EmulatorCoreCapability | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const current = MoudieEmulatorModule.getCoreCatalog().find((item) => item.system === system) ?? null;
    setCapability(current);
  }, [system]);

  const accepted = useMemo(() => capability?.acceptedExtensions.length ? capability.acceptedExtensions.map((extension) => `.${extension}`).join(" · ") : "يظهر الدعم داخل APK", [capability]);

  const chooseGame = async () => {
    if (!capability || (!capability.available && !capability.downloadable)) {
      Alert.alert("محرك Android مطلوب", capability?.message || "ثبّت APK الكامل لتشغيل هذا المحاكي.");
      return;
    }
    try {
      setLoading(true);
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: "*/*" });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri || !asset.name) throw new Error("تعذر اختيار ملف اللعبة.");
      await MoudieEmulatorModule.launchNativeGame(system, asset.uri, asset.name);
    } catch (error) {
      Alert.alert("تعذر بدء اللعبة", error instanceof Error ? error.message : "حدث خطأ غير متوقع أثناء فتح ملف اللعبة.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]} containerClassName="bg-background">
      <NeonCircuitBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="العودة">
            <MaterialCommunityIcons name="arrow-right" color="#FFFFFF" size={22} />
          </Pressable>
          <Text style={styles.headerText}>مكتبة المحاكي</Text>
        </View>

        <View style={[styles.hero, { borderColor: `${meta.color}88` }]}>
          <View style={[styles.heroGlow, { backgroundColor: meta.color }]} />
          <View style={[styles.iconShell, { borderColor: meta.color }]}>
            <MaterialCommunityIcons name={meta.icon} size={45} color={meta.color} />
          </View>
          <Text style={styles.title}>{meta.title}</Text>
          <Text style={styles.subtitle}>{meta.subtitle}</Text>
          <View style={styles.coreRow}>
            <Text style={[styles.coreName, { color: meta.color }]}>{capability?.coreName || "جارٍ التحقق"}</Text>
            <View style={[styles.statusDot, { backgroundColor: capability?.available ? "#62E9A1" : capability?.downloadable ? "#75E9FF" : "#FFB677" }]} />
            <Text style={styles.statusText}>{capability?.available ? "المحرك جاهز" : capability?.downloadable ? "يُنزل عند أول تشغيل" : "يتطلب APK Android"}</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>كيف يعمل هذا المحاكي؟</Text>
          <Text style={styles.panelText}>اختر ملف لعبتك المرخص محليًا. لن يرفع التطبيق ملف اللعبة أو BIOS إلى الخادم. داخل اللعبة يمكنك الضغط على «ضبط» لسحب الأزرار وتكبيرها أو تصغيرها؛ ويحفظ ترتيب كل منصة واتجاه شاشة منفصلًا. {capability?.downloadable && !capability.available ? "سيُنزل محرك الآركيد الرسمي من المصدر الموثوق عند أول تشغيل، لذلك يلزم اتصال إنترنت ومساحة تخزين كافية." : ""}</Text>
          <View style={styles.detailRow}><MaterialCommunityIcons name="file-outline" color="#75E9FF" size={18} /><Text style={styles.detailText}>الامتدادات: {accepted}</Text></View>
          <View style={styles.detailRow}><MaterialCommunityIcons name="account-group-outline" color="#C98AFF" size={18} /><Text style={styles.detailText}>الغرفة: حتى {capability?.maxRoomMembers || 10} أعضاء؛ مقاعد اللعب الفعلية: {capability?.maxControllerSlots || "—"}</Text></View>
          <View style={styles.detailRow}><MaterialCommunityIcons name="content-save-outline" color="#F8CF68" size={18} /><Text style={styles.detailText}>حفظ/تحميل حالة محلية تلقائيًا مع زر حفظ يدوي.</Text></View>
        </View>

        <Pressable onPress={chooseGame} disabled={loading} style={({ pressed }) => [styles.launch, { backgroundColor: meta.color }, (pressed || loading) && styles.launchPressed]}>
          {loading ? <ActivityIndicator color="#09121D" /> : <MaterialCommunityIcons name="folder-open-outline" size={23} color="#09121D" />}
          <Text style={styles.launchText}>{loading ? "جارٍ تجهيز اللعبة…" : capability?.downloadable && !capability.available ? "اختر لعبة ونزّل المحرك" : "اختر لعبة وابدأ"}</Text>
        </Pressable>
        <Text style={styles.legal}>باختيار ملف، تؤكد أنك تملك حق استخدامه. لا يتضمن Moudie أي ROM أو BIOS.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 36 },
  header: { height: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  back: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#1A1530", borderWidth: 1, borderColor: "#3D315B" },
  headerText: { color: "#F8F5FF", fontSize: 18, fontWeight: "900" },
  hero: { overflow: "hidden", backgroundColor: "#160E2B", borderWidth: 1, borderRadius: 26, padding: 23, alignItems: "center" },
  heroGlow: { position: "absolute", width: 210, height: 210, borderRadius: 110, opacity: 0.14, top: -95 },
  iconShell: { width: 82, height: 82, borderRadius: 27, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.2)" },
  title: { color: "#FFFFFF", fontSize: 23, fontWeight: "900", marginTop: 14 },
  subtitle: { color: "#C6BFD7", fontSize: 11, textAlign: "center", lineHeight: 18, marginTop: 6 },
  coreRow: { marginTop: 15, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 11, borderRadius: 14, backgroundColor: "rgba(4, 11, 24, 0.5)" },
  coreName: { fontSize: 10, fontWeight: "900" },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: "#B7B0C8", fontSize: 10, fontWeight: "800" },
  panel: { marginTop: 17, borderRadius: 22, padding: 17, backgroundColor: "#151127", borderWidth: 1, borderColor: "#332A4D" },
  panelTitle: { color: "#F8F5FF", fontSize: 14, fontWeight: "900", textAlign: "right" },
  panelText: { color: "#BDB6CC", fontSize: 11, lineHeight: 18, textAlign: "right", marginTop: 8 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderTopWidth: 1, borderTopColor: "#2A233E", paddingTop: 10, marginTop: 10 },
  detailText: { color: "#D4CEDF", fontSize: 10, lineHeight: 16, textAlign: "right", flex: 1 },
  launch: { marginTop: 18, minHeight: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  launchText: { color: "#08111B", fontSize: 15, fontWeight: "900" },
  launchPressed: { opacity: 0.7, transform: [{ scale: 0.987 }] },
  legal: { color: "#7F7892", fontSize: 9, lineHeight: 15, textAlign: "center", marginTop: 12, paddingHorizontal: 15 },
});
