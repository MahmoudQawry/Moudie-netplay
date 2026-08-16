import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { SAVE_STATE_CAPABILITIES, type EmulatorSystemId } from "@/lib/emulator-save-state-capabilities";

const systems = [
  { id: "psp" as const, name: "PSP", engine: "PPSSPP", state: "بانتظار المحرك", color: "#62C2EB", description: "سيظهر الحفظ والاسترجاع المحليان تلقائياً عند دمج مشغّل PSP فعلي؛ لا يمكن إنشاء حالة حفظ من دون محرك لعبة." },
  { id: "nes" as const, name: "Famicom / NES", engine: "FCEUmm / JSNES", state: "جاهز", color: "#F4B942", description: "تبدأ الجلسة بعد مطابقة المحرك واللعبة لدى الأصدقاء." },
  { id: "sega" as const, name: "Sega", engine: "RetroArch", state: "بانتظار المحرك", color: "#F26B5B", description: "سيظهر الحفظ والاسترجاع المحليان تلقائياً عند دمج مشغّل Sega فعلي؛ لا يمكن إنشاء حالة حفظ من دون محرك لعبة." },
  { id: "ps1" as const, name: "PS1", engine: "PCSX ReARMed", state: "جاهز", color: "#9F8DF5", description: "الحفظ والاسترجاع متاحان محلياً داخل مشغّل PS1." },
];

export default function LibraryScreen() {
  return (
    <ScreenContainer className="px-5">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>المكتبة</Text><Text style={styles.title}>الأنظمة والمحركات</Text><Text style={styles.subtitle}>تحدد الغرفة النظام، ثم يتأكد التطبيق من محرك NetPlay المناسب قبل اللعب.</Text>
        <View style={styles.list}>{systems.map((system) => { const saveCapability = SAVE_STATE_CAPABILITIES[system.id satisfies EmulatorSystemId]; return <View key={system.name} style={styles.card}><View style={[styles.icon, { backgroundColor: system.color }]}><Text style={styles.iconText}>{system.name === "PSP" ? "△" : "◈"}</Text></View><View style={styles.cardBody}><Text style={styles.name}>{system.name}</Text><Text style={styles.engine}>{system.engine}</Text><Text style={styles.description}>{system.description}</Text><Text style={[styles.saveState, { color: saveCapability.available ? "#83E0B1" : "#9BAFC4" }]}>{saveCapability.label}</Text></View><Text style={[styles.state, { color: system.color }]}>{system.state}</Text></View>})}</View>
        <View style={styles.notice}><Text style={styles.noticeTitle}>الملفات تبقى محلية</Text><Text style={styles.noticeText}>Moudie NetPlay ينظم الغرفة والتحقق فقط؛ لا يقدم ألعاباً أو ينقل ملفاتك بين اللاعبين.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 17, paddingBottom: 28 }, eyebrow: { color: "#62C2EB", fontSize: 13, fontWeight: "900", letterSpacing: 0.8, textAlign: "right" }, title: { color: "#F3F7FB", fontSize: 29, fontWeight: "900", textAlign: "right", marginTop: 5 }, subtitle: { color: "#9BAFC4", fontSize: 14, lineHeight: 21, textAlign: "right", marginTop: 8 }, list: { gap: 11, marginTop: 24 }, card: { backgroundColor: "#1D2A3C", borderRadius: 18, borderWidth: 1, borderColor: "#30445E", padding: 14, flexDirection: "row", alignItems: "flex-start" }, icon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, iconText: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" }, cardBody: { flex: 1, marginLeft: 11 }, name: { color: "#F3F7FB", fontSize: 16, fontWeight: "900", textAlign: "right" }, engine: { color: "#7DCBE9", fontSize: 12, fontWeight: "800", textAlign: "right", marginTop: 2 }, description: { color: "#9BAFC4", fontSize: 12, lineHeight: 18, textAlign: "right", marginTop: 6 }, saveState: { fontSize: 11, fontWeight: "800", textAlign: "right", marginTop: 7 }, state: { fontSize: 10, fontWeight: "900", marginLeft: 8 }, notice: { backgroundColor: "#162235", borderRadius: 16, padding: 15, marginTop: 23 }, noticeTitle: { color: "#F4C662", fontWeight: "900", textAlign: "right" }, noticeText: { color: "#B4C2D0", fontSize: 13, lineHeight: 19, textAlign: "right", marginTop: 5 } });
