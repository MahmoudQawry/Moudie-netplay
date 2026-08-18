import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { NeonCircuitBackground } from "@/components/neon-circuit-background";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { getProfileName, saveProfileName, saveRoomCredential } from "@/lib/room-storage";
import { trpc } from "@/lib/trpc";

type JoinAs = "player" | "spectator";

export default function JoinRoomScreen() {
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joinAs, setJoinAs] = useState<JoinAs>("player");
  const joinRoom = trpc.rooms.join.useMutation();

  useEffect(() => { getProfileName().then((saved) => saved && setDisplayName(saved)); }, []);

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
      const result = await joinRoom.mutateAsync({ joinCode: joinCode.trim().toUpperCase(), displayName: displayName.trim(), joinAs });
      await saveProfileName(displayName.trim());
      await saveRoomCredential({ roomId: result.roomId, memberId: result.memberId, memberToken: result.memberToken });
      haptic.success();
      router.replace({ pathname: "/room/[roomId]", params: { roomId: String(result.roomId) } });
    } catch (error) {
      haptic.error();
      Alert.alert("تعذر الانضمام", error instanceof Error ? error.message : "تحقق من الرمز ثم أعد المحاولة.");
    }
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]} containerClassName="bg-background">
      <NeonCircuitBackground />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><MaterialCommunityIcons name="arrow-right" size={21} color="#F8F5FF" /></Pressable>
          <View style={styles.titleRow}><Image source={require("@/assets/images/moudie-brand-icon.png")} style={styles.brandIcon} /><Text style={styles.title}>انضم لغرفة</Text></View>
          <View style={styles.headerSpace} />
        </View>
        <View style={styles.panel}>
          <Text style={styles.label}>رمز الغرفة</Text>
          <TextInput value={joinCode} onChangeText={(value) => setJoinCode(value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} autoCapitalize="characters" autoCorrect={false} maxLength={6} style={styles.codeInput} placeholder="ABC123" placeholderTextColor="#756E87" textAlign="center" returnKeyType="done" />
          <Text style={styles.label}>اسمك الظاهر</Text>
          <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} placeholder="مثال: محمد" placeholderTextColor="#827B97" textAlign="right" returnKeyType="done" />

          <Text style={styles.label}>كيف تريد الدخول؟</Text>
          <View style={styles.roleRow}>
            <Pressable onPress={() => { haptic.selection(); setJoinAs("player"); }} style={({ pressed }) => [styles.roleCard, joinAs === "player" && styles.roleSelected, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="gamepad-variant-outline" size={24} color={joinAs === "player" ? "#65E8FF" : "#9B93AD"} />
              <Text style={[styles.roleTitle, joinAs === "player" && styles.roleTitleSelected]}>لاعب</Text>
              <Text style={styles.roleText}>تتحكم داخل اللعبة</Text>
            </Pressable>
            <Pressable onPress={() => { haptic.selection(); setJoinAs("spectator"); }} style={({ pressed }) => [styles.roleCard, joinAs === "spectator" && styles.roleSelected, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="eye-outline" size={24} color={joinAs === "spectator" ? "#D9A3FF" : "#9B93AD"} />
              <Text style={[styles.roleTitle, joinAs === "spectator" && styles.roleTitleSelected]}>مشاهد</Text>
              <Text style={styles.roleText}>تشاهد وتتحدث وتدردش</Text>
            </Pressable>
          </View>

          <Pressable onPress={join} disabled={joinRoom.isPending} style={({ pressed }) => [styles.primaryButton, (pressed || joinRoom.isPending) && styles.buttonPressed]}>
            {joinRoom.isPending ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.primaryText}>انضم الآن</Text><MaterialCommunityIcons name="login-variant" size={20} color="#FFFFFF" /></>}
          </Pressable>
        </View>
        <View style={styles.helper}><MaterialCommunityIcons name="shield-lock-outline" size={18} color="#69E8FF" /><Text style={styles.helperText}>رمز الغرفة وعضويتك محفوظان على جهازك. ملفات ألعابك لا تُرسل إلى الغرفة.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 34, flexGrow: 1 },
  header: { height: 57, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#1A102D", borderWidth: 1, borderColor: "#412960" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: { width: 41, height: 41, borderRadius: 12, borderWidth: 1, borderColor: "#594174" },
  title: { color: "#FFFFFF", fontSize: 25, fontWeight: "900" },
  headerSpace: { width: 40 },
  panel: { backgroundColor: "rgba(19, 10, 36, 0.94)", borderWidth: 1, borderColor: "#55377F", borderRadius: 27, padding: 18, marginTop: 30, shadowColor: "#8E49E6", shadowOpacity: 0.24, shadowRadius: 18, elevation: 4 },
  label: { color: "#EDE7FB", fontSize: 14, fontWeight: "900", textAlign: "right", marginBottom: 8, marginTop: 5 },
  codeInput: { minHeight: 59, backgroundColor: "#0D0818", borderWidth: 1, borderColor: "#34234B", borderRadius: 15, color: "#FFFFFF", fontSize: 24, fontWeight: "900", letterSpacing: 4 },
  input: { minHeight: 51, backgroundColor: "#0D0818", borderWidth: 1, borderColor: "#34234B", borderRadius: 14, paddingHorizontal: 14, color: "#F8F4FF", fontSize: 15, marginBottom: 13 },
  roleRow: { flexDirection: "row", gap: 9, marginTop: 2 },
  roleCard: { flex: 1, minHeight: 103, padding: 12, borderRadius: 17, borderWidth: 1, borderColor: "#302044", backgroundColor: "#110A20", alignItems: "flex-end", justifyContent: "space-between" },
  roleSelected: { backgroundColor: "#2B1748", borderColor: "#A95CF0" },
  roleTitle: { color: "#D7D0E5", fontSize: 14, fontWeight: "900", marginTop: 6 },
  roleTitleSelected: { color: "#FFFFFF" },
  roleText: { color: "#9E95AF", fontSize: 10, textAlign: "right", marginTop: 3 },
  primaryButton: { minHeight: 54, borderRadius: 17, marginTop: 19, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: "#A54DF3" },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  helper: { marginTop: 20, flexDirection: "row", gap: 8, alignItems: "flex-start", paddingHorizontal: 9 },
  helperText: { color: "#B6AEC6", fontSize: 11, lineHeight: 17, textAlign: "right", flex: 1 },
  pressed: { opacity: 0.72 },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
