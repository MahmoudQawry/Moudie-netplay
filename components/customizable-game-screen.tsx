import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";

type SystemId = "famicom" | "ps1" | "psp" | "sega" | "arcade";
type Orientation = "portrait" | "landscape";
type Frame = { x: number; y: number; width: number; height: number };

type Props = {
  system: SystemId;
  editable: boolean;
  orientation?: Orientation;
};

const PREFIX = "moudie.screen-layout.v1.";
const defaults: Record<SystemId, Record<Orientation, Frame>> = {
  famicom: { portrait: { x: 4, y: 3, width: 92, height: 43 }, landscape: { x: 24, y: 15, width: 52, height: 70 } },
  ps1: { portrait: { x: 4, y: 3, width: 92, height: 43 }, landscape: { x: 24, y: 15, width: 52, height: 70 } },
  psp: { portrait: { x: 4, y: 3, width: 92, height: 43 }, landscape: { x: 24, y: 15, width: 52, height: 70 } },
  sega: { portrait: { x: 4, y: 3, width: 92, height: 43 }, landscape: { x: 24, y: 15, width: 52, height: 70 } },
  arcade: { portrait: { x: 4, y: 3, width: 92, height: 43 }, landscape: { x: 24, y: 15, width: 52, height: 70 } },
};

function clampFrame(frame: Frame): Frame {
  const width = Math.max(25, Math.min(96, frame.width));
  const height = Math.max(20, Math.min(82, frame.height));
  return {
    width,
    height,
    x: Math.max(1, Math.min(99 - width, frame.x)),
    y: Math.max(1, Math.min(99 - height, frame.y)),
  };
}

export function CustomizableGameScreen({ system, editable, orientation }: Props) {
  const viewport = useWindowDimensions();
  const resolvedOrientation: Orientation = orientation ?? (viewport.width >= viewport.height ? "landscape" : "portrait");
  const storageKey = `${PREFIX}${system}.${resolvedOrientation}`;
  const [frame, setFrame] = useState<Frame>(defaults[system][resolvedOrientation]);
  const [surface, setSurface] = useState({ width: 1, height: 1 });
  const frameRef = useRef(frame);
  const dragStart = useRef<Frame | null>(null);

  useEffect(() => { frameRef.current = frame; }, [frame]);
  useEffect(() => {
    let alive = true;
    setFrame(defaults[system][resolvedOrientation]);
    AsyncStorage.getItem(storageKey).then((saved) => {
      if (!alive || !saved) return;
      try {
        const decoded = JSON.parse(saved) as Frame;
        if ([decoded.x, decoded.y, decoded.width, decoded.height].every((value) => typeof value === "number")) setFrame(clampFrame(decoded));
      } catch { /* keep defaults */ }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [storageKey, system, resolvedOrientation]);

  const save = (next: Frame) => {
    frameRef.current = next;
    AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
  };

  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => editable,
    onMoveShouldSetPanResponder: () => editable,
    onPanResponderGrant: () => { dragStart.current = frameRef.current; },
    onPanResponderMove: (_, state) => {
      if (!dragStart.current || surface.width < 2 || surface.height < 2) return;
      setFrame(clampFrame({
        ...dragStart.current,
        x: dragStart.current.x + state.dx / surface.width * 100,
        y: dragStart.current.y + state.dy / surface.height * 100,
      }));
    },
    onPanResponderRelease: () => { if (dragStart.current) save(frameRef.current); dragStart.current = null; },
    onPanResponderTerminate: () => { if (dragStart.current) save(frameRef.current); dragStart.current = null; },
  });

  const onLayout = (event: LayoutChangeEvent) => setSurface(event.nativeEvent.layout);
  const resize = (delta: number) => {
    const next = clampFrame({ ...frameRef.current, width: frameRef.current.width + delta, height: frameRef.current.height + delta * 0.55 });
    setFrame(next); save(next);
  };
  const reset = () => { const next = defaults[system][resolvedOrientation]; setFrame(next); save(next); };

  return (
    <View pointerEvents={editable ? "auto" : "none"} style={StyleSheet.absoluteFill} onLayout={onLayout} accessibilityLabel={`${system} ${resolvedOrientation} game screen`}>
      <View {...pan.panHandlers} style={[styles.screen, { left: `${frame.x}%`, top: `${frame.y}%`, width: `${frame.width}%`, height: `${frame.height}%` }, editable && styles.editable]}>
        <View style={styles.inner}>
          {editable && <Text style={styles.hint}>GAME SCREEN · DRAG TO MOVE</Text>}
        </View>
      </View>
      {editable && (
        <View style={styles.toolbar}>
          <Text style={styles.label}>SCREEN</Text>
          <Pressable onPress={() => resize(-4)} style={styles.button}><Text style={styles.buttonText}>−</Text></Pressable>
          <Pressable onPress={() => resize(4)} style={styles.button}><Text style={styles.buttonText}>+</Text></Pressable>
          <Pressable onPress={reset} style={styles.reset}><Text style={styles.resetText}>RESET</Text></Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { position: "absolute", backgroundColor: "#000000", borderWidth: 1, borderColor: "#1D2630", overflow: "hidden" },
  editable: { borderColor: "#62C2EB", borderWidth: 2 },
  inner: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000000" },
  hint: { color: "#536474", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  toolbar: { position: "absolute", left: 12, right: 12, bottom: 10, height: 44, borderRadius: 14, backgroundColor: "rgba(14,18,24,.94)", borderWidth: 1, borderColor: "#334757", flexDirection: "row", alignItems: "center", paddingHorizontal: 9, gap: 7 },
  label: { color: "#9CB8CB", fontSize: 10, fontWeight: "900", marginRight: "auto" },
  button: { width: 34, height: 32, borderRadius: 9, backgroundColor: "#1A2B38", alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  reset: { height: 32, paddingHorizontal: 10, borderRadius: 9, backgroundColor: "#253B4A", alignItems: "center", justifyContent: "center" },
  resetText: { color: "#D9F4FF", fontSize: 9, fontWeight: "900" },
});
