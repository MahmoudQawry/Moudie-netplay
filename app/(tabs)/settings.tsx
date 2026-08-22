import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { useLanguage, type AppLanguage } from "@/lib/language";
import { getProfileName, saveProfileName } from "@/lib/room-storage";

export default function SettingsScreen() {
  const [name, setName] = useState("");
  const { language, ready, setLanguage } = useLanguage();
  const ar = language === "ar";

  useEffect(() => { getProfileName().then((saved) => saved && setName(saved)); }, []);

  const save = async () => {
    if (name.trim().length < 2) {
      haptic.error();
      Alert.alert(ar ? "الاسم قصير جدًا" : "Name is too short", ar ? "اكتب حرفين على الأقل." : "Enter at least two characters.");
      return;
    }
    await saveProfileName(name.trim());
    haptic.success();
    Alert.alert(ar ? "تم الحفظ" : "Saved", ar ? "سيظهر هذا الاسم عند انضمامك إلى الغرف الجديدة." : "This name will be shown when you join new rooms.");
  };

  const changeLanguage = async (next: AppLanguage) => {
    if (!ready || next === language) return;
    haptic.light();
    await setLanguage(next);
  };

  return (
    <ScreenContainer className="px-5">
      <ScrollView contentContainerStyle={[styles.content, ar && styles.rtl]}>
        <Text style={styles.eyebrow}>{ar ? "الإعدادات" : "SETTINGS"}</Text>
        <Text style={styles.title}>{ar ? "الهوية والخصوصية" : "Identity & Privacy"}</Text>

        <Text style={styles.label}>{ar ? "لغة البرنامج" : "APP LANGUAGE"}</Text>
        <View style={styles.languageRow}>
          <Pressable onPress={() => void changeLanguage("ar")} style={({ pressed }) => [styles.languageOption, language === "ar" && styles.languageSelected, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected: language === "ar" }}>
            <Text style={[styles.languageCode, language === "ar" && styles.languageCodeSelected]}>ع</Text>
            <View style={styles.languageCopy}>
              <Text style={styles.languageTitle}>{ar ? "العربية" : "Arabic"}</Text>
              <Text style={styles.languageHint}>{ar ? "واجهة عربية" : "Arabic interface"}</Text>
            </View>
            {language === "ar" && <Text style={styles.check}>✓</Text>}
          </Pressable>
          <Pressable onPress={() => void changeLanguage("en")} style={({ pressed }) => [styles.languageOption, language === "en" && styles.languageSelected, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected: language === "en" }}>
            <Text style={[styles.languageCode, language === "en" && styles.languageCodeSelected]}>A</Text>
            <View style={styles.languageCopy}>
              <Text style={styles.languageTitle}>{ar ? "الإنجليزية" : "English"}</Text>
              <Text style={styles.languageHint}>{ar ? "واجهة إنجليزية" : "English interface"}</Text>
            </View>
            {language === "en" && <Text style={styles.check}>✓</Text>}
          </Pressable>
        </View>

        <Text style={styles.label}>{ar ? "اسم اللاعب" : "DISPLAY NAME"}</Text>
        <TextInput value={name} onChangeText={setName} placeholder={ar ? "اسمك في الغرف" : "Your name in rooms"} placeholderTextColor="#74869C" textAlign={ar ? "right" : "left"} style={[styles.input, ar && styles.rtlText]} returnKeyType="done" />
        <Pressable onPress={save} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>{ar ? "حفظ الاسم" : "SAVE NAME"}</Text></Pressable>

        <View style={styles.privacy}>
          <Text style={styles.privacyTitle}>{ar ? "الخصوصية" : "SESSION PRIVACY"}</Text>
          <Text style={[styles.privacyText, ar && styles.rtlText]}>{ar ? "يتم حفظ رمز عضوية الغرفة على هذا الجهاز بشكل آمن. التطبيق لا يحمل ملفات الألعاب إلى الخدمة." : "Your room membership token is stored securely on this device. The app never carries or uploads game files to the service."}</Text>
        </View>

        <View style={styles.brandBlock}>
          <Text style={styles.brandName}>Classic Era by Moudie</Text>
          <Text style={styles.slogan}>Old Equal Gold</Text>
        </View>

        <View style={styles.info}>
          <Text style={styles.infoLabel}>{ar ? "إصدار الواجهة" : "INTERFACE VERSION"}</Text>
          <Text style={styles.infoValue}>Classic Era</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 17, paddingBottom: 28 },
  rtl: { direction: "rtl" },
  rtlText: { textAlign: "right" },
  eyebrow: { color: "#62C2EB", fontSize: 13, fontWeight: "900", letterSpacing: 0.8 },
  title: { color: "#F3F7FB", fontSize: 29, fontWeight: "900", marginTop: 5 },
  label: { color: "#DCE7F1", fontSize: 15, fontWeight: "800", marginTop: 26, marginBottom: 9 },
  languageRow: { gap: 9 },
  languageOption: { minHeight: 64, borderRadius: 15, borderWidth: 1, borderColor: "#30445E", backgroundColor: "#162235", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  languageSelected: { borderColor: "#7B58C7", backgroundColor: "#211A38" },
  languageCode: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#24354A", color: "#B9C9D8", fontSize: 19, fontWeight: "900", textAlign: "center", textAlignVertical: "center", overflow: "hidden" },
  languageCodeSelected: { backgroundColor: "#5A2C91", color: "#FFFFFF" },
  languageCopy: { flex: 1 },
  languageTitle: { color: "#F3F7FB", fontSize: 14, fontWeight: "900" },
  languageHint: { color: "#8799AC", fontSize: 10, marginTop: 3 },
  check: { color: "#72E7FF", fontSize: 21, fontWeight: "900" },
  input: { backgroundColor: "#1D2A3C", borderRadius: 14, borderWidth: 1, borderColor: "#30445E", minHeight: 52, paddingHorizontal: 14, color: "#F3F7FB", fontSize: 16 },
  button: { minHeight: 50, borderRadius: 15, backgroundColor: "#146C94", alignItems: "center", justifyContent: "center", marginTop: 12 },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  privacy: { backgroundColor: "#162235", borderRadius: 16, padding: 15, marginTop: 26 },
  privacyTitle: { color: "#F4C662", fontSize: 14, fontWeight: "900" },
  privacyText: { color: "#B4C2D0", fontSize: 13, lineHeight: 20, marginTop: 5 },
  brandBlock: { marginTop: 26, alignItems: "center", paddingVertical: 10 },
  brandName: { color: "#F2EEFF", fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  slogan: { color: "#71E8FF", fontSize: 12, fontWeight: "900", marginTop: 5, letterSpacing: 1.1 },
  info: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 19, borderBottomWidth: 1, borderBottomColor: "#30445E" },
  infoLabel: { color: "#DCE7F1", fontSize: 14, fontWeight: "800" },
  infoValue: { color: "#8398AC", fontSize: 13 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
