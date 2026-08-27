import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

type Props = { children: ReactNode };
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
const systems: { label: string; color: string; icon: IconName; rotate: number }[] = [
  { label: "PS1", color: "#9C5CFF", icon: "controller-classic", rotate: -28 },
  { label: "PSP", color: "#46C8FF", icon: "gamepad-variant", rotate: -14 },
  { label: "NES", color: "#FF4D62", icon: "controller-classic-outline", rotate: -2 },
  { label: "SEGA", color: "#57D98B", icon: "gamepad-variant", rotate: 12 },
  { label: "ARCADE", color: "#FF9A38", icon: "gamepad-variant", rotate: 26 },
];

export function MoudieLaunchIntro({ children }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const signature = useRef(new Animated.Value(0)).current;
  const envelope = useRef(new Animated.Value(0)).current;
  const flap = useRef(new Animated.Value(0)).current;
  const cards = useRef(systems.map(() => new Animated.Value(0))).current;
  const seal = useRef(new Animated.Value(0)).current;
  const brand = useRef(new Animated.Value(0)).current;
  const loading = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setMounted(true);
    const sequence = Animated.sequence([
      Animated.timing(signature, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.delay(340),
      Animated.parallel([
        Animated.timing(envelope, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(signature, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]),
      Animated.timing(flap, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.stagger(110, cards.map((card) => Animated.spring(card, { toValue: 1, tension: 62, friction: 7, useNativeDriver: true }))),
      Animated.parallel([
        Animated.spring(seal, { toValue: 1, tension: 56, friction: 7, useNativeDriver: true }),
        Animated.timing(brand, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(loading, { toValue: 1, duration: 1150, easing: Easing.linear, useNativeDriver: false }),
      Animated.delay(120),
    ]);
    sequence.start(() => setVisible(true));
    return () => sequence.stop();
  }, [brand, cards, envelope, flap, loading, seal, signature]);

  if (!mounted || visible) return <>{children}</>;
  return <View style={styles.screen} accessibilityLabel="Moudie boot animation">
    <View style={styles.stars} />
    <Animated.View style={[styles.signatureWrap, { opacity: signature, transform: [{ translateY: signature.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
      <Text style={styles.signature}>Moudie</Text><View style={styles.signatureLine} />
    </Animated.View>
    <Animated.View style={[styles.scene, { opacity: envelope, transform: [{ scale: envelope.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }) }, { translateY: envelope.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
      <View style={styles.aura} />
      <Animated.View style={[styles.cardRack, { opacity: flap, transform: [{ translateY: flap.interpolate({ inputRange: [0, 1], outputRange: [70, 0] }) }] }]}>
        {systems.map((system, index) => <Animated.View key={system.label} style={[styles.systemCard, { borderColor: system.color, opacity: cards[index], transform: [{ rotate: `${system.rotate}deg` }, { translateY: cards[index].interpolate({ inputRange: [0, 1], outputRange: [82, 0] }) }, { scale: cards[index].interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }] }]}>
          <Text style={[styles.cardLabel, { color: system.color }]}>{system.label}</Text><MaterialCommunityIcons name={system.icon} size={29} color="#F4F8FF" />
        </Animated.View>)}
      </Animated.View>
      <View style={styles.envelopeBack} />
      <Animated.View style={[styles.envelopeFlap, { transform: [{ perspective: 800 }, { rotateX: flap.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-64deg"] }) }] }]} />
      <View style={styles.envelopeFront} />
      <Animated.View style={[styles.seal, { opacity: seal, transform: [{ scale: seal.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }, { rotate: seal.interpolate({ inputRange: [0, 1], outputRange: ["-45deg", "0deg"] }) }] }]}><Text style={styles.sealText}>M</Text></Animated.View>
    </Animated.View>
    <Animated.View style={[styles.brand, { opacity: brand, transform: [{ translateY: brand.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}><Text style={styles.classic}>CLASSIC ERA</Text><Text style={styles.by}>BY MOUDIE</Text></Animated.View>
    <Animated.View style={[styles.loadingWrap, { opacity: brand }]}><View style={styles.loadingTrack}><Animated.View style={[styles.loadingFill, { width: loading.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} /></View><Text style={styles.loadingText}>LOADING…</Text></Animated.View>
    <Pressable style={styles.skip} onPress={() => setVisible(true)}><Text style={styles.skipText}>SKIP INTRO</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#030711", alignItems: "center", justifyContent: "center", overflow: "hidden" }, stars: { position: "absolute", width: "130%", height: "130%", opacity: 0.24, borderWidth: 1, borderColor: "#183A70", borderRadius: 500, transform: [{ rotate: "18deg" }] }, signatureWrap: { position: "absolute", alignItems: "center" }, signature: { color: "#B57CFF", fontSize: 45, fontStyle: "italic", fontWeight: "700", letterSpacing: 1, textShadowColor: "#5D21C7", textShadowRadius: 16 }, signatureLine: { width: 126, height: 1, backgroundColor: "#4A77FF", marginTop: 7, opacity: 0.7 },
  scene: { width: 340, height: 350, alignItems: "center", justifyContent: "flex-end", marginTop: -42 }, aura: { position: "absolute", width: 300, height: 260, borderRadius: 150, backgroundColor: "#20106B", opacity: 0.35, bottom: 20 }, cardRack: { position: "absolute", width: 334, height: 170, top: 0, flexDirection: "row", alignItems: "flex-start", justifyContent: "center", zIndex: 4 }, systemCard: { width: 65, height: 103, borderWidth: 2, borderRadius: 10, backgroundColor: "#0B1024", alignItems: "center", justifyContent: "center", gap: 9, shadowColor: "#6A35FF", shadowOpacity: 0.8, shadowRadius: 14, elevation: 8 }, cardLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  envelopeBack: { position: "absolute", bottom: 20, width: 286, height: 177, borderRadius: 18, borderWidth: 2, borderColor: "#3978F6", backgroundColor: "#071331" }, envelopeFlap: { position: "absolute", bottom: 105, width: 282, height: 145, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 2, borderColor: "#5F6CFF", backgroundColor: "#111F54", zIndex: 5 }, envelopeFront: { position: "absolute", bottom: 20, width: 286, height: 177, borderRadius: 18, borderWidth: 2, borderColor: "#59CFFF", backgroundColor: "rgba(8,25,61,0.88)", zIndex: 6 }, seal: { position: "absolute", bottom: 68, width: 78, height: 78, borderRadius: 22, borderWidth: 2, borderColor: "#66E5FF", backgroundColor: "#081B46", alignItems: "center", justifyContent: "center", zIndex: 7, shadowColor: "#45DDFC", shadowOpacity: 1, shadowRadius: 18, elevation: 12 }, sealText: { color: "#57E6FF", fontSize: 48, fontWeight: "900" },
  brand: { alignItems: "center", marginTop: 20 }, classic: { color: "#70D6FF", fontSize: 34, fontWeight: "900", letterSpacing: 1.8, textShadowColor: "#264AFF", textShadowRadius: 10 }, by: { color: "#B57CFF", fontSize: 12, fontWeight: "900", letterSpacing: 5, marginTop: 3 }, loadingWrap: { width: 220, alignItems: "center", marginTop: 25 }, loadingTrack: { width: "100%", height: 8, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "#5562B9", backgroundColor: "#0B1230" }, loadingFill: { height: "100%", backgroundColor: "#B253FF" }, loadingText: { color: "#6F85B5", fontSize: 9, letterSpacing: 4, fontWeight: "900", marginTop: 9 }, skip: { position: "absolute", bottom: 34, padding: 12 }, skipText: { color: "#64749A", fontSize: 10, letterSpacing: 3, fontWeight: "900" },
});
