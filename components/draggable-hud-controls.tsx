import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

type HudId = "chat" | "microphone" | "save" | "load" | "exit";
type Position = { x: number; y: number; scale: number };
type Layout = Record<HudId, Position>;

type Props = {
  system: string;
  editable: boolean;
  microphoneMuted: boolean;
  onToggleChat: () => void;
  onToggleMicrophone: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExit: () => void;
};

const defaults: Layout = {
  chat: { x: 0, y: 0, scale: 1 },
  microphone: { x: 0, y: 0, scale: 1 },
  save: { x: 0, y: 0, scale: 1 },
  load: { x: 0, y: 0, scale: 1 },
  exit: { x: 0, y: 0, scale: 1 },
};

export function DraggableHudControls({ system, editable, microphoneMuted, onToggleChat, onToggleMicrophone, onSave, onLoad, onExit }: Props) {
  const { width, height } = useWindowDimensions();
  const orientation = width >= height ? "landscape" : "portrait";
  const storageKey = `moudie.hud-layout.v1.${system}.${orientation}`;
  const [layout, setLayout] = useState<Layout>(defaults);
  const [selected, setSelected] = useState<HudId | null>(null);
  const layoutRef = useRef(layout);
  const dragOriginRef = useRef<Position | null>(null);

  useEffect(() => { layoutRef.current = layout; }, [layout]);
  useEffect(() => {
    let active = true;
    setSelected(null);
    setLayout(defaults);
    AsyncStorage.getItem(storageKey).then((saved) => {
      if (!active || !saved) return;
      try {
        const parsed = JSON.parse(saved) as Partial<Layout>;
        const normalize = (id: HudId): Position => {
          const value = parsed[id];
          return value && typeof value.x === "number" && typeof value.y === "number" && typeof value.scale === "number"
            ? { x: value.x, y: value.y, scale: Math.max(0.65, Math.min(1.75, value.scale)) }
            : defaults[id];
        };
        setLayout({ chat: normalize("chat"), microphone: normalize("microphone"), save: normalize("save"), load: normalize("load"), exit: normalize("exit") });
      } catch { /* Use defaults when the saved layout is invalid. */ }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [storageKey]);

  const persist = useCallback((next: Layout) => {
    layoutRef.current = next;
    setLayout(next);
    AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
  }, [storageKey]);

  const resizeSelected = (delta: number) => {
    if (!selected) return;
    const current = layoutRef.current[selected];
    persist({ ...layoutRef.current, [selected]: { ...current, scale: Math.max(0.65, Math.min(1.75, current.scale + delta)) } });
  };

  const controls = useMemo(() => (["chat", "microphone", "save", "load", "exit"] as HudId[]).map((id) => ({
    id,
    gesture: PanResponder.create({
      onStartShouldSetPanResponder: () => editable,
      onMoveShouldSetPanResponder: () => editable,
      onPanResponderGrant: () => { setSelected(id); dragOriginRef.current = layoutRef.current[id]; },
      onPanResponderMove: (_, gesture) => {
        const origin = dragOriginRef.current;
        if (!origin) return;
        const next = { ...layoutRef.current, [id]: { ...origin, x: origin.x + gesture.dx, y: origin.y + gesture.dy } };
        layoutRef.current = next;
        setLayout(next);
      },
      onPanResponderRelease: () => { dragOriginRef.current = null; persist(layoutRef.current); },
      onPanResponderTerminate: () => { dragOriginRef.current = null; persist(layoutRef.current); },
    }),
  })), [editable, persist]);

  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {controls.map(({ id, gesture }) => {
      const position = layout[id];
      const top = 18 + (["chat", "microphone", "save", "load", "exit"] as HudId[]).indexOf(id) * 48;
      const label = id === "chat" ? "CHAT" : id === "microphone" ? microphoneMuted ? "MIC×" : "MIC" : id.toUpperCase();
      const onPress = id === "chat" ? onToggleChat : id === "microphone" ? onToggleMicrophone : id === "save" ? onSave : id === "load" ? onLoad : onExit;
      return <View key={id} {...gesture.panHandlers} style={[styles.position, { top, right: 10, transform: [{ translateX: position.x }, { translateY: position.y }, { scale: position.scale }] }]}>
        <Pressable disabled={editable} onPress={onPress} style={({ pressed }) => [styles.control, selected === id && editable && styles.selected, pressed && styles.pressed]}>
          <Text style={styles.controlText}>{label}</Text>
        </Pressable>
      </View>;
    })}
    {editable && <View style={styles.editor}><Text style={styles.editorLabel}>{selected ? `EDIT ${selected.toUpperCase()}` : "TAP CHAT OR MIC"}</Text><Pressable onPress={() => resizeSelected(-0.1)} disabled={!selected} style={[styles.resize, !selected && styles.disabled]}><Text style={styles.resizeText}>−</Text></Pressable><Pressable onPress={() => resizeSelected(0.1)} disabled={!selected} style={[styles.resize, !selected && styles.disabled]}><Text style={styles.resizeText}>+</Text></Pressable></View>}
  </View>;
}

const styles = StyleSheet.create({
  position: { position: "absolute" },
  control: { minWidth: 54, height: 42, paddingHorizontal: 8, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(6, 20, 34, 0.88)", borderColor: "rgba(184, 224, 246, 0.76)", borderWidth: 1 },
  controlText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  selected: { borderColor: "#FFFFFF", borderWidth: 2 },
  pressed: { opacity: 0.72 },
  editor: { position: "absolute", top: 7, left: 8, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(6, 16, 27, 0.92)", borderColor: "#4A7895", borderWidth: 1, borderRadius: 11, padding: 5 },
  editorLabel: { color: "#D8F4FF", fontSize: 9, fontWeight: "900", maxWidth: 105 },
  resize: { width: 29, height: 29, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#1B4965" },
  resizeText: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  disabled: { opacity: 0.4 },
});
