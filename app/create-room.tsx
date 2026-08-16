import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { getProfileName, saveProfileName, saveRoomCredential } from "@/lib/room-storage";
import { trpc } from "@/lib/trpc";

type SystemId = "psp" | "nes" | "sega" | "ps1";

const SYSTEMS: { id: SystemId; label: string; detail: string; symbol: string }[] = [
  { id: "psp", label: "PSP", detail: "PPSSPP NetPlay", symbol: "▲" },
  { id: "nes", label: "Famicom", detail: "NES / RetroArch", symbol: "●" },
  { id: "sega", label: "Sega", detail: "Genesis / RetroArch", symbol: "◆" },
  { id: "ps1", label: "PS1", detail: "قيد اختبار NetPlay", symbol: "■" },
];

export default function CreateRoomScreen() {
  const [system, setSystem] = useState<SystemId>("psp");
  const [name, setName] = useState("جلسة الأصدقاء");
  const [hostName, setHostName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const createRoom = trpc.rooms.create.useMutation();

  const create = async () => {
    const normalizedHost = hostName.trim() || (await getProfileName())?.trim() || "لاعب";
    if (name.trim().length < 2) {
      haptic.error();
      Alert.alert("اسم الغرفة قصير", "اكتب اسماً من حرفين على الأقل.");
      return;
    }
    try {
      const room = await createRoom.mutateAsync({
        name: name.trim(),
        system,
        hostName: normalizedHost,
        maxPlayers,
      });
      await saveProfileName(normalizedHost);
      await saveRoomCredential({
        roomId: room.roomId,
        memberId: room.memberId,
        memberToken: room.memberToken,
        hostToken: room.hostToken,
      });
      haptic.success();
      router.replace({ pathname: "/room/[roomId]", params: { roomId: String(room.roomId) } });
    } catch (error) {
      haptic.error();
      Alert.alert("تعذر إنشاء الغرفة", error instanceof Error ? error.message : "حاول مرة أخرى.");
    }
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Text style={styles.backText}>‹ رجوع</Text>
        </Pressable>
        <Text style={styles.eyebrow}>غرفة خاصة</Text>
        <Text style={styles.title}>أنشئ جلسة جديدة</Text>
        <Text style={styles.subtitle}>سيظهر رمز دعوة قصير يمكنك مشاركته مع أصدقائك.</Text>

        <Text style={styles.label}>النظام</Text>
        <View style={styles.systemGrid}>
          {SYSTEMS.map((item) => {
            const selected = system === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  haptic.selection();
                  setSystem(item.id);
                }}
                style={({ pressed }) => [styles.systemCard, selected && styles.systemCardSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.systemSymbol, selected && styles.systemTextSelected]}>{item.symbol}</Text>
                <Text style={[styles.systemTitle, selected && styles.systemTextSelected]}>{item.label}</Text>
                <Text style={[styles.systemDetail, selected && styles.systemDetailSelected]}>{item.detail}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>اسم الغرفة</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="مثال: سباق مساء الجمعة" placeholderTextColor="#74869C" returnKeyType="done" textAlign="right" />
        <Text style={styles.label}>اسمك الظاهر</Text>
        <TextInput value={hostName} onChangeText={setHostName} style={styles.input} placeholder="سيظهر لأصدقائك" placeholderTextColor="#74869C" returnKeyType="done" textAlign="right" />

        <Text style={styles.label}>عدد اللاعبين</Text>
        <View style={styles.capacityRow}>
          {[2, 4, 6, 8].map((value) => (
            <Pressable
              key={value}
              onPress={() => {
                haptic.selection();
                setMaxPlayers(value);
              }}
              style={({ pressed }) => [styles.capacity, maxPlayers === value && styles.capacitySelected, pressed && styles.pressed]}
            >
              <Text style={[styles.capacityText, maxPlayers === value && styles.capacityTextSelected]}>{value}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>خصوصية الملفات</Text>
          <Text style={styles.noticeText}>لا ترفع الغرفة أي لعبة. سيُطلب من كل لاعب اختيار ملفه المحلي المتطابق قبل تشغيل الجلسة.</Text>
        </View>
        <Pressable onPress={create} disabled={createRoom.isPending} style={({ pressed }) => [styles.primaryButton, (pressed || createRoom.isPending) && styles.primaryPressed]}>
          {createRoom.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>إنشاء الغرفة والحصول على الرمز</Text>}
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 10, paddingBottom: 28 },
  back: { alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 2, marginBottom: 18 },
  backText: { color: "#9BAFC4", fontSize: 16, fontWeight: "700" },
  eyebrow: { color: "#62C2EB", fontSize: 13, fontWeight: "800", letterSpacing: 0.8, textAlign: "right" },
  title: { color: "#F3F7FB", fontSize: 30, lineHeight: 38, fontWeight: "800", textAlign: "right", marginTop: 5 },
  subtitle: { color: "#9BAFC4", fontSize: 15, lineHeight: 22, textAlign: "right", marginTop: 8, marginBottom: 24 },
  label: { color: "#DCE7F1", fontSize: 15, fontWeight: "800", textAlign: "right", marginTop: 18, marginBottom: 9 },
  systemGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  systemCard: { width: "47.7%", minHeight: 116, backgroundColor: "#1D2A3C", borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "#30445E" },
  systemCardSelected: { backgroundColor: "#146C94", borderColor: "#61C7F1" },
  systemSymbol: { color: "#62C2EB", fontSize: 18, fontWeight: "900", textAlign: "right" },
  systemTitle: { color: "#F3F7FB", fontSize: 18, fontWeight: "800", textAlign: "right", marginTop: 6 },
  systemDetail: { color: "#9BAFC4", fontSize: 11, textAlign: "right", marginTop: 4 },
  systemTextSelected: { color: "#FFFFFF" },
  systemDetailSelected: { color: "#DDF5FF" },
  input: { backgroundColor: "#1D2A3C", borderWidth: 1, borderColor: "#30445E", borderRadius: 14, paddingHorizontal: 14, minHeight: 52, color: "#F3F7FB", fontSize: 16 },
  capacityRow: { flexDirection: "row", gap: 9 },
  capacity: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, backgroundColor: "#1D2A3C", borderRadius: 13, borderWidth: 1, borderColor: "#30445E" },
  capacitySelected: { backgroundColor: "#F26B5B", borderColor: "#FFB3A9" },
  capacityText: { color: "#DCE7F1", fontSize: 16, fontWeight: "800" },
  capacityTextSelected: { color: "#FFFFFF" },
  notice: { backgroundColor: "#162235", borderLeftWidth: 3, borderLeftColor: "#F4B942", borderRadius: 14, padding: 14, marginTop: 22 },
  noticeTitle: { color: "#F4C662", fontSize: 13, fontWeight: "800", textAlign: "right" },
  noticeText: { color: "#C4D0DC", fontSize: 13, lineHeight: 20, textAlign: "right", marginTop: 5 },
  primaryButton: { marginTop: 22, minHeight: 54, borderRadius: 16, backgroundColor: "#146C94", alignItems: "center", justifyContent: "center" },
  primaryPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.72 },
});
