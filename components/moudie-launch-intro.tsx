import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage, type AppLanguage } from "@/lib/language";

type Props = { children: ReactNode };
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
const systems: { label: string; color: string; icon: IconName; rotate: number }[] = [
  { label: "PS1", color: "#7D42D9", icon: "controller-classic", rotate: -24 },
  { label: "PSP", color: "#258CCB", icon: "gamepad-variant", rotate: -12 },
  { label: "NES", color: "#D81E35", icon: "controller-classic-outline", rotate: -2 },
  { label: "SEGA", color: "#148248", icon: "gamepad-variant", rotate: 10 },
  { label: "ARCADE", color: "#B95B16", icon: "gamepad-variant", rotate: 22 },
];

export function MoudieLaunchIntro({ children }: Props) {
  const { language, ready, setLanguage } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const envelope = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const seal = useRef(new Animated.Value(0)).current;
  const title = useRef(new Animated.Value(0)).current;
  const loading = useRef(new Animated.Value(0)).current;
  const cards = useRef(systems.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!ready) return;
    setMounted(true);
    const sequence = Animated.sequence([
      Animated.parallel([
        Animated.timing(envelope, { toValue: 1, duration: 850, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(burst, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.stagger(110, cards.map((card) => Animated.spring(card, { toValue: 1, tension: 55, friction: 7, useNativeDriver: true }))),
      Animated.parallel([
        Animated.spring(seal, { toValue: 1, tension: 52, friction: 6, useNativeDriver: true }),
        Animated.timing(title, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(loading, { toValue: 1, duration: 1350, easing: Easing.linear, useNativeDriver: false }),
    ]);
    sequence.start(() => setVisible(true));
    return () => sequence.stop();
  }, [ready]);

  if (!mounted || !ready || visible) return <>{children}</>;

  return <View style={styles.screen}>
    <Animated.View style={[styles.glow, { opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] }), transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }] }]} />
    <Animated.View style={[styles.envelope, { opacity: envelope, transform: [{ translateY: envelope.interpolate({ inputRange: [0, 1], outputRange: [42, 0] }) }, { scale: envelope.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] }]}>
      <View style={styles.envelopeBack} />
      <View style={styles.envelopeFlap} />
      <View style={styles.cards}>
        {systems.map((system, index) => <Animated.View key={system.label} style={[styles.systemCard, { borderColor: system.color, opacity: cards[index], transform: [{ rotate: `${system.rotate}deg` }, { translateY: cards[index].interpolate({ inputRange: [0, 1], outputRange: [64, 0] }) }, { scale: cards[index].interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }) }] }]}>
          <MaterialCommunityIcons name={system.icon} size={30} color="#F4F7FF" />
          <Text style={[styles.systemLabel, { color: system.color }]}>{system.label}</Text>
        </Animated.View>)}
      </View>
      <View style={styles.envelopeFront} />
      <Animated.View style={[styles.seal, { opacity: seal, transform: [{ scale: seal.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }, { rotate: seal.interpolate({ inputRange: [0, 1], outputRange: ["-35deg", "0deg"] }) }] }]}><Text style={styles.sealText}>M</Text></Animated.View>
    </Animated.View>
    <Animated.View style={[styles.brand, { opacity: title, transform: [{ translateY: title.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }] }]}>
      <Text style={styles.classic}>CLASSIC ERA</Text><Text style={styles.by}>BY MOUDIE</Text><Text style={styles.moudie}>Moudie</Text>
    </Animated.View>
    <Animated.View style={[styles.loadingWrap, { opacity: title }]}><View style={styles.loadingTrack}><Animated.View style={[styles.loadingFill, { width: loading.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} /></View><Text style={styles.loadingText}>LOADING…</Text></Animated.View>
    <Pressable style={styles.skip} onPress={() => setVisible(true)}><Text style={styles.skipText}>SKIP INTRO</Text></Pressable>
    <Pressable style={styles.languageButton} onPress={() => setShowLanguage((value) => !value)}><Text style={styles.languageText}>{language === "ar" ? "العربية" : "EN"}</Text></Pressable>
    {showLanguage && <View style={styles.languageMenu}>{(["ar", "en"] as AppLanguage[]).map((item) => <Pressable key={item} style={styles.languageOption} onPress={() => { setLanguage(item); setShowLanguage(false); }}><Text style={styles.languageOptionText}>{item === "ar" ? "العربية" : "English"}</Text></Pressable>)}</View>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#080816", alignItems: "center", justifyContent: "center", overflow: "hidden" }, glow: { position: "absolute", width: 620, height: 620, borderRadius: 310, backgroundColor: "#27244C", top: 80 }, envelope: { width: 310, height: 310, alignItems: "center", justifyContent: "flex-end" }, envelopeBack: { position: "absolute", bottom: 0, width: 280, height: 180, borderWidth: 3, borderColor: "#69D5E9", borderRadius: 24, backgroundColor: "#202042" }, envelopeFlap: { position: "absolute", top: 48, width: 278, height: 150, borderWidth: 3, borderColor: "#69D5E9", borderRadius: 12, backgroundColor: "#343E78" }, cards: { position: "absolute", top: 0, width: 330, height: 170, flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 4, zIndex: 3 }, systemCard: { width: 62, height: 92, borderWidth: 2, borderRadius: 9, backgroundColor: "#161A37", alignItems: "center", justifyContent: "center", gap: 7 }, systemLabel: { fontWeight: "900", fontSize: 11 }, envelopeFront: { position: "absolute", bottom: 0, width: 280, height: 180, borderWidth: 3, borderColor: "#69D5E9", borderRadius: 24, backgroundColor: "transparent" }, seal: { position: "absolute", bottom: 70, width: 86, height: 86, borderRadius: 22, backgroundColor: "#2AAFC4", borderWidth: 7, borderColor: "#9DE7E9", alignItems: "center", justifyContent: "center", zIndex: 4 }, sealText: { color: "#11183A", fontSize: 52, fontWeight: "900" }, brand: { marginTop: 34, alignItems: "center" }, classic: { color: "#9DC8FF", fontSize: 33, fontWeight: "900", letterSpacing: 2 }, by: { color: "#A9B6D8", fontSize: 11, letterSpacing: 5, marginTop: 2 }, moudie: { color: "#C37AFF", fontSize: 31, fontStyle: "italic", fontWeight: "700", marginTop: 8 }, loadingWrap: { width: 220, marginTop: 24, alignItems: "center" }, loadingTrack: { height: 8, width: "100%", borderRadius: 4, backgroundColor: "#25224A", overflow: "hidden" }, loadingFill: { height: "100%", backgroundColor: "#A85CFF" }, loadingText: { color: "#8D9AB9", fontSize: 10, letterSpacing: 4, marginTop: 10, fontWeight: "800" }, skip: { position: "absolute", bottom: 70, padding: 14 }, skipText: { color: "#AEB7D0", fontSize: 12, letterSpacing: 3, fontWeight: "900" }, languageButton: { position: "absolute", top: 48, right: 20, padding: 10, borderRadius: 10, backgroundColor: "#17172A" }, languageText: { color: "#DCE5FF", fontWeight: "800" }, languageMenu: { position: "absolute", top: 90, right: 20, borderRadius: 10, overflow: "hidden", backgroundColor: "#17172A" }, languageOption: { paddingHorizontal: 18, paddingVertical: 10 }, languageOptionText: { color: "#F4F7FF", fontWeight: "700" },
});
