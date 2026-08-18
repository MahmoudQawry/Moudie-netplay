import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

type HudId = "chat" | "microphone" | "speaker" | "options";
type Position = { x: number; y: number; scale: number };
type Layout = Record<HudId, Position>;

type Props = {
  system: string;
  editable: boolean;
  microphoneMuted: boolean;
  speakerEnabled: boolean;
  onToggleChat: () => void;
  onToggleMicrophone: () => void;
  onToggleSpeaker: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExit: () => void;
};

const ids: HudId[] = ["chat", "microphone", "speaker", "options"];
const defaults: Layout = {
  chat: { x: -142, y: 0, scale: 1 },
  microphone: { x: -74, y: 0, scale: 1 },
  speaker: { x: 0, y: 0, scale: 1 },
  options: { x: 0, y: 56, scale: 1 },
};

export function DraggableHudControls({ system, editable, microphoneMuted, speakerEnabled, onToggleChat, onToggleMicrophone, onToggleSpeaker, onSave, onLoad, onExit }: Props) {
  const { width, height } = useWindowDimensions();
  const orientation = width >= height ? "landscape" : "portrait";
  const storageKey = `moudie.hud-layout.v2.${system}.${orientation}`;
  const [layout, setLayout] = useState<Layout>(defaults);
  const [selected, setSelected] = useState<HudId | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const layoutRef = useRef(layout);
  const dragOriginRef = useRef<Position | null>(null);

  useEffect(() => { layoutRef.current = layout; }, [layout]);
  useEffect(() => {
    let active = true;
    setSelected(null);
    setOptionsOpen(false);
    setLayout(defaults);
    AsyncStorage.getItem(storageKey).then((saved) => {
      if (!active || !saved) return;
      try {
        const parsed = JSON.parse(saved) as Partial<Layout>;
        const normalize = (id: HudId): Position => {
          const value = parsed[id];
          return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.scale)
            ? { x: value.x, y: value.y, scale: Math.max(0.35, value.scale) }
            : defaults[id];
        };
        setLayout({ chat: normalize("chat"), microphone: normalize("microphone"), speaker: normalize("speaker"), options: normalize("options") });
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
    persist({ ...layoutRef.current, [selected]: { ...current, scale: Math.max(0.35, current.scale + delta) } });
  };

  const controls = useMemo(() => ids.map((id) => ({
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

  const labelFor = (id: HudId) => id === "chat" ? "CHAT" : id === "microphone" ? microphoneMuted ? "MIC×" : "MIC" : id === "speaker" ? speakerEnabled ? "SPK" : "SPK×" : "OPTIONS";
  const pressFor = (id: HudId) => id === "chat" ? onToggleChat : id === "microphone" ? onToggleMicrophone : id === "speaker" ? onToggleSpeaker : () => setOptionsOpen((open) => !open);
  const optionsPosition = layout.options;

  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {controls.map(({ id, gesture }) => {
      const position = layout[id];
      return <View key={id} {...gesture.panHandlers} style={[styles.position, { top: 18, right: 10, transform: [{ translateX: position.x }, { translateY: position.y }, { scale: position.scale }] }]}>
        <Pressable disabled={editable} onPress={pressFor(id)} style={({ pressed }) => [styles.control, id === "options" && styles.optionsControl, selected === id && editable && styles.selected, pressed && styles.pressed]}><Text style={styles.controlText}>{labelFor(id)}</Text></Pressable>
      </View>;
    })}
    {optionsOpen && !editable && <View style={[styles.optionsMenu, { top: 76 + optionsPosition.y, right: 10 - optionsPosition.x }]}>
      <Pressable onPress={onSave} style={styles.menuItem}><Text style={styles.menuText}>SAVE</Text></Pressable>
      <Pressable onPress={onLoad} style={styles.menuItem}><Text style={styles.menuText}>LOAD</Text></Pressable>
      <Pressable onPress={onExit} style={[styles.menuItem, styles.exitItem]}><Text style={styles.menuText}>EXIT</Text></Pressable>
    </View>}
    {editable && <View style={styles.editor}><Text style={styles.editorLabel}>{selected ? `EDIT ${selected.toUpperCase()}` : "SELECT HUD"}</Text><Pressable onPress={() => resizeSelected(-0.1)} disabled={!selected} style={[styles.resize, !selected && styles.disabled]}><Text style={styles.resizeText}>−</Text></Pressable><Pressable onPress={() => resizeSelected(0.1)} disabled={!selected} style={[styles.resize, !selected && styles.disabled]}><Text style={styles.resizeText}>+</Text></Pressable></View>}
  </View>;
}

const styles = StyleSheet.create({
  position: { position: "absolute" },
  control: { minWidth: 54, height: 42, paddingHorizontal: 8, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(6, 20, 34, 0.88)", borderColor: "rgba(184, 224, 246, 0.76)", borderWidth: 1 },
  optionsControl: { minWidth: 80, backgroundColor: "rgba(42, 28, 67, 0.93)", borderColor: "#B978FF" },
  controlText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  selected: { borderColor: "#FFFFFF", borderWidth: 2 },
  pressed: { opacity: 0.72 },
  optionsMenu: { position: "absolute", minWidth: 112, borderRadius: 13, overflow: "hidden", borderWidth: 1, borderColor: "#566C85", backgroundColor: "rgba(8, 18, 31, 0.96)" },
  menuItem: { minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#273A4D" },
  exitItem: { borderBottomWidth: 0, backgroundColor: "rgba(118, 45, 61, 0.5)" },
  menuText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", textAlign: "center" },
  editor: { position: "absolute", top: 7, left: 8, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(6, 16, 27, 0.92)", borderColor: "#4A7895", borderWidth: 1, borderRadius: 11, padding: 5 },
  editorLabel: { color: "#D8F4FF", fontSize: 9, fontWeight: "900", maxWidth: 105 },
  resize: { width: 29, height: 29, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#1B4965" },
  resizeText: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  disabled: { opacity: 0.4 },
});
