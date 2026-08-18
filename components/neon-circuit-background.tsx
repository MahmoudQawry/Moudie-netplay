import { StyleSheet, View } from "react-native";

export function NeonCircuitBackground() {
  return (
    <View pointerEvents="none" style={styles.canvas}>
      <View style={[styles.glow, styles.glowPurple]} />
      <View style={[styles.glow, styles.glowCyan]} />
      <View style={styles.grid}>
        {Array.from({ length: 24 }, (_, index) => <View key={index} style={[styles.trace, { left: `${(index % 4) * 27 - 8}%`, top: Math.floor(index / 4) * 134 + 10, transform: [{ rotate: index % 2 ? "180deg" : "0deg" }] }]} />)}
      </View>
      <View style={[styles.dot, styles.dotCyan]} />
      <View style={[styles.dot, styles.dotViolet]} />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#0D071B" },
  glow: { position: "absolute", borderRadius: 180, opacity: 0.24 },
  glowPurple: { width: 340, height: 340, backgroundColor: "#7025CB", top: -200, right: -150 },
  glowCyan: { width: 280, height: 280, backgroundColor: "#067EAD", bottom: -165, left: -135 },
  grid: { ...StyleSheet.absoluteFillObject, opacity: 0.32 },
  trace: { position: "absolute", width: 150, height: 98, borderLeftWidth: 1, borderTopWidth: 1, borderRightWidth: 1, borderColor: "#32224E", borderTopRightRadius: 16 },
  dot: { position: "absolute", width: 8, height: 8, borderRadius: 8, shadowOpacity: 1, shadowRadius: 10, elevation: 3 },
  dotCyan: { left: 23, top: 140, backgroundColor: "#27DDF7", shadowColor: "#27DDF7" },
  dotViolet: { right: 20, top: 155, backgroundColor: "#C176FF", shadowColor: "#C176FF" },
});
