import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { getProfileName, saveProfileName } from "@/lib/room-storage";

export default function SettingsScreen() {
  const [name, setName] = useState("");
  useEffect(() => { getProfileName().then((saved) => saved && setName(saved)); }, []);
  const save = async () => {
    if (name.trim().length < 2) { haptic.error(); Alert.alert("الاسم قصير", "اكتب حرفين على الأقل."); return; }
    await saveProfileName(name); haptic.success(); Alert.alert("تم الحفظ", "سيظهر هذا الاسم عند دخول الغرف الجديدة.");
  };
  return (
    <ScreenContainer className="px-5"><ScrollView contentContainerStyle={styles.content}><Text style={styles.eyebrow}>الإعدادات</Text><Text style={styles.title}>هويتك وخصوصيتك</Text><Text style={styles.label}>الاسم الظاهر</Text><TextInput value={name} onChangeText={setName} placeholder="اسمك داخل الغرف" placeholderTextColor="#74869C" textAlign="right" style={styles.input} returnKeyType="done" /><Pressable onPress={save} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>حفظ الاسم</Text></Pressable><View style={styles.privacy}><Text style={styles.privacyTitle}>خصوصية الجلسة</Text><Text style={styles.privacyText}>رمز عضويتك للغرفة محفوظ بشكل آمن على جهازك. لا يحمل التطبيق أي ملفات ألعاب ولا يرسلها إلى الخدمة.</Text></View><View style={styles.info}><Text style={styles.infoLabel}>إصدار الواجهة</Text><Text style={styles.infoValue}>نسخة أولية للغرف الخاصة</Text></View></ScrollView></ScreenContainer>
  );
}

const styles = StyleSheet.create({ content: { paddingTop: 17, paddingBottom: 28 }, eyebrow: { color: "#62C2EB", fontSize: 13, fontWeight: "900", letterSpacing: 0.8, textAlign: "right" }, title: { color: "#F3F7FB", fontSize: 29, fontWeight: "900", textAlign: "right", marginTop: 5 }, label: { color: "#DCE7F1", fontSize: 15, fontWeight: "800", textAlign: "right", marginTop: 26, marginBottom: 9 }, input: { backgroundColor: "#1D2A3C", borderRadius: 14, borderWidth: 1, borderColor: "#30445E", minHeight: 52, paddingHorizontal: 14, color: "#F3F7FB", fontSize: 16 }, button: { minHeight: 50, borderRadius: 15, backgroundColor: "#146C94", alignItems: "center", justifyContent: "center", marginTop: 12 }, buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" }, privacy: { backgroundColor: "#162235", borderRadius: 16, padding: 15, marginTop: 26 }, privacyTitle: { color: "#F4C662", fontSize: 14, fontWeight: "900", textAlign: "right" }, privacyText: { color: "#B4C2D0", fontSize: 13, lineHeight: 20, textAlign: "right", marginTop: 5 }, info: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 19, borderBottomWidth: 1, borderBottomColor: "#30445E" }, infoLabel: { color: "#DCE7F1", fontSize: 14, fontWeight: "800" }, infoValue: { color: "#8398AC", fontSize: 13 }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] } });
