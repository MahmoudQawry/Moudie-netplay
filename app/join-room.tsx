import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { getProfileName, saveProfileName, saveRoomCredential } from "@/lib/room-storage";
import { trpc } from "@/lib/trpc";

export default function JoinRoomScreen() {
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const joinRoom = trpc.rooms.join.useMutation();

  useEffect(() => {
    getProfileName().then((saved) => saved && setDisplayName(saved));
  }, []);

  const join = async () => {
    if (joinCode.trim().length !== 6) {
      haptic.error();
      Alert.alert("تحقق من الرمز", "رمز الغرفة يتكون من 6 أحرف أو أرقام.");
      return;
    }
    if (displayName.trim().length < 2) {
      haptic.error();
      Alert.alert("أضف اسماً ظاهراً", "اكتب حرفين على الأقل ليظهر اسمك داخل الغرفة.");
      return;
    }
    try {
      const result = await joinRoom.mutateAsync({ joinCode: joinCode.trim().toUpperCase(), displayName: displayName.trim() });
      await saveProfileName(displayName);
      await saveRoomCredential({ roomId: result.roomId, memberId: result.memberId, memberToken: result.memberToken });
      haptic.success();
      router.replace({ pathname: "/room/[roomId]", params: { roomId: String(result.roomId) } });
    } catch (error) {
      haptic.error();
      Alert.alert("تعذر الانضمام", error instanceof Error ? error.message : "تحقق من الرمز ثم أعد المحاولة.");
    }
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
      <View style={styles.container}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><Text style={styles.backText}>‹ رجوع</Text></Pressable>
        <View style={styles.symbol}><Text style={styles.symbolText}>⌘</Text></View>
        <Text style={styles.title}>انضم إلى غرفة خاصة</Text>
        <Text style={styles.subtitle}>أدخل الرمز الذي أرسله لك صديقك. لا تحتاج إلى تسجيل حساب.</Text>
        <Text style={styles.label}>رمز الغرفة</Text>
        <TextInput value={joinCode} onChangeText={(value) => setJoinCode(value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} autoCapitalize="characters" autoCorrect={false} maxLength={6} style={styles.codeInput} placeholder="ABC123" placeholderTextColor="#687C94" textAlign="center" returnKeyType="done" />
        <Text style={styles.label}>اسمك الظاهر</Text>
        <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} placeholder="مثال: محمد" placeholderTextColor="#74869C" textAlign="right" returnKeyType="done" />
        <Pressable onPress={join} disabled={joinRoom.isPending} style={({ pressed }) => [styles.primaryButton, (pressed || joinRoom.isPending) && styles.primaryPressed]}>
          {joinRoom.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>الانضمام إلى الغرفة</Text>}
        </Pressable>
        <Text style={styles.helper}>تحفظ عضويتك ورمزك على جهازك فقط، ولا تتشارك ألعابك أو ملفاتك مع الخدمة.</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 10 },
  back: { alignSelf: "flex-start", paddingVertical: 8 },
  backText: { color: "#9BAFC4", fontSize: 16, fontWeight: "700" },
  symbol: { width: 72, height: 72, borderRadius: 24, backgroundColor: "#146C94", alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 42 },
  symbolText: { color: "#FFFFFF", fontSize: 36, fontWeight: "800" },
  title: { color: "#F3F7FB", fontSize: 28, lineHeight: 36, fontWeight: "800", textAlign: "center", marginTop: 23 },
  subtitle: { color: "#9BAFC4", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 8, paddingHorizontal: 15 },
  label: { color: "#DCE7F1", fontSize: 15, fontWeight: "800", textAlign: "right", marginTop: 29, marginBottom: 9 },
  codeInput: { backgroundColor: "#1D2A3C", borderWidth: 1, borderColor: "#4A6B88", borderRadius: 16, color: "#FFFFFF", fontSize: 24, fontWeight: "800", letterSpacing: 4, minHeight: 60 },
  input: { backgroundColor: "#1D2A3C", borderWidth: 1, borderColor: "#30445E", borderRadius: 14, paddingHorizontal: 14, minHeight: 52, color: "#F3F7FB", fontSize: 16 },
  primaryButton: { marginTop: 28, minHeight: 54, borderRadius: 16, backgroundColor: "#146C94", alignItems: "center", justifyContent: "center" },
  primaryPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  helper: { color: "#8398AC", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 19, paddingHorizontal: 18 },
  pressed: { opacity: 0.72 },
});
