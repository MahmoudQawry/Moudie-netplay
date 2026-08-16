import { router } from "expo-router";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { getProfileName } from "@/lib/room-storage";

const QUICK_SYSTEMS = [
  { label: "PSP", caption: "Ad-Hoc وNetPlay", accent: "#62C2EB", symbol: "△" },
  { label: "Famicom", caption: "ألعاب العائلة", accent: "#F4B942", symbol: "▦" },
  { label: "Sega", caption: "Genesis وMega Drive", accent: "#F26B5B", symbol: "◇" },
];
const APP_VERSION = Constants.expoConfig?.version ?? "1.1.0";

export default function LobbyScreen() {
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    getProfileName().then(setProfileName);
  }, []);

  return (
    <ScreenContainer className="px-5">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View><Text style={styles.brand}>MOUDIE</Text><Text style={styles.brandSmall}>NETPLAY</Text></View>
          <View style={styles.profile}><Text style={styles.profileIcon}>◉</Text><Text style={styles.profileName}>{profileName || "لاعب جديد"}</Text></View>
        </View>
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <Text style={styles.eyebrow}>العب مع من تعرف</Text>
          <Text style={styles.title}>غرفة واحدة.{"\n"}نفس اللعبة.</Text>
          <Text style={styles.description}>أنشئ غرفة خاصة، أرسل الرمز، ثم جهزوا محرك اللعب نفسه قبل بدء الجلسة.</Text>
          <View style={styles.heroSymbols}><Text style={styles.heroSymbol}>×</Text><Text style={styles.heroSymbol}>◯</Text><Text style={styles.heroSymbol}>△</Text><Text style={styles.heroSymbol}>□</Text></View>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => { haptic.light(); router.push("/create-room"); }} style={({ pressed }) => [styles.primaryAction, pressed && styles.primaryPressed]}>
            <Text style={styles.primaryActionIcon}>＋</Text><Text style={styles.primaryActionText}>إنشاء غرفة خاصة</Text>
          </Pressable>
          <Pressable onPress={() => { haptic.light(); router.push("/join-room"); }} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
            <Text style={styles.secondaryActionText}>لديّ رمز دعوة</Text><Text style={styles.secondaryActionArrow}>←</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>ابدأ بالنظام المناسب</Text><Text style={styles.sectionCaption}>النسخة الأولى</Text></View>
        <View style={styles.systems}>
          {QUICK_SYSTEMS.map((system) => <View key={system.label} style={styles.systemCard}><Text style={[styles.systemSymbol, { color: system.accent }]}>{system.symbol}</Text><Text style={styles.systemName}>{system.label}</Text><Text style={styles.systemCaption}>{system.caption}</Text></View>)}
        </View>
        <View style={styles.note}><Text style={styles.noteTitle}>ما الذي يجعل الجلسة متوافقة؟</Text><Text style={styles.noteText}>تطابق ملف اللعبة، إصدار المحرك، وإعدادات الغرفة. تبقى ملفاتك الخاصة على جهازك دائماً.</Text></View>
        <View style={styles.versionRow}><Text style={styles.versionText}>Moudie NetPlay · الإصدار {APP_VERSION}</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 13, paddingBottom: 30 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { color: "#F3F7FB", fontSize: 18, fontWeight: "900", letterSpacing: 1.6 },
  brandSmall: { color: "#62C2EB", fontSize: 9, fontWeight: "900", letterSpacing: 2.6, marginTop: -2 },
  profile: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1D2A3C", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99 },
  profileIcon: { color: "#62C2EB", fontSize: 13 }, profileName: { color: "#DCE7F1", fontSize: 12, fontWeight: "800" },
  hero: { backgroundColor: "#173C5D", borderRadius: 25, marginTop: 25, padding: 23, overflow: "hidden", minHeight: 253 },
  heroGlow: { position: "absolute", width: 210, height: 210, borderRadius: 105, backgroundColor: "#146C94", opacity: 0.55, right: -73, top: -50 },
  eyebrow: { color: "#92DEFA", fontSize: 13, fontWeight: "900", letterSpacing: 0.6, textAlign: "right" },
  title: { color: "#FFFFFF", fontSize: 32, lineHeight: 39, fontWeight: "900", textAlign: "right", marginTop: 9 },
  description: { color: "#C9E2EE", fontSize: 14, lineHeight: 21, textAlign: "right", marginTop: 10, maxWidth: 265, alignSelf: "flex-end" },
  heroSymbols: { flexDirection: "row", gap: 10, position: "absolute", left: 24, bottom: 20 },
  heroSymbol: { color: "#B7E9FA", fontSize: 18, fontWeight: "900" },
  actions: { gap: 10, marginTop: 17 },
  primaryAction: { minHeight: 56, backgroundColor: "#F26B5B", borderRadius: 17, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  primaryActionIcon: { color: "#FFFFFF", fontSize: 23, fontWeight: "400" },
  primaryActionText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  secondaryAction: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: "#3B5874", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  secondaryActionText: { color: "#DCE7F1", fontSize: 15, fontWeight: "800" }, secondaryActionArrow: { color: "#62C2EB", fontSize: 20 },
  sectionHeader: { marginTop: 27, marginBottom: 11, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: "#F3F7FB", fontSize: 17, fontWeight: "900" }, sectionCaption: { color: "#8398AC", fontSize: 12, fontWeight: "700" },
  systems: { flexDirection: "row", gap: 9 },
  systemCard: { flex: 1, minHeight: 125, backgroundColor: "#1D2A3C", borderColor: "#30445E", borderWidth: 1, borderRadius: 17, padding: 13, justifyContent: "space-between" },
  systemSymbol: { fontSize: 20, fontWeight: "900", textAlign: "right" }, systemName: { color: "#F3F7FB", fontSize: 15, fontWeight: "900", textAlign: "right", marginTop: 10 }, systemCaption: { color: "#9BAFC4", fontSize: 10, lineHeight: 14, textAlign: "right", marginTop: 4 },
  note: { backgroundColor: "#162235", borderLeftColor: "#F4B942", borderLeftWidth: 3, borderRadius: 15, padding: 14, marginTop: 20 },
  noteTitle: { color: "#F4C662", fontSize: 13, fontWeight: "900", textAlign: "right" }, noteText: { color: "#B4C2D0", fontSize: 12, lineHeight: 19, textAlign: "right", marginTop: 4 },
  versionRow: { alignItems: "center", marginTop: 18, marginBottom: 6 },
  versionText: { color: "#71839A", fontSize: 11, fontWeight: "800", letterSpacing: 0.25 },
  primaryPressed: { opacity: 0.87, transform: [{ scale: 0.98 }] }, pressed: { opacity: 0.72 },
});
