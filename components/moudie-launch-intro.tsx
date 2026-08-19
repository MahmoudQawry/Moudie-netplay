import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

type Props = { children: ReactNode };
type IntroIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const cards: { label: string; color: string; icon: IntroIconName }[] = [
  { label: "PS1", color: "#B85BFF", icon: "controller-classic" },
  { label: "PSP", color: "#38BCFF", icon: "gamepad-variant" },
  { label: "NES", color: "#FF5D63", icon: "controller-classic-outline" },
  { label: "SEGA", color: "#75D868", icon: "gamepad-variant-outline" },
  { label: "ARCADE", color: "#FFB245", icon: "gamepad-variant" },
];

/** A short, JavaScript-rendered launch sequence; it never blocks the route tree behind it. */
export function MoudieLaunchIntro({ children }: Props) {
  const [visible, setVisible] = useState(true);
  const envelope = useRef(new Animated.Value(0)).current;
  const seal = useRef(new Animated.Value(0)).current;
  const signature = useRef(new Animated.Value(0)).current;
  const cardValues = useRef(cards.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const sequence = Animated.sequence([
      Animated.delay(180),
      Animated.timing(envelope, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.stagger(95, cardValues.map((value) => Animated.timing(value, { toValue: 1, duration: 360, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }))),
      Animated.parallel([
        Animated.spring(seal, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        Animated.timing(signature, { toValue: 1, duration: 280, delay: 180, useNativeDriver: true }),
      ]),
    ]);
    sequence.start();
    const dismiss = setTimeout(() => setVisible(false), 2500);
    return () => { sequence.stop(); clearTimeout(dismiss); };
  }, [cardValues, envelope, seal, signature]);

  return <View style={styles.root}>
    {children}
    {visible && <Animated.View style={styles.overlay} accessibilityLabel="Moudie animated launch">
      <View style={styles.circuitGlow} />
      <View style={styles.stage}>
        <Animated.View style={[styles.cards, { opacity: envelope, transform: [{ translateY: envelope.interpolate({ inputRange: [0, 1], outputRange: [90, -12] }) }] }]}>
          {cards.map((card, index) => <Animated.View key={card.label} style={[styles.card, { backgroundColor: card.color, transform: [{ rotate: `${(index - 2) * 7}deg` }, { translateX: (index - 2) * 23 }, { translateY: cardValues[index].interpolate({ inputRange: [0, 1], outputRange: [64, 0] }) }, { scale: cardValues[index].interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }], opacity: cardValues[index] }]}>
            <MaterialCommunityIcons name={card.icon} size={27} color="#10122A" />
            <Text style={styles.cardLabel}>{card.label}</Text>
          </Animated.View>)}
        </Animated.View>
        <View style={styles.envelopeBase}><View style={styles.envelopeLine} /></View>
        <Animated.View style={[styles.envelopeFlap, { transform: [{ rotateX: envelope.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-136deg"] }) }] }]} />
        <Animated.View style={[styles.seal, { opacity: seal, transform: [{ scale: seal.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) }] }]}><Text style={styles.sealText}>M</Text></Animated.View>
      </View>
      <Animated.Text style={[styles.signature, { opacity: signature, transform: [{ translateX: signature.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>Moudie</Animated.Text>
      <Pressable onPress={() => setVisible(false)} style={styles.skip}><Text style={styles.skipText}>SKIP INTRO</Text></Pressable>
    </Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#090817", overflow: "hidden" },
  circuitGlow: { position: "absolute", width: 520, height: 520, borderRadius: 260, backgroundColor: "#27205F", opacity: 0.55, transform: [{ scaleX: 1.45 }] },
  stage: { width: 300, height: 292, alignItems: "center", justifyContent: "flex-end" },
  cards: { position: "absolute", top: 16, width: 270, height: 190, flexDirection: "row", alignItems: "flex-end", justifyContent: "center" },
  card: { width: 68, height: 118, borderRadius: 14, borderWidth: 2, borderColor: "rgba(255,255,255,0.62)", alignItems: "center", justifyContent: "center", paddingTop: 5, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, elevation: 7 },
  cardLabel: { color: "#111229", fontSize: 9, fontWeight: "900", marginTop: 8 },
  envelopeBase: { width: 296, height: 170, borderRadius: 20, borderWidth: 2, borderColor: "#55E8FF", backgroundColor: "#171447", overflow: "hidden", justifyContent: "flex-end" },
  envelopeLine: { height: 4, backgroundColor: "#6446C5", marginHorizontal: 22, marginBottom: 22, opacity: 0.9 },
  envelopeFlap: { position: "absolute", bottom: 118, width: 294, height: 136, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: "#26317A", borderWidth: 2, borderColor: "#65EBFF", transformOrigin: "bottom" },
  seal: { position: "absolute", bottom: 57, width: 102, height: 102, borderRadius: 28, backgroundColor: "#0ED5E9", borderWidth: 5, borderColor: "#ADFAFF", alignItems: "center", justifyContent: "center", shadowColor: "#00E5FF", shadowOpacity: 0.8, shadowRadius: 22, elevation: 12 },
  sealText: { color: "#13103E", fontSize: 65, fontWeight: "900", lineHeight: 72 },
  signature: { color: "#C7F7FF", fontSize: 28, fontStyle: "italic", fontWeight: "700", marginTop: 24, letterSpacing: 0.4 },
  skip: { position: "absolute", bottom: 38, paddingHorizontal: 18, paddingVertical: 10 },
  skipText: { color: "#A9B6D9", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
});
