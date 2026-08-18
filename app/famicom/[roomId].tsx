import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, I18nManager, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Socket } from "socket.io-client";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { CustomizableController } from "@/components/customizable-controller";
import { FamicomNativePlayer, type FamicomNativePlayerHandle } from "@/components/famicom-native-player";
import { RoomVoiceChat } from "@/components/room-voice-chat";
import { ScreenContainer } from "@/components/screen-container";
import { FAMICOM_CORE_VERSION, decodeFamicomMessage, fingerprintRom, isNesFile, peerIdForRoom, type FamicomMessage } from "@/lib/famicom-netplay";
import { FamicomInputCoordinator } from "@/lib/famicom-input-coordinator";
import { haptic } from "@/lib/haptics";
import { createNetplaySocket, type RoomChatMessage } from "@/lib/netplay-socket";
import { shouldApplyAuthoritativeState } from "@/lib/netplay-sync";
import { setRealtimeRoomReady } from "@/lib/realtime-room-service";
import { getRoomCredential, type RoomCredential } from "@/lib/room-storage";
import { useRealtimeRoomSnapshot } from "@/lib/use-realtime-room-snapshot";
import MoudieEmulatorModule from "@/modules/moudie-emulator/src/MoudieEmulatorModule";

type JsNesModule = {
  Browser: new (options: { container: HTMLElement; romData: ArrayBuffer }) => {
    destroy: () => void;
    nes: {
      buttonDown: (player: number, button: number) => void;
      buttonUp: (player: number, button: number) => void;
      reset: () => void;
      toJSON: () => unknown;
      fromJSON: (state: unknown) => void;
    };
  };
  Controller: Record<string, number>;
};

type Connection = {
  on: (event: "open" | "data" | "close" | "error", callback: (value?: unknown) => void) => void;
  send: (message: FamicomMessage) => void;
  close: () => void;
};

type PeerInstance = {
  on: (event: "open" | "connection" | "error", callback: (value?: unknown) => void) => void;
  connect: (peerId: string, options: { reliable: boolean }) => Connection;
  destroy: () => void;
};

type ButtonName = "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B" | "START" | "SELECT";
type RoomVoiceChatHandle = { setMicrophoneEnabled: (enabled: boolean) => Promise<void> };

export default function FamicomScreen() {
  const { roomId: rawRoomId } = useLocalSearchParams<{ roomId: string }>();
  const roomId = Number(rawRoomId);
  const mountRef = useRef<HTMLElement | null>(null);
  const nativePlayerRef = useRef<FamicomNativePlayerHandle | null>(null);
  const browserRef = useRef<InstanceType<JsNesModule["Browser"]> | null>(null);
  const jsNesRef = useRef<JsNesModule | null>(null);
  const peerRef = useRef<PeerInstance | null>(null);
  const connectionRef = useRef<Connection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const voiceChatRef = useRef<RoomVoiceChatHandle | null>(null);
  const assignedPlayerRef = useRef<1 | 2 | null>(null);
  const fingerprintRef = useRef<string | null>(null);
  const applyButtonRef = useRef<(player: 1 | 2, button: string, isDown: boolean) => void>(() => undefined);
  const inputCoordinatorRef = useRef(new FamicomInputCoordinator<ButtonName>(
    new Set<ButtonName>(["UP", "DOWN", "LEFT", "RIGHT"]),
    new Set<ButtonName>(["A", "B"]),
  ));
  const directionReleaseTimersRef = useRef<Partial<Record<ButtonName, ReturnType<typeof setTimeout>>>>({});
  const famicomSyncSequenceRef = useRef(0);
  const lastFamicomSyncRef = useRef(-1);
  const [credential, setCredential] = useState<RoomCredential | null | undefined>(undefined);
  const [romName, setRomName] = useState<string | null>(null);
  const [romUri, setRomUri] = useState<string | null>(null);
  const [romBase64, setRomBase64] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [gameReady, setGameReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isCompatLaunching, setIsCompatLaunching] = useState(false);
  const [networkState, setNetworkState] = useState("Choose a game first");
  const [remoteVerified, setRemoteVerified] = useState(false);
  const [roomConnected, setRoomConnected] = useState(false);
  const [remoteOnline, setRemoteOnline] = useState(false);
  const [assignedPlayer, setAssignedPlayer] = useState<1 | 2 | null>(null);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [inGameChatOpen, setInGameChatOpen] = useState(false);
  const [inGameMicMuted, setInGameMicMuted] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [focusControlEditor, setFocusControlEditor] = useState(false);
  const [startOptionsOpen, setStartOptionsOpen] = useState(false);
  const [startOrientation, setStartOrientation] = useState<"portrait" | "landscape">("landscape");
  const [screenAspect, setScreenAspect] = useState<"fit" | "4:3" | "16:9">("4:3");

  useEffect(() => {
    if (Platform.OS === "web") return;
    MoudieEmulatorModule.setFamicomFocusLandscape(false).catch(() => undefined);
    return () => {
      MoudieEmulatorModule.setFamicomFocusLandscape(false).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (Number.isFinite(roomId)) getRoomCredential(roomId).then(setCredential);
    const releaseTimers = directionReleaseTimersRef.current;
    return () => {
      Object.values(releaseTimers).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      connectionRef.current?.close();
      peerRef.current?.destroy();
      socketRef.current?.disconnect();
      browserRef.current?.destroy();
    };
  }, [roomId]);


  const snapshotQuery = useRealtimeRoomSnapshot(roomId, credential);
  const snapshot = snapshotQuery.data;
  const membership = snapshot?.members.find((member) => member.id === credential?.memberId);
  const isHost = membership?.role === "host";
  const readyCount = snapshot?.members.filter((member) => member.isReady).length ?? 0;

  useEffect(() => {
    if (Platform.OS === "web" || !fingerprint || !snapshot) return;
    const activePlayers = snapshot.members.filter((member) => member.role !== "spectator");
    const matchingPlayers = activePlayers.filter(
      (member) => member.isReady && member.gameFingerprint === fingerprint && member.coreVersion === FAMICOM_CORE_VERSION,
    );
    const verified = activePlayers.length >= 2 && matchingPlayers.length === activePlayers.length;
    setRemoteVerified(verified);
    if (verified && roomConnected) setNetworkState("The other player verified the game file. The host can start the session.");
  }, [fingerprint, roomConnected, snapshot]);

  const applyButton = (player: 1 | 2, button: string, isDown: boolean) => {
    if (Platform.OS !== "web") {
      nativePlayerRef.current?.setButton(player, button, isDown);
      return;
    }
    const browser = browserRef.current;
    const controller = jsNesRef.current?.Controller;
    const value = controller?.[`BUTTON_${button}`];
    if (!browser || typeof value !== "number") return;
    if (isDown) browser.nes.buttonDown(player, value);
    else browser.nes.buttonUp(player, value);
  };
  applyButtonRef.current = applyButton;

  const localStateStorageKey = fingerprint ? `moudie.famicom.state.${fingerprint}` : null;

  const restoreLocalState = async () => {
    if (Platform.OS === "web" || !localStateStorageKey) return;
    try {
      const snapshotValue = await AsyncStorage.getItem(localStateStorageKey);
      if (!snapshotValue) return;
      nativePlayerRef.current?.applyState(snapshotValue);
      setNetworkState("The latest local game state was restored.");
    } catch {
      setNetworkState("Could not restore the latest local game state.");
    }
  };

  const saveLocalState = () => {
    if (Platform.OS === "web" || !localStateStorageKey) return;
    nativePlayerRef.current?.requestState("local");
    setNetworkState("Saving the game state locally…");
  };

  const loadLocalState = async () => {
    if (Platform.OS === "web" || !localStateStorageKey) return;
    const snapshotValue = await AsyncStorage.getItem(localStateStorageKey);
    if (!snapshotValue) {
      Alert.alert("No saved state", "Start the game, then tap Local Save to create a save state for this game.");
      return;
    }
    nativePlayerRef.current?.applyState(snapshotValue);
    setNetworkState("The latest local game state was restored.");
    haptic.success();
  };

  const launchCompatibilityPlayer = async () => {
    if (Platform.OS === "web" || !romUri || !romName) return;
    try {
      setIsCompatLaunching(true);
      setNetworkState("Opening extended compatibility mode locally…");
      await MoudieEmulatorModule.launchFamicomCompatGame(romUri, romName, { orientation: startOrientation, aspectRatio: screenAspect });
      setNetworkState("Extended compatibility mode is running locally. Return here for NetPlay.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open extended compatibility mode.";
      setNetworkState(message);
      Alert.alert("Could not open compatibility mode", message);
      haptic.error();
    } finally {
      setIsCompatLaunching(false);
    }
  };

  const launchNativeFocusPlayer = async () => {
    if (Platform.OS === "web") {
      setFocusMode(true);
      return;
    }
    if (!romUri || !romName) return;
    try {
      setIsCompatLaunching(true);
      setNetworkState("Opening native focus mode with Famicom audio and graphics…");
      await MoudieEmulatorModule.launchFamicomFocusGame(romUri, romName, { orientation: startOrientation, aspectRatio: screenAspect });
      setNetworkState("Native focus mode is open. The NetPlay channel remains in the room; native play is currently local.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open native focus mode.";
      setNetworkState(message);
      Alert.alert("Could not open focus mode", message);
      haptic.error();
    } finally {
      setIsCompatLaunching(false);
    }
  };

  useEffect(() => {
    if (Platform.OS === "web" || !romBase64 || !localStateStorageKey) return;
    const autoSave = setInterval(() => nativePlayerRef.current?.requestState("local"), 20000);
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") nativePlayerRef.current?.requestState("local");
    });
    return () => {
      clearInterval(autoSave);
      appStateSubscription.remove();
    };
  }, [romBase64, localStateStorageKey]);

  const receiveMessage = (rawValue: unknown) => {
    const message = decodeFamicomMessage(rawValue);
    if (!message) return;
    if (message.type === "input") {
      applyButtonRef.current(message.player, message.button, message.isDown);
      return;
    }
    if (message.type === "state") {
      if (!shouldApplyAuthoritativeState(lastFamicomSyncRef.current, message.syncId)) return;
      try {
        browserRef.current?.nes.fromJSON(JSON.parse(message.snapshot));
        lastFamicomSyncRef.current = message.syncId;
        setNetworkState("The host synchronized the game start.");
      } catch {
        setNetworkState("Could not synchronize the game start. Reload the file and reconnect to the room.");
      }
      return;
    }
    if (message.type !== "rom") return;
    const localFingerprint = fingerprintRef.current;
    if (message.fingerprint !== localFingerprint || message.coreVersion !== FAMICOM_CORE_VERSION) {
      setNetworkState("The other player has a different game file or core version.");
      haptic.error();
      return;
    }
    setRemoteVerified(true);
    setNetworkState("Game compatibility verified. The host can start the two-player session.");
    haptic.success();
  };

  const attachConnection = (connection: Connection) => {
    connectionRef.current = connection;
    connection.on("open", () => {
      const currentFingerprint = fingerprintRef.current;
      if (!currentFingerprint) return;
      connection.send({ type: "rom", fingerprint: currentFingerprint, coreVersion: FAMICOM_CORE_VERSION });
      setNetworkState("Connected to the other device. Verifying the game file…");
    });
    connection.on("data", receiveMessage);
    connection.on("close", () => setNetworkState("Connection to the other player was closed."));
    connection.on("error", () => setNetworkState("Could not complete the connection. Check that the other player opened the Famicom player."));
  };

  const connectNativeNetplay = () => {
    if (!credential || !fingerprint) return;
    try {
      socketRef.current?.disconnect();
      setRoomConnected(false);
      setRemoteOnline(false);
      setNetworkState("Connecting the room NetPlay channel…");
      const socket = createNetplaySocket({ roomId, memberId: credential.memberId, memberToken: credential.memberToken });
      socketRef.current = socket;
      socket.on("connect", () => {
        setRoomConnected(true);
        setNetworkState("The room channel is ready. Wait for the other player to join and choose the same file.");
      });
      socket.on("connect_error", () => {
        setRoomConnected(false);
        setNetworkState("Could not connect to the room. Check your internet connection and try again.");
      });
      socket.on("disconnect", () => {
        assignedPlayerRef.current = null;
        setAssignedPlayer(null);
        setRoomConnected(false);
        setRemoteOnline(false);
        setNetworkState("Room connection interrupted; reconnecting automatically…");
      });
      socket.io.on("reconnect_attempt", () => setNetworkState("Reconnecting to the room…"));
      socket.on("netplay:joined", (payload: { onlineMemberIds?: number[]; assignedPlayer?: 1 | 2 }) => {
        const player = payload.assignedPlayer === 1 ? 1 : payload.assignedPlayer === 2 ? 2 : null;
        assignedPlayerRef.current = player;
        setAssignedPlayer(player);
        setRemoteOnline((payload.onlineMemberIds ?? []).some((memberId) => memberId !== credential.memberId));
        if (player === 2) socket.emit("netplay:state-request", { minimumSyncId: lastFamicomSyncRef.current });
      });
      socket.on("netplay:presence", (payload: { memberId: number; online: boolean }) => {
        if (payload.memberId !== credential.memberId) setRemoteOnline(payload.online);
      });
      socket.on("netplay:session-start", (payload: { system?: string }) => {
        if (payload.system !== "nes") return;
        setNetworkState("Game compatibility confirmed. Both players now start from the same local state.");
      });
      socket.on("netplay:session-start-refused", (payload: { message?: string }) => {
        setNetworkState(payload.message ?? "Waiting for the other player to confirm the game file and core.");
      });
      socket.on("netplay:input", (payload: { player: 1 | 2; button: ButtonName; isDown: boolean }) => {
        applyButtonRef.current(payload.player, payload.button, payload.isDown);
      });
      socket.on("netplay:state-request", () => {
        if (assignedPlayerRef.current === 1) nativePlayerRef.current?.requestState();
      });
      socket.on("netplay:state", (payload: { snapshot: string; syncId?: number }) => {
        const syncId = Number(payload.syncId);
        if (!Number.isSafeInteger(syncId) || !shouldApplyAuthoritativeState(lastFamicomSyncRef.current, syncId)) return;
        lastFamicomSyncRef.current = syncId;
        nativePlayerRef.current?.applyState(payload.snapshot);
      });
      socket.on("netplay:chat", (message: RoomChatMessage) => {
        setChatMessages((current) => [...current.slice(-39), message]);
      });
    } catch (error) {
      setNetworkState(error instanceof Error ? error.message : "Could not prepare the NetPlay connection.");
    }
  };

  const sendChat = () => {
    const text = chatDraft.trim();
    if (!text || !socketRef.current?.connected) return;
    socketRef.current.emit("netplay:chat", { text });
    setChatDraft("");
  };

  const pickRom = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, base64: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!isNesFile(asset.name)) {
        haptic.error();
        Alert.alert("Unsupported file", "Choose a legal Famicom game with the .nes extension.");
        return;
      }
      setLoading(true);
      if (Platform.OS !== "web") {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        if (!base64) throw new Error("Could not read the game file from storage.");
        const localFingerprint = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
        fingerprintRef.current = localFingerprint;
        setFingerprint(localFingerprint);
        setRomName(asset.name);
        setRomUri(asset.uri);
        setRomBase64(base64);
        setGameReady(false);
        setRemoteVerified(false);
        setNetworkState("Loading the game locally on this device…");
        haptic.success();
        return;
      }
      if (!asset.file) throw new Error("Could not read the game file in the browser.");
      const romData = await asset.file.arrayBuffer();
      const localFingerprint = await fingerprintRom(romData);
      const jsnes = (await import("jsnes")) as unknown as JsNesModule;
      jsNesRef.current = jsnes;
      browserRef.current?.destroy();
      if (!mountRef.current) throw new Error("Could not prepare the emulator screen.");
      mountRef.current.innerHTML = "";
      browserRef.current = new jsnes.Browser({ container: mountRef.current, romData });
      fingerprintRef.current = localFingerprint;
      setFingerprint(localFingerprint);
      setRomName(asset.name);
      setRomUri(asset.uri);
      setGameReady(false);
      setRemoteVerified(false);
      setNetworkState("The game is running locally. Connect the other player after they choose the same game.");
      haptic.success();
    } catch (error) {
      setNetworkState("Could not run this file. Try another compatible .nes file.");
      haptic.error();
      Alert.alert("Could not start the game", error instanceof Error ? error.message : "Try another Famicom game file.");
    } finally {
      setLoading(false);
    }
  };

  const connectNetPlay = async () => {
    if (!fingerprint || !credential) return;
    if (Platform.OS !== "web") {
      connectNativeNetplay();
      return;
    }
    try {
      connectionRef.current?.close();
      peerRef.current?.destroy();
      setRemoteVerified(false);
      setNetworkState(isHost ? "Preparing the room connection…" : "Connecting to the host…");
      const peerModule = await import("peerjs");
      const PeerConstructor = peerModule.default;
      const peer = (isHost ? new PeerConstructor(peerIdForRoom(roomId)) : new PeerConstructor()) as unknown as PeerInstance;
      peerRef.current = peer;
      peer.on("error", () => setNetworkState(isHost ? "Could not reserve the room connection. Try again in a minute." : "The host is not ready yet. Ask them to connect first."));
      if (isHost) {
        peer.on("open", () => setNetworkState("The room connection is ready. Wait for the second player to connect."));
        peer.on("connection", (incoming) => attachConnection(incoming as Connection));
      } else {
        peer.on("open", () => {
          const connection = peer.connect(peerIdForRoom(roomId), { reliable: true });
          attachConnection(connection);
        });
      }
    } catch {
      setNetworkState("Could not start NetPlay on this connection. Update the browser and try again.");
      haptic.error();
    }
  };

  const markGameReady = async () => {
    if (!credential || !fingerprint || !roomConnected) return;
    try {
      await setRealtimeRoomReady({
        roomId,
        memberId: credential.memberId,
        memberToken: credential.memberToken,
        isReady: true,
        fingerprint,
        coreVersion: FAMICOM_CORE_VERSION,
      });
      socketRef.current?.emit("netplay:session-ready", { system: "nes", fingerprint, coreVersion: FAMICOM_CORE_VERSION });
      setGameReady(true);
      setNetworkState("Your game file is marked ready. Wait for the other player, then the host starts the session.");
      haptic.success();
    } catch (error) {
      haptic.error();
      Alert.alert("Could not mark ready", error instanceof Error ? error.message : "Try again.");
    }
  };

  const startSession = async () => {
    const isAuthoritativeHost = Platform.OS === "web" ? isHost : assignedPlayer === 1;
    if (!isAuthoritativeHost || !remoteVerified) return;
    try {
      if (Platform.OS !== "web") {
        if (!socketRef.current?.connected || !remoteOnline) throw new Error("Wait until the other player connects to the room channel.");
        socketRef.current.emit("netplay:session-start-request", { system: "nes" });
        setNetworkState("Verifying the file and core on both devices before starting…");
        haptic.success();
        return;
      }
      const initialState = browserRef.current?.nes.toJSON();
      if (!initialState || !connectionRef.current) {
        throw new Error("The connection between both devices is not complete yet.");
      }
      connectionRef.current.send({ type: "state", snapshot: JSON.stringify(initialState), syncId: ++famicomSyncSequenceRef.current });
      setNetworkState("The two-player session is active. The host is Player 1 and the guest is Player 2.");
      haptic.success();
    } catch (error) {
      Alert.alert("The session did not start", error instanceof Error ? error.message : "Wait until both players are ready.");
    }
  };

  const setLocalButton = (button: ButtonName, isDown: boolean) => {
    if (isDown && Platform.OS !== "web") nativePlayerRef.current?.resumeAudio();
    const player = Platform.OS === "web" ? (isHost ? 1 : 2) : (assignedPlayer ?? (romBase64 ? 1 : null));
    if (!player) {
      if (isDown) setNetworkState("Confirming this device role in the room. Wait a moment, then press the button again.");
      return;
    }
    const sendTransitions = (transitions: { button: ButtonName; isDown: boolean }[]) => {
      for (const input of transitions) {
        applyButton(player, input.button, input.isDown);
        if (Platform.OS !== "web") socketRef.current?.emit("netplay:input", { button: input.button, isDown: input.isDown, frame: 0 });
        else connectionRef.current?.send({ type: "input", player, button: input.button, isDown: input.isDown });
      }
    };
    const isDirection = button === "UP" || button === "DOWN" || button === "LEFT" || button === "RIGHT";
    if (isDirection && isDown) {
      const pendingTimer = directionReleaseTimersRef.current[button];
      if (pendingTimer) clearTimeout(pendingTimer);
      delete directionReleaseTimersRef.current[button];
    }
    sendTransitions(inputCoordinatorRef.current.transition(button, isDown));
    if (!isDown && isDirection) {
      const pendingTimer = directionReleaseTimersRef.current[button];
      if (pendingTimer) clearTimeout(pendingTimer);
      directionReleaseTimersRef.current[button] = setTimeout(() => {
        delete directionReleaseTimersRef.current[button];
        sendTransitions(inputCoordinatorRef.current.flushPendingDirections());
      }, 85);
    }
  };

  const setFocusButton = (button: "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B", isDown: boolean) => {
    if (isDown && Platform.OS !== "web") nativePlayerRef.current?.resumeAudio();
    const player = Platform.OS === "web" ? (isHost ? 1 : 2) : (assignedPlayer ?? (romBase64 ? 1 : null));
    if (!player) {
      if (isDown) setNetworkState("Confirming this device role in the room. Wait a moment, then press the button again.");
      return;
    }
    applyButton(player, button, isDown);
    if (Platform.OS !== "web") socketRef.current?.emit("netplay:input", { button, isDown, frame: 0 });
    else connectionRef.current?.send({ type: "input", player, button, isDown });
  };


  const canStart = Boolean(
    (Platform.OS === "web" ? isHost : assignedPlayer === 1) &&
      gameReady &&
      remoteVerified &&
      readyCount >= 2 &&
      snapshot?.room.status === "waiting" &&
      (Platform.OS === "web" || (roomConnected && remoteOnline)),
  );
  const gameActive = snapshot?.room.status === "active";
  const localNativeGameActive = Platform.OS !== "web" && Boolean(romBase64) && (!roomConnected || gameActive);
  const controlsEnabled = gameActive || localNativeGameActive;
  const physicalHorizontalRow = { flexDirection: I18nManager.isRTL ? "row-reverse" as const : "row" as const };
  return (
    <ScreenContainer className={focusMode ? "bg-black px-3" : "px-5"} containerClassName={focusMode ? "bg-black" : undefined} edges={["top", "bottom", "left", "right"]}>
      <StatusBar style="light" hidden={focusMode} animated />
      <ScrollView contentContainerStyle={[styles.content, focusMode && styles.focusContent]}>
        <View style={styles.topActions}>
          <Pressable onPress={() => focusMode ? setFocusMode(false) : router.replace({ pathname: "/room/[roomId]", params: { roomId: String(roomId) } })} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><Text style={styles.backText}>{focusMode ? "EXIT FOCUS MODE" : "‹ BACK TO ROOM"}</Text></Pressable>
          {focusMode ? (!gameActive && <Pressable onPress={() => setFocusControlEditor((value) => !value)} style={({ pressed }) => [styles.focusButton, focusControlEditor && styles.focusButtonActive, pressed && styles.pressed]}><Text style={styles.focusButtonText}>{focusControlEditor ? "SAVE CONTROLS" : "CONFIGURE CONTROLS"}</Text></Pressable>) : romName && <Pressable onPress={launchNativeFocusPlayer} disabled={isCompatLaunching} style={({ pressed }) => [styles.focusButton, (pressed || isCompatLaunching) && styles.pressed]}><Text style={styles.focusButtonText}>{isCompatLaunching ? "OPENING FOCUS MODE…" : "OPEN CONTROLLER SETTINGS"}</Text></Pressable>}
        </View>
        {!focusMode && <><Text style={styles.eyebrow}>FAMICOM · NETPLAY</Text><Text style={styles.title}>GAME PLAYER</Text><Text style={styles.subtitle}>Choose the same .nes file on both devices. The file stays local and is never uploaded or shared by Moudie NetPlay.</Text></>}

        <View style={[styles.emulatorFrame, focusMode && styles.focusFrame, screenAspect !== "fit" && { aspectRatio: screenAspect === "4:3" ? 4 / 3 : 16 / 9, minHeight: undefined }]}>
          {Platform.OS === "web" ? <View ref={mountRef as never} style={[styles.webMount, screenAspect !== "fit" && { aspectRatio: screenAspect === "4:3" ? 4 / 3 : 16 / 9 }]} /> : romBase64 ? <FamicomNativePlayer ref={nativePlayerRef} romBase64={romBase64} onStatus={setNetworkState} onReady={restoreLocalState} onState={(snapshotValue, requestId) => { if (localStateStorageKey) AsyncStorage.setItem(localStateStorageKey, snapshotValue).catch(() => undefined); if (requestId === "netplay" && assignedPlayer === 1) socketRef.current?.emit("netplay:state", { snapshot: snapshotValue, syncId: ++famicomSyncSequenceRef.current }); if (requestId === "local") setNetworkState("Game state saved locally."); }} /> : null}
          {!romName && <View style={styles.emptyScreen}><Text style={styles.emptyIcon}>▦</Text><Text style={styles.emptyText}>NO GAME SELECTED</Text></View>}
          {Platform.OS !== "web" && gameActive && romName && <View style={styles.inGameOverlay}><Pressable onPress={() => setInGameChatOpen((open) => !open)} style={({ pressed }) => [styles.inGameOverlayButton, pressed && styles.pressed]}><Text style={styles.inGameOverlayText}>▣</Text></Pressable><Pressable onPress={() => { const muted = !inGameMicMuted; setInGameMicMuted(muted); voiceChatRef.current?.setMicrophoneEnabled(!muted); }} style={({ pressed }) => [styles.inGameOverlayButton, pressed && styles.pressed]}><Text style={styles.inGameOverlayText}>{inGameMicMuted ? "MIC×" : "MIC"}</Text></Pressable></View>}
          {Platform.OS !== "web" && gameActive && inGameChatOpen && <View style={styles.inGameChatOverlay}><TextInput value={chatDraft} onChangeText={setChatDraft} placeholder="Message…" placeholderTextColor="#A7B7C7" style={styles.inGameChatInput} returnKeyType="send" onSubmitEditing={() => { sendChat(); setInGameChatOpen(false); }} /><Pressable onPress={() => { sendChat(); setInGameChatOpen(false); }} style={styles.inGameChatSend}><Text style={styles.inGameChatSendText}>SEND</Text></Pressable></View>}
        </View>
        {focusMode && romName && <View style={[styles.focusPortraitControls, !controlsEnabled && styles.controlsMuted]}>
          <View style={styles.focusTelemetry}>
            <Text style={styles.focusMetric}>FPS —</Text><Text style={styles.focusMetricDivider}>·</Text><Text style={styles.focusMetric}>{roomConnected ? "PING — ms" : "LOCAL"}</Text><Text style={styles.focusMetricDivider}>·</Text><Text style={styles.focusMetric}>P{assignedPlayer ?? 1}</Text>
          </View>
          <CustomizableController
            system="famicom"
            editable={focusControlEditor && !gameActive}
            onButtonChange={(button, isDown) => {
              if (button === "UP" || button === "DOWN" || button === "LEFT" || button === "RIGHT" || button === "A" || button === "B") setFocusButton(button, isDown);
              else if (button === "START" || button === "SELECT") setLocalButton(button, isDown);
            }}
          />
        </View>}
        {!focusMode && <><Pressable onPress={pickRom} disabled={loading || isCompatLaunching} style={({ pressed }) => [styles.pickButton, (pressed || loading || isCompatLaunching) && styles.pressed]}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.pickText}>{romName ? "CHANGE GAME FILE" : "1. CHOOSE .NES FILE"}</Text>}</Pressable>{romName && <Text style={styles.romName}>LOCAL FILE: {romName}</Text>}{romName && Platform.OS !== "web" && <View style={[styles.utilityRow, physicalHorizontalRow]}><Pressable onPress={saveLocalState} style={({ pressed }) => [styles.minorButton, pressed && styles.pressed]}><Text style={styles.minorText}>LOCAL SAVE</Text></Pressable><Pressable onPress={loadLocalState} style={({ pressed }) => [styles.minorButton, pressed && styles.pressed]}><Text style={styles.minorText}>LOAD SAVE</Text></Pressable></View>}{romName && Platform.OS !== "web" && <Pressable onPress={launchCompatibilityPlayer} disabled={isCompatLaunching} style={({ pressed }) => [styles.connectButton, (pressed || isCompatLaunching) && styles.pressed]}>{isCompatLaunching ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.connectText}>GAME NOT WORKING? OPEN EXTENDED COMPATIBILITY</Text>}</Pressable>}</>}

        {!focusMode && <><View style={styles.statusCard}><Text style={styles.statusTitle}>NETPLAY STATUS</Text><Text style={styles.statusText}>{networkState}</Text><Text style={styles.progress}>{readyCount} READY OUT OF {snapshot?.members.length ?? 0}</Text></View>
        {romName && (Platform.OS === "web" ? !remoteVerified : !roomConnected) && <Pressable onPress={connectNetPlay} style={({ pressed }) => [styles.connectButton, pressed && styles.pressed]}><Text style={styles.connectText}>{Platform.OS === "web" ? (isHost ? "2. PREPARE ROOM CONNECTION" : "2. CONNECT TO OTHER PLAYER") : "2. CONNECT NETPLAY CHANNEL"}</Text></Pressable>}
        {Platform.OS !== "web" && romName && roomConnected && <Text style={styles.connectionLine}>{remoteOnline ? "● OTHER PLAYER CONNECTED" : "○ WAITING FOR OTHER PLAYER"}</Text>}
        {Platform.OS !== "web" && romName && roomConnected && <Pressable onPress={markGameReady} disabled={gameReady} style={({ pressed }) => [styles.startButton, (pressed || gameReady) && styles.pressed]}><Text style={styles.startText}>{gameReady ? "READY CONFIRMED" : "3. READY"}</Text></Pressable>}
        {canStart && <Pressable onPress={() => setStartOptionsOpen(true)} style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}><Text style={styles.startText}>4. START PLAY</Text></Pressable>}
        {startOptionsOpen && <View style={styles.startOptions}><Text style={styles.startOptionsTitle}>START PLAY SETUP</Text><Text style={styles.startOptionsLabel}>ORIENTATION</Text><View style={styles.optionRow}>{(["portrait", "landscape"] as const).map((option) => <Pressable key={option} onPress={() => setStartOrientation(option)} style={[styles.optionButton, startOrientation === option && styles.optionButtonActive]}><Text style={styles.optionText}>{option.toUpperCase()}</Text></Pressable>)}</View><Text style={styles.startOptionsLabel}>SCREEN RATIO</Text><View style={styles.optionRow}>{(["fit", "4:3", "16:9"] as const).map((option) => <Pressable key={option} onPress={() => setScreenAspect(option)} style={[styles.optionButton, screenAspect === option && styles.optionButtonActive]}><Text style={styles.optionText}>{option === "fit" ? "FIT" : option}</Text></Pressable>)}</View><Pressable onPress={async () => { if (Platform.OS !== "web") await MoudieEmulatorModule.setFamicomFocusLandscape(startOrientation === "landscape"); setStartOptionsOpen(false); startSession(); }} style={styles.confirmStartButton}><Text style={styles.confirmStartText}>CONFIRM & START</Text></Pressable></View>}
        {gameReady && remoteVerified && (Platform.OS === "web" ? !isHost : assignedPlayer === 2) && <Text style={styles.waitText}>VERIFIED. WAIT FOR THE HOST TO START THE SESSION.</Text>}</>}

        {!focusMode && Platform.OS !== "web" && romName && <View style={styles.chatCard}><Text style={styles.chatTitle}>ROOM CHAT</Text><View style={styles.chatMessages}>{chatMessages.length ? chatMessages.slice(-4).map((message) => <Text key={message.id} style={styles.chatMessage}><Text style={styles.chatSender}>{message.displayName}: </Text>{message.text}</Text>) : <Text style={styles.chatEmpty}>{roomConnected ? "Write a message to the other player." : "Connect the NetPlay channel to enable chat."}</Text>}</View><View style={styles.chatComposer}><TextInput value={chatDraft} onChangeText={setChatDraft} editable={roomConnected} placeholder="Write a message…" placeholderTextColor="#71839A" style={styles.chatInput} textAlign="left" returnKeyType="send" onSubmitEditing={sendChat} /><Pressable onPress={sendChat} disabled={!roomConnected || !chatDraft.trim()} style={({ pressed }) => [styles.chatSend, (pressed || !roomConnected || !chatDraft.trim()) && styles.chatSendDisabled]}><Text style={styles.chatSendText}>SEND</Text></Pressable></View></View>}
        {!focusMode && Platform.OS !== "web" && romName && <RoomVoiceChat ref={voiceChatRef} socket={roomConnected ? socketRef.current : null} isHost={assignedPlayer === 1} remoteOnline={remoteOnline} />}

        {!focusMode && romName && <View style={[styles.controls, !controlsEnabled && styles.controlsMuted]}><View style={styles.controllerHeader}><Text style={styles.controlLabel}>{localNativeGameActive ? `LOCAL CONTROLS · PLAYER ${assignedPlayer ?? 1}` : gameActive ? `CONTROLS · PLAYER ${Platform.OS === "web" ? (isHost ? 1 : 2) : assignedPlayer ?? 1}` : "CONTROLS APPEAR AFTER THE HOST STARTS PLAY"}</Text>{!gameActive && <Pressable onPress={() => setFocusControlEditor((value) => !value)} style={styles.editorButton}><Text style={styles.editorButtonText}>{focusControlEditor ? "SAVE CONTROLS" : "CONFIGURE CONTROLS"}</Text></Pressable>}</View><CustomizableController system="famicom" editable={focusControlEditor && !gameActive} onButtonChange={(button, isDown) => { if (button === "UP" || button === "DOWN" || button === "LEFT" || button === "RIGHT" || button === "A" || button === "B" || button === "START" || button === "SELECT") setLocalButton(button, isDown); }} /><Pressable onPress={() => Platform.OS === "web" ? browserRef.current?.nes.reset() : nativePlayerRef.current?.reset()} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}><Text style={styles.resetText}>RESET GAME</Text></Pressable></View>}
        {!focusMode && <View style={styles.warning}><Text style={styles.warningTitle}>HOW TO PLAY</Text><Text style={styles.warningText}>{Platform.OS === "web" ? "Browser NetPlay requires a stable connection and the same game file on both sides." : "Choose the same .nes file, connect the NetPlay channel on both devices, then let the host start the session. Host controls are Player 1 and guest controls are Player 2."}</Text></View>}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 10, paddingBottom: 30 },
  focusContent: { paddingTop: 0, paddingBottom: 12 },
  topActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  back: { alignSelf: "flex-start", paddingVertical: 8 },
  backText: { color: "#9BAFC4", fontSize: 15, fontWeight: "800" },
  focusButton: { backgroundColor: "#183B58", borderWidth: 1, borderColor: "#37799B", borderRadius: 10, paddingVertical: 7, paddingHorizontal: 11 },
  focusButtonActive: { backgroundColor: "#542A80", borderColor: "#B26DFF" },
  focusButtonText: { color: "#D8F4FF", fontSize: 12, fontWeight: "900" },
  eyebrow: { color: "#62C2EB", fontSize: 12, fontWeight: "900", letterSpacing: 1, textAlign: "left", marginTop: 18 },
  title: { color: "#F3F7FB", fontSize: 30, fontWeight: "900", textAlign: "left", marginTop: 4 },
  subtitle: { color: "#9BAFC4", fontSize: 14, lineHeight: 21, textAlign: "left", marginTop: 8 },
  emulatorFrame: { minHeight: 252, marginTop: 22, backgroundColor: "#05080E", borderRadius: 19, overflow: "hidden", borderWidth: 1, borderColor: "#31465F", alignItems: "center", justifyContent: "center" },
  focusFrame: { marginTop: 4, borderRadius: 12, borderColor: "#1A2635", minHeight: 360 },
  webMount: { width: "100%", aspectRatio: 256 / 240 },
  inGameOverlay: { position: "absolute", right: 10, top: 18, gap: 9 },
  inGameOverlayButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(10, 31, 49, 0.84)", borderWidth: 1, borderColor: "rgba(184, 224, 246, 0.72)", alignItems: "center", justifyContent: "center" },
  inGameOverlayText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  inGameChatOverlay: { position: "absolute", right: 10, top: 124, width: 190, padding: 8, borderRadius: 12, backgroundColor: "rgba(6, 16, 27, 0.95)", borderWidth: 1, borderColor: "#4A7895", flexDirection: "row", gap: 6 },
  inGameChatInput: { flex: 1, minHeight: 38, color: "#FFFFFF", backgroundColor: "#102236", borderRadius: 8, paddingHorizontal: 8, fontSize: 12, textAlign: "left" },
  inGameChatSend: { minWidth: 48, borderRadius: 8, backgroundColor: "#146C94", alignItems: "center", justifyContent: "center" },
  inGameChatSendText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  emptyScreen: { position: "absolute", alignItems: "center" },
  emptyIcon: { color: "#62C2EB", fontSize: 42 },
  emptyText: { color: "#8BA0B4", fontSize: 14, marginTop: 8 },
  focusPortraitControls: { width: "100%", height: 390, position: "relative", marginTop: 15, direction: "ltr" },
  focusTelemetry: { position: "absolute", top: 10, alignSelf: "center", zIndex: 4, flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: "rgba(12, 12, 16, 0.78)", borderWidth: 1, borderColor: "#2C2A35", borderRadius: 13, paddingHorizontal: 11, paddingVertical: 6 },
  focusMetric: { color: "#EDEAF2", fontSize: 10, fontWeight: "900" },
  focusMetricDivider: { color: "#665F70", fontSize: 10 },
  focusGameTouchSurface: { position: "absolute", top: 0, left: 0, right: 0, bottom: 116 },
  focusDpadGrid: { position: "absolute", top: 0, direction: "ltr" },
  focusActionCompact: { position: "absolute", top: 29, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "flex-end", direction: "ltr" },
  focusBottomControls: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "flex-end", direction: "ltr" },
  focusUtilityCompact: { flexDirection: "row", gap: 8, marginTop: 8, direction: "ltr" },
  focusStateRow: { flexDirection: "row", gap: 8, marginTop: 8, direction: "ltr" },
  focusStateButton: { width: 70, height: 70, borderRadius: 35, backgroundColor: "rgba(21, 47, 68, 0.72)", borderWidth: 1, borderColor: "rgba(177, 222, 245, 0.65)", alignItems: "center", justifyContent: "center" },
  focusStateText: { color: "#DCE7F1", fontSize: 11, fontWeight: "900" },
  pickButton: { minHeight: 53, borderRadius: 16, backgroundColor: "#146C94", alignItems: "center", justifyContent: "center", marginTop: 14 },
  pickText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  romName: { color: "#83E0B1", fontSize: 12, textAlign: "left", marginTop: 8 },
  statusCard: { backgroundColor: "#162235", borderRadius: 15, padding: 14, marginTop: 16 },
  statusTitle: { color: "#F4C662", fontSize: 13, fontWeight: "900", textAlign: "left" },
  statusText: { color: "#C4D0DC", fontSize: 13, lineHeight: 20, textAlign: "left", marginTop: 4 },
  progress: { color: "#8BB7CF", fontSize: 12, fontWeight: "800", textAlign: "left", marginTop: 9 },
  connectionLine: { color: "#83E0B1", fontSize: 12, fontWeight: "800", textAlign: "center", marginTop: 10 },
  connectButton: { minHeight: 52, borderRadius: 16, backgroundColor: "#2A6D73", alignItems: "center", justifyContent: "center", marginTop: 12 },
  connectText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  startButton: { minHeight: 54, borderRadius: 16, backgroundColor: "#F26B5B", alignItems: "center", justifyContent: "center", marginTop: 12 },
  startText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  startOptions: { marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: "#4A7895", backgroundColor: "#102236", padding: 14 },
  startOptionsTitle: { color: "#D8F4FF", fontSize: 14, fontWeight: "900" },
  startOptionsLabel: { color: "#83BFD9", fontSize: 10, fontWeight: "900", marginTop: 12 },
  optionRow: { flexDirection: "row", gap: 8, marginTop: 7 },
  optionButton: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "#35546F", backgroundColor: "#172D43" },
  optionButtonActive: { backgroundColor: "#146C94", borderColor: "#69E8FF" },
  optionText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  confirmStartButton: { minHeight: 46, marginTop: 15, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#48C78E" },
  confirmStartText: { color: "#062817", fontSize: 12, fontWeight: "900" },
  waitText: { color: "#83E0B1", fontSize: 13, fontWeight: "800", textAlign: "center", marginTop: 12 },
  chatCard: { backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#29415B", borderRadius: 16, padding: 13, marginTop: 18 },
  chatTitle: { color: "#F4C662", fontSize: 13, fontWeight: "900", textAlign: "left" },
  chatMessages: { minHeight: 42, marginTop: 8, gap: 4 },
  chatMessage: { color: "#DCE7F1", fontSize: 12, lineHeight: 18, textAlign: "left" },
  chatSender: { color: "#62C2EB", fontWeight: "900" },
  chatEmpty: { color: "#8093A7", fontSize: 12, textAlign: "left" },
  chatComposer: { flexDirection: "row", gap: 8, marginTop: 10 },
  chatInput: { flex: 1, minHeight: 42, color: "#FFFFFF", backgroundColor: "#07101C", borderWidth: 1, borderColor: "#29415B", borderRadius: 12, paddingHorizontal: 11, fontSize: 13 },
  chatSend: { minWidth: 70, borderRadius: 12, backgroundColor: "#146C94", alignItems: "center", justifyContent: "center" },
  chatSendDisabled: { opacity: 0.42 },
  chatSendText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  controls: { alignItems: "center", marginTop: 24, width: "100%" },
  controlsMuted: { opacity: 0.52 },
  controllerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  editorButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: "#542A80" },
  editorButtonText: { color: "#F7EFFF", fontSize: 11, fontWeight: "900" },
  controlLabel: { color: "#DCE7F1", fontSize: 14, fontWeight: "900", marginBottom: 13 },
  sizeBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 4 },
  sizeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#17283A", borderWidth: 1, borderColor: "#3E5C77", alignItems: "center", justifyContent: "center" },
  sizeText: { color: "#FFFFFF", fontSize: 20, fontWeight: "900", lineHeight: 22 },
  sizeLabel: { color: "#8FA9C0", fontSize: 11, fontWeight: "800" },
  dpad: { alignItems: "center", direction: "ltr" },
  dpadRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  controlButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#293D54", borderWidth: 1, borderColor: "#496783", alignItems: "center", justifyContent: "center" },
  focusControlButton: { backgroundColor: "rgba(32, 62, 87, 0.50)", borderColor: "rgba(177, 222, 245, 0.76)", borderWidth: 2 },
  controlText: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", writingDirection: "ltr" },
  actionRow: { flexDirection: "row", gap: 16, marginTop: 17, alignSelf: "flex-end" },
  utilityRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  systemButtonRow: { flexDirection: "row", direction: "ltr" },
  minorButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#22344A", alignItems: "center", justifyContent: "center" },
  focusMinorButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(25, 48, 69, 0.56)", borderWidth: 1, borderColor: "rgba(177, 222, 245, 0.65)" },
  minorText: { color: "#DCE7F1", fontSize: 11, fontWeight: "900" },
  resetButton: { width: 76, height: 76, marginTop: 16, borderRadius: 38, borderWidth: 1, borderColor: "#3E5872", alignItems: "center", justifyContent: "center", alignSelf: "center" },
  resetText: { color: "#9BAFC4", fontSize: 10, fontWeight: "800", textAlign: "center" },
  warning: { backgroundColor: "#2A2221", borderLeftWidth: 3, borderLeftColor: "#F4B942", borderRadius: 15, padding: 14, marginTop: 24 },
  warningTitle: { color: "#F4C662", fontSize: 13, fontWeight: "900", textAlign: "left" },
  warningText: { color: "#D5C5BD", fontSize: 12, lineHeight: 19, textAlign: "left", marginTop: 4 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  controlPressed: { opacity: 0.72, transform: [{ scale: 0.94 }] },
});
