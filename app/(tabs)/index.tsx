import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { NeonCircuitBackground } from "@/components/neon-circuit-background";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { getProfileName } from "@/lib/room-storage";

export default function LobbyScreen() {
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    getProfileName().then(setProfileName);
  }, []);

  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]} containerClassName="bg-background">
      <NeonCircuitBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Image source={require("@/assets/images/moudie-brand-icon.png")} style={styles.brandIcon} resizeMode="cover" />
            <View><Text style={styles.brand}>MOUDIE</Text><Text style={styles.brandSub}>RETRO NETPLAY</Text></View>
          </View>
          <Pressable onPress={() => router.push("/(tabs)/settings")} style={({ pressed }) => [styles.profile, pressed && styles.pressed]} accessibilityLabel="Open settings">
            <MaterialCommunityIcons name="account-circle-outline" size={22} color="#B978FF" />
            <Text style={styles.profileName}>{profileName || "NEW PLAYER"}</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={[styles.orb, styles.orbCyan]} /><View style={[styles.orb, styles.orbPurple]} />
          <Image source={require("@/assets/images/moudie-brand-icon.png")} style={styles.heroIcon} resizeMode="cover" />
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>CLASSIC GAMES, YOUR WAY</Text>
            <Text style={styles.heroTitle}>Choose how to play</Text>
            <Text style={styles.heroText}>Pick a mode first, then choose one of five classic systems inside that mode.</Text>
          </View>
        </View>

        <View style={styles.modeList}>
          <Pressable onPress={() => { haptic.light(); router.push("/local-play"); }} style={({ pressed }) => [styles.modeCard, styles.localCard, pressed && styles.cardPressed]}>
            <View style={[styles.modeGlow, { backgroundColor: "#16D9FF" }]} />
            <View style={styles.modeIcon}><MaterialCommunityIcons name="cellphone-play" size={27} color="#50E4FF" /></View>
            <View style={styles.modeCopy}><Text style={styles.modeTitle}>LOCAL PLAY</Text><Text style={styles.modeText}>Choose a system and play your legal game file on this device.</Text></View>
            <MaterialCommunityIcons name="chevron-right" size={25} color="#D4E4FF" />
          </Pressable>

          <Pressable onPress={() => { haptic.light(); router.push("/create-room"); }} style={({ pressed }) => [styles.modeCard, styles.roomCard, pressed && styles.cardPressed]}>
            <View style={[styles.modeGlow, { backgroundColor: "#B653FF" }]} />
            <View style={styles.modeIcon}><MaterialCommunityIcons name="account-group-outline" size={27} color="#D6A1FF" /></View>
            <View style={styles.modeCopy}><Text style={styles.modeTitle}>CREATE ROOM</Text><Text style={styles.modeText}>Choose a system, create a room, and play with up to 10 members.</Text></View>
            <MaterialCommunityIcons name="chevron-right" size={25} color="#EBD9FF" />
          </Pressable>

          <Pressable onPress={() => { haptic.light(); router.push("/join-room"); }} style={({ pressed }) => [styles.modeCard, styles.joinCard, pressed && styles.cardPressed]}>
            <View style={[styles.modeGlow, { backgroundColor: "#F5BC44" }]} />
            <View style={styles.modeIcon}><MaterialCommunityIcons name="key-variant" size={26} color="#FFE09A" /></View>
            <View style={styles.modeCopy}><Text style={styles.modeTitle}>JOIN ROOM</Text><Text style={styles.modeText}>Enter an invite code, then choose player or spectator mode.</Text></View>
            <MaterialCommunityIcons name="chevron-right" size={25} color="#FFF0C7" />
          </Pressable>
        </View>

        <View style={styles.tip}>
          <MaterialCommunityIcons name="gesture-tap-hold" size={22} color="#65E7FF" />
          <Text style={styles.tipText}>In every game mode, use EDIT to move controls and SIZE − / + to resize them. Portrait and landscape layouts are saved separately.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 34, gap: 0 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandIcon: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: "#7A54D6" },
  brand: { color: "#F5F2FF", fontSize: 17, lineHeight: 19, letterSpacing: 1.3, fontWeight: "900" },
  brandSub: { color: "#6AE8FF", fontSize: 8, letterSpacing: 1.6, fontWeight: "900" },
  profile: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#17132A", borderWidth: 1, borderColor: "#342B58", paddingVertical: 7, paddingHorizontal: 10, borderRadius: 18 },
  profileName: { color: "#DBD6EF", fontSize: 11, fontWeight: "800", maxWidth: 92 },
  hero: { minHeight: 222, overflow: "hidden", backgroundColor: "#160D2B", borderRadius: 28, borderWidth: 1, borderColor: "#4D327A", padding: 20, flexDirection: "row", alignItems: "center" },
  orb: { width: 160, height: 160, borderRadius: 90, position: "absolute", opacity: 0.25 },
  orbCyan: { backgroundColor: "#00D6FF", left: -92, bottom: -70 },
  orbPurple: { backgroundColor: "#BD4EFF", right: -78, top: -78 },
  heroIcon: { width: 100, height: 100, borderRadius: 28, borderWidth: 1, borderColor: "#8668CA", marginRight: 14 },
  heroCopy: { flex: 1 },
  heroEyebrow: { color: "#84F0FF", fontSize: 10, fontWeight: "900" },
  heroTitle: { color: "#FFFFFF", fontSize: 26, lineHeight: 32, fontWeight: "900", marginTop: 7 },
  heroText: { color: "#C3BCD9", fontSize: 12, lineHeight: 18, marginTop: 8 },
  modeList: { gap: 10, marginTop: 18 },
  modeCard: { overflow: "hidden", minHeight: 87, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  localCard: { backgroundColor: "#0C2234", borderColor: "#176080" }, roomCard: { backgroundColor: "#211337", borderColor: "#64408C" }, joinCard: { backgroundColor: "#30230F", borderColor: "#7D622B" },
  modeGlow: { position: "absolute", width: 92, height: 92, borderRadius: 50, opacity: 0.15, left: -42, top: -30 },
  modeIcon: { width: 45, height: 45, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "rgba(255,255,255,0.06)" },
  modeCopy: { flex: 1 }, modeTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" }, modeText: { color: "#C8C1D9", fontSize: 11, marginTop: 4, lineHeight: 16 },
  tip: { backgroundColor: "#12182C", borderRadius: 18, borderWidth: 1, borderColor: "#254769", padding: 13, gap: 10, flexDirection: "row", alignItems: "center", marginTop: 20 },
  tipText: { color: "#BAC9DC", fontSize: 11, lineHeight: 17, flex: 1 },
  pressed: { opacity: 0.76 }, cardPressed: { transform: [{ scale: 0.982 }], opacity: 0.9 },
});
