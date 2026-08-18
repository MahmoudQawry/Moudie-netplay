import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

type SystemId = "famicom" | "ps1" | "psp" | "sega" | "arcade";
type ControlId = "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B" | "C" | "X" | "O" | "TRIANGLE" | "SQUARE" | "L" | "R" | "L1" | "R1" | "START" | "SELECT" | "ONE" | "TWO" | "THREE" | "FOUR";
type Position = { x: number; y: number; size: number };
type ControllerLayout = Partial<Record<ControlId, Position>>;

type Props = {
  system: SystemId;
  editable: boolean;
  onButtonChange?: (button: ControlId, isDown: boolean) => void;
};

const STORAGE_PREFIX = "moudie.controller-layout.v2.";

const profiles: Record<SystemId, { controls: ControlId[]; accent: string; labels: Partial<Record<ControlId, string>>; defaults: ControllerLayout }> = {
  famicom: {
    accent: "#F5C84C",
    controls: ["UP", "DOWN", "LEFT", "RIGHT", "A", "B", "START", "SELECT"],
    labels: { UP: "▲", DOWN: "▼", LEFT: "◀", RIGHT: "▶", A: "A", B: "B", START: "START", SELECT: "SELECT" },
    defaults: { UP: { x: 13, y: 54, size: 54 }, DOWN: { x: 13, y: 73, size: 54 }, LEFT: { x: 3, y: 64, size: 54 }, RIGHT: { x: 23, y: 64, size: 54 }, A: { x: 78, y: 69, size: 58 }, B: { x: 64, y: 61, size: 58 }, START: { x: 51, y: 89, size: 42 }, SELECT: { x: 37, y: 89, size: 42 }, },
  },
  ps1: {
    accent: "#B978FF",
    controls: ["UP", "DOWN", "LEFT", "RIGHT", "X", "O", "TRIANGLE", "SQUARE", "L1", "R1", "START", "SELECT"],
    labels: { UP: "▲", DOWN: "▼", LEFT: "◀", RIGHT: "▶", X: "×", O: "○", TRIANGLE: "△", SQUARE: "□", L1: "L1", R1: "R1", START: "START", SELECT: "SELECT" },
    defaults: { UP: { x: 13, y: 54, size: 54 }, DOWN: { x: 13, y: 73, size: 54 }, LEFT: { x: 3, y: 64, size: 54 }, RIGHT: { x: 23, y: 64, size: 54 }, TRIANGLE: { x: 78, y: 54, size: 52 }, X: { x: 78, y: 73, size: 52 }, SQUARE: { x: 68, y: 64, size: 52 }, O: { x: 88, y: 64, size: 52 }, L1: { x: 5, y: 37, size: 44 }, R1: { x: 82, y: 37, size: 44 }, START: { x: 52, y: 89, size: 41 }, SELECT: { x: 37, y: 89, size: 41 }, },
  },
  psp: {
    accent: "#45DDFC",
    controls: ["UP", "DOWN", "LEFT", "RIGHT", "X", "O", "TRIANGLE", "SQUARE", "L", "R", "START", "SELECT"],
    labels: { UP: "▲", DOWN: "▼", LEFT: "◀", RIGHT: "▶", X: "×", O: "○", TRIANGLE: "△", SQUARE: "□", L: "L", R: "R", START: "START", SELECT: "SELECT" },
    defaults: { UP: { x: 13, y: 54, size: 54 }, DOWN: { x: 13, y: 73, size: 54 }, LEFT: { x: 3, y: 64, size: 54 }, RIGHT: { x: 23, y: 64, size: 54 }, TRIANGLE: { x: 78, y: 54, size: 52 }, X: { x: 78, y: 73, size: 52 }, SQUARE: { x: 68, y: 64, size: 52 }, O: { x: 88, y: 64, size: 52 }, L: { x: 5, y: 37, size: 44 }, R: { x: 82, y: 37, size: 44 }, START: { x: 52, y: 89, size: 41 }, SELECT: { x: 37, y: 89, size: 41 }, },
  },
  sega: {
    accent: "#70E39B",
    controls: ["UP", "DOWN", "LEFT", "RIGHT", "A", "B", "C", "START"],
    labels: { UP: "▲", DOWN: "▼", LEFT: "◀", RIGHT: "▶", A: "A", B: "B", C: "C", START: "START" },
    defaults: { UP: { x: 13, y: 54, size: 54 }, DOWN: { x: 13, y: 73, size: 54 }, LEFT: { x: 3, y: 64, size: 54 }, RIGHT: { x: 23, y: 64, size: 54 }, A: { x: 64, y: 67, size: 56 }, B: { x: 76, y: 61, size: 56 }, C: { x: 88, y: 55, size: 56 }, START: { x: 46, y: 89, size: 44 }, },
  },
  arcade: {
    accent: "#FF886D",
    controls: ["UP", "DOWN", "LEFT", "RIGHT", "ONE", "TWO", "THREE", "FOUR", "START"],
    labels: { UP: "▲", DOWN: "▼", LEFT: "◀", RIGHT: "▶", ONE: "1", TWO: "2", THREE: "3", FOUR: "4", START: "START" },
    defaults: { UP: { x: 13, y: 54, size: 58 }, DOWN: { x: 13, y: 73, size: 58 }, LEFT: { x: 3, y: 64, size: 58 }, RIGHT: { x: 23, y: 64, size: 58 }, ONE: { x: 68, y: 57, size: 55 }, TWO: { x: 81, y: 57, size: 55 }, THREE: { x: 68, y: 73, size: 55 }, FOUR: { x: 81, y: 73, size: 55 }, START: { x: 46, y: 89, size: 44 }, },
  },
};

function cloneLayout(layout: ControllerLayout): ControllerLayout {
  return Object.fromEntries(Object.entries(layout).map(([key, value]) => [key, { ...value }])) as ControllerLayout;
}

export function CustomizableController({ system, editable, onButtonChange }: Props) {
  const profile = profiles[system];
  const [layout, setLayout] = useState<ControllerLayout>(() => cloneLayout(profile.defaults));
  const [scale, setScale] = useState(1);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const currentLayoutRef = useRef(layout);
  const dragStartRef = useRef<Position | null>(null);

  useEffect(() => { currentLayoutRef.current = layout; }, [layout]);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(`${STORAGE_PREFIX}${system}`).then((saved) => {
      if (!active || !saved) return;
      try {
        const decoded = JSON.parse(saved) as { scale?: number; layout?: ControllerLayout };
        if (decoded.layout) setLayout({ ...cloneLayout(profile.defaults), ...decoded.layout });
        if (typeof decoded.scale === "number" && decoded.scale >= 0.65 && decoded.scale <= 1.5) setScale(decoded.scale);
      } catch { /* keep safe defaults */ }
    });
    return () => { active = false; };
  }, [profile.defaults, system]);

  const save = useCallback((nextLayout = currentLayoutRef.current, nextScale = scale) => {
    AsyncStorage.setItem(`${STORAGE_PREFIX}${system}`, JSON.stringify({ layout: nextLayout, scale: nextScale })).catch(() => undefined);
  }, [scale, system]);
  const resize = (delta: number) => {
    setScale((value) => {
      const next = Math.max(0.65, Math.min(1.5, Math.round((value + delta) * 100) / 100));
      save(currentLayoutRef.current, next);
      return next;
    });
  };
  const reset = () => {
    const restored = cloneLayout(profile.defaults);
    setLayout(restored);
    setScale(1);
    save(restored, 1);
  };
  const onSurfaceLayout = (event: LayoutChangeEvent) => setSize(event.nativeEvent.layout);

  const controls = useMemo(() => profile.controls.map((id) => {
    const gesture = PanResponder.create({
      onStartShouldSetPanResponder: () => editable,
      onMoveShouldSetPanResponder: () => editable,
      onPanResponderGrant: () => { dragStartRef.current = currentLayoutRef.current[id] ?? profile.defaults[id] ?? null; },
      onPanResponderMove: (_, state) => {
        const initial = dragStartRef.current;
        if (!initial || size.width < 2 || size.height < 2) return;
        const next = {
          ...currentLayoutRef.current,
          [id]: {
            ...initial,
            x: Math.max(0, Math.min(100, initial.x + (state.dx / size.width) * 100)),
            y: Math.max(30, Math.min(94, initial.y + (state.dy / size.height) * 100)),
          },
        };
        setLayout(next);
      },
      onPanResponderRelease: () => { dragStartRef.current = null; save(); },
      onPanResponderTerminate: () => { dragStartRef.current = null; save(); },
    });
    return { id, gesture };
  }), [editable, profile.controls, profile.defaults, save, size.height, size.width]);

  return (
    <View style={styles.root} onLayout={onSurfaceLayout}>
      {controls.map(({ id, gesture }) => {
        const position = layout[id] ?? profile.defaults[id];
        if (!position) return null;
        const controlSize = position.size * scale;
        const isMeta = id === "START" || id === "SELECT" || id === "L" || id === "R" || id === "L1" || id === "R1";
        return (
          <View key={id} {...gesture.panHandlers} style={[styles.position, { left: `${position.x}%`, top: `${position.y}%`, marginLeft: -controlSize / 2, marginTop: -controlSize / 2 }]}>
            <Pressable
              disabled={editable}
              onPressIn={() => onButtonChange?.(id, true)}
              onPressOut={() => onButtonChange?.(id, false)}
              style={({ pressed }) => [styles.button, isMeta && styles.metaButton, { width: controlSize, height: controlSize, borderRadius: controlSize / 2, borderColor: profile.accent }, pressed && styles.buttonPressed, editable && styles.editButton]}
            >
              <Text style={[styles.buttonText, isMeta && styles.metaText, { color: profile.accent }]}>{profile.labels[id] ?? id}</Text>
            </Pressable>
          </View>
        );
      })}
      <View style={styles.customizeBar}>
        <Pressable onPress={() => resize(-0.1)} style={({ pressed }) => [styles.utilityButton, pressed && styles.utilityPressed]}><Text style={styles.utilityText}>−</Text></Pressable>
        <Text style={styles.scaleText}>{Math.round(scale * 100)}%</Text>
        <Pressable onPress={() => resize(0.1)} style={({ pressed }) => [styles.utilityButton, pressed && styles.utilityPressed]}><Text style={styles.utilityText}>+</Text></Pressable>
        {editable && <Pressable onPress={reset} style={({ pressed }) => [styles.resetButton, pressed && styles.utilityPressed]}><Text style={styles.resetText}>إعادة ضبط</Text></Pressable>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 330, width: "100%" },
  position: { position: "absolute" },
  button: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(13, 13, 21, 0.62)", borderWidth: 2, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, elevation: 5 },
  metaButton: { backgroundColor: "rgba(13, 13, 21, 0.82)", borderWidth: 1.5 },
  buttonText: { fontSize: 19, fontWeight: "900" },
  metaText: { fontSize: 9, letterSpacing: 0.4 },
  buttonPressed: { transform: [{ scale: 0.92 }], backgroundColor: "rgba(255,255,255,0.2)" },
  editButton: { borderStyle: "dashed", backgroundColor: "rgba(255,255,255,0.10)" },
  customizeBar: { position: "absolute", top: 8, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(16, 13, 28, 0.78)", borderWidth: 1, borderColor: "#38304D", borderRadius: 16, paddingHorizontal: 8, paddingVertical: 5 },
  utilityButton: { height: 30, width: 30, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#252137" },
  utilityText: { color: "#FFFFFF", fontSize: 19, fontWeight: "800" },
  scaleText: { minWidth: 38, color: "#E5E0F5", fontSize: 11, fontWeight: "900", textAlign: "center" },
  resetButton: { marginRight: 2, paddingHorizontal: 8, height: 30, justifyContent: "center", borderRadius: 10, backgroundColor: "#352852" },
  resetText: { color: "#D9C4FF", fontSize: 10, fontWeight: "800" },
  utilityPressed: { opacity: 0.7 },
});
