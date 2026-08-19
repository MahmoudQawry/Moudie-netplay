import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type State = { hasError: boolean };

/** Keeps a startup render error visible and recoverable instead of leaving Android black. */
export class StartupRecoveryBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Moudie startup render recovery", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <View style={styles.root}>
      <View style={styles.seal}><Text style={styles.m}>M</Text></View>
      <Text style={styles.title}>MOUDIE IS READY</Text>
      <Text style={styles.copy}>The first screen needs to be drawn again. Your local games and room data remain on this device.</Text>
      <Pressable onPress={() => this.setState({ hasError: false })} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>TRY AGAIN</Text></Pressable>
    </View>;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#090817", padding: 28 },
  seal: { width: 92, height: 92, borderRadius: 27, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#44E7FF", backgroundColor: "#15113B" },
  m: { color: "#74F2FF", fontSize: 54, fontWeight: "900" },
  title: { color: "#F8FBFF", fontSize: 20, fontWeight: "900", letterSpacing: 1.2, marginTop: 22 },
  copy: { color: "#B8BED9", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 10, maxWidth: 310 },
  button: { marginTop: 24, borderRadius: 14, backgroundColor: "#28CBE7", paddingHorizontal: 24, paddingVertical: 14 },
  buttonText: { color: "#07101A", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  pressed: { opacity: 0.75 },
});
