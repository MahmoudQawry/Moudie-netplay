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
  { label: "ARCADE", color: "#B95B16", icon: "joystick", rotate: 22 },
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
  const cardValues = useRef(systems.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!mounted || !ready) return;
    envelope.setValue(0); burst.setValue(0); seal.setValue(0); title.setValue(0); loading.setValue(0);
    cardValues.forEach((value) => value.setValue(0));
    setVisible(true);
    const sequence = Animated.sequence([
      Animated.parallel([
        Animated.timing(envelope, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(burst, { toValue: 1, duration: 760, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.stagger(105, cardValues.map((value) => Animated.spring(value, { toValue: 1, friction: 6, tension: 105, useNativeDriver: true }))),
      Animated.parallel([
        Animated.spring(seal, { toValue: 1, friction: 5, tension: 105, useNativeDriver: true }),
        Animated.timing(title, { toValue: 1, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(loading, { toValue: 1, duration: 1050, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      Animated.delay(420),
    ]);
    let cancelled = false;
    sequence.start(({ finished }) => { if (finished && !cancelled) { setVisible(false); if (!language) setShowLanguage(true); } });
    return () => { cancelled = true; sequence.stop(); };
  }, [burst, cardValues, envelope, language, loading, mounted, ready, seal, title]);

  const chooseLanguage = async (next: AppLanguage) => { await setLanguage(next); setShowLanguage(false); };
  const skip = () => { setVisible(false); if (!language) setShowLanguage(true); };

  return <View style={styles.root} onLayout={() => setMounted(true)}>
    {children}
    {visible && <View style={styles.overlay} accessibilityLabel="Classic Era animated launch">
      <View style={styles.orbit}><Animated.View style={[styles.orbitRing, { opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [0, 0.7] }), transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }] }]} /></View>
      <View style={styles.particles}><View style={[styles.spark, styles.sparkOne]} /><View style={[styles.spark, styles.sparkTwo]} /><View style={[styles.spark, styles.sparkThree]} /></View>
      <View style={styles.stage}>
        <Animated.View style={[styles.cards, { opacity: burst, transform: [{ translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [78, 0] }) }] }]}>
          {systems.map((system, index) => <Animated.View key={system.label} style={[styles.systemCard, { backgroundColor: system.color, transform: [{ rotate: `${system.rotate}deg` }, { translateX: (index - 2) * 22 }, { translateY: cardValues[index].interpolate({ inputRange: [0, 1], outputRange: [96, 0] }) }, { scale: cardValues[index].interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] }) }], opacity: cardValues[index] }]}>
            <MaterialCommunityIcons name={system.icon} size={31} color="#F2F8FF" /><Text style={styles.systemLabel}>{system.label}</Text>
          </Animated.View>)}
        </Animated.View>
        <Animated.View style={[styles.envelope, { opacity: envelope, transform: [{ scale: envelope.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }, { translateY: envelope.interpolate({ inputRange: [0, 1], outputRange: [34, 0] }) }] }]}>
          <View style={styles.envelopeInner} />
          <View style={styles.envelopeGlow} />
          <Animated.View style={[styles.flap, { transform: [{ perspective: 1000 }, { rotateX: envelope.interpolate({ inputRange: [0, 1], outputRange: [0, -142] }) }] }]} />
          <View style={styles.envelopeLine} />
        </Animated.View>
        <Animated.View style={[styles.seal, { opacity: seal, transform: [{ scale: seal.interpolate({ inputRange: [0, 1], outputRange: [2.2, 1] }) }] }]}><Text style={styles.sealText}>M</Text></Animated.View>
      </View>
      <Animated.View style={[styles.brandBlock, { opacity: title, transform: [{ translateY: title.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        <Text style={styles.classicEra}>CLASSIC ERA</Text><Text style={styles.by}>BY MOUDIE</Text><Text style={styles.signature}>Moudie</Text>
      </Animated.View>
      <View style={styles.loadingTrack}><Animated.View style={[styles.loadingFill, { width: loading.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} /></View>
      <Text style={styles.loadingText}>LOADING…</Text>
      <Pressable onPress={skip} hitSlop={12} style={styles.skip}><Text style={styles.skipText}>SKIP INTRO</Text></Pressable>
    </View>}
    {showLanguage && !language && <View style={styles.languageOverlay}><View style={styles.languageCard}>
      <View style={styles.languageLogo}><Text style={styles.languageLogoText}>M</Text></View>
      <Text style={styles.languageEyebrow}>CLASSIC ERA · MOUDIE</Text><Text style={styles.languageTitle}>Choose your language</Text><Text style={styles.languageSubtitle}>اختر لغة البرنامج</Text>
      <Pressable onPress={() => void chooseLanguage("ar")} style={({ pressed }) => [styles.languageButton, pressed && styles.buttonPressed]}><Text style={styles.languagePrimary}>🇪🇬  العربية</Text><Text style={styles.languageSecondary}>Egypt · Arabic</Text></Pressable>
      <Pressable onPress={() => void chooseLanguage("en")} style={({ pressed }) => [styles.languageButton, styles.languageButtonAlt, pressed && styles.buttonPressed]}><Text style={styles.languagePrimary}>🇺🇸  English</Text><Text style={styles.languageSecondary}>United States · English</Text></Pressable>
      <Text style={styles.languageNote}>You can change this later from Settings.</Text>
    </View></View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, overlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, alignItems: "center", justifyContent: "center", backgroundColor: "#050610", overflow: "hidden" },
  orbit: { position: "absolute", width: 620, height: 620, borderRadius: 310, backgroundColor: "#121434", top: -38 }, orbitRing: { position: "absolute", width: 390, height: 390, borderRadius: 195, borderWidth: 2, borderColor: "#37DFFF", alignSelf: "center", top: 86, opacity: 0.45 },
  particles: { ...StyleSheet.absoluteFillObject }, spark: { position: "absolute", width: 6, height: 6, borderRadius: 3, backgroundColor: "#7AF0FF", shadowColor: "#7AF0FF", shadowOpacity: 1, shadowRadius: 10, elevation: 8 }, sparkOne: { top: "23%", left: "15%" }, sparkTwo: { top: "18%", right: "18%", backgroundColor: "#B05CFF" }, sparkThree: { top: "48%", right: "10%", backgroundColor: "#FF7D50" },
  stage: { width: 330, height: 340, alignItems: "center", justifyContent: "flex-end", marginTop: -46 }, cards: { position: "absolute", top: 20, width: 326, height: 190, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", zIndex: 5 }, systemCard: { width: 67, height: 121, borderRadius: 12, borderWidth: 2, borderColor: "rgba(255,255,255,0.82)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 12, elevation: 12 }, systemLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", marginTop: 8, letterSpacing: 0.4 },
  envelope: { width: 300, height: 176, borderWidth: 2, borderColor: "#63E9FF", borderRadius: 22, backgroundColor: "#11133A", overflow: "visible", shadowColor: "#5E47FF", shadowOpacity: 0.85, shadowRadius: 28, elevation: 12 }, envelopeInner: { ...StyleSheet.absoluteFillObject, borderRadius: 20, backgroundColor: "#20224E" }, envelopeGlow: { position: "absolute", left: 18, right: 18, bottom: 22, height: 4, backgroundColor: "#7659E5" }, flap: { position: "absolute", top: -2, left: -2, width: 300, height: 126, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 2, borderColor: "#70ECFF", backgroundColor: "#343A76", transformOrigin: "bottom" }, envelopeLine: { position: "absolute", bottom: 20, left: 32, right: 32, height: 3, backgroundColor: "#7D61DD" },
  seal: { position: "absolute", width: 86, height: 86, borderRadius: 43, bottom: 62, backgroundColor: "#0E9DB5", borderWidth: 4, borderColor: "#8DF8FF", alignItems: "center", justifyContent: "center", shadowColor: "#1BEAFF", shadowOpacity: 0.95, shadowRadius: 24, elevation: 15, zIndex: 9 }, sealText: { color: "#071331", fontSize: 54, fontWeight: "900" },
  brandBlock: { alignItems: "center", marginTop: 14 }, classicEra: { color: "#8BB8FF", fontSize: 30, fontWeight: "900", letterSpacing: 2.2, textShadowColor: "#3B6BFF", textShadowRadius: 12 }, by: { color: "#B6B9D9", fontSize: 9, fontWeight: "900", letterSpacing: 4, marginTop: 2 }, signature: { color: "#B76CFF", fontSize: 30, fontStyle: "italic", fontWeight: "700", marginTop: 5 },
  loadingTrack: { width: 164, height: 9, borderRadius: 9, borderWidth: 1, borderColor: "#5470D0", overflow: "hidden", marginTop: 15 }, loadingFill: { height: "100%", borderRadius: 9, backgroundColor: "#9B55FF" }, loadingText: { color: "#8A94BB", fontSize: 8, fontWeight: "900", letterSpacing: 2.5, marginTop: 7 }, skip: { position: "absolute", bottom: 34, minHeight: 42, paddingHorizontal: 22, justifyContent: "center" }, skipText: { color: "#BBC3DC", fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },
  languageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "#090817", alignItems: "center", justifyContent: "center", padding: 22, zIndex: 60 }, languageCard: { width: "100%", maxWidth: 430, backgroundColor: "#15102A", borderRadius: 28, borderWidth: 1, borderColor: "#5C3D8D", padding: 24, alignItems: "center" }, languageLogo: { width: 70, height: 70, borderRadius: 22, backgroundColor: "#10D6E8", borderWidth: 3, borderColor: "#B4FAFF", alignItems: "center", justifyContent: "center", marginBottom: 14 }, languageLogoText: { color: "#13103E", fontSize: 46, fontWeight: "900" }, languageEyebrow: { color: "#6EEBFF", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 }, languageTitle: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", marginTop: 8, textAlign: "center" }, languageSubtitle: { color: "#C7BBD9", fontSize: 16, marginTop: 4, textAlign: "center" }, languageButton: { width: "100%", minHeight: 62, marginTop: 18, borderRadius: 17, backgroundColor: "#5A2C91", borderWidth: 1, borderColor: "#B16DFF", alignItems: "center", justifyContent: "center" }, languageButtonAlt: { marginTop: 10, backgroundColor: "#162C4B", borderColor: "#3A9EC4" }, languagePrimary: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" }, languageSecondary: { color: "#BFD3E8", fontSize: 10, marginTop: 2 }, languageNote: { color: "#827A96", fontSize: 10, marginTop: 14, textAlign: "center" }, buttonPressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
