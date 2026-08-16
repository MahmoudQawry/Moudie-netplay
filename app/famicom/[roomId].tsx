import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, I18nManager, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ViewStyle } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Socket } from "socket.io-client";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { FamicomFocusMultitouch } from "@/components/famicom-focus-multitouch";
import { FamicomNativePlayer, type FamicomNativePlayerHandle } from "@/components/famicom-native-player";
import { RoomVoiceChat } from "@/components/room-voice-chat";
import { ScreenContainer } from "@/components/screen-container";
import { FAMICOM_CORE_VERSION, decodeFamicomMessage, fingerprintRom, isNesFile, peerIdForRoom, type FamicomMessage } from "@/lib/famicom-netplay";
import { getFocusDpadButtons } from "@/lib/famicom-focus-dpad";
import { getFocusControlPlacement } from "@/lib/famicom-focus-layout";
import { FamicomInputCoordinator } from "@/lib/famicom-input-coordinator";
import { haptic } from "@/lib/haptics";
import { createNetplaySocket, type RoomChatMessage } from "@/lib/netplay-socket";
import { NETPLAY_SYNC_INTERVAL_MS, shouldApplyAuthoritativeState } from "@/lib/netplay-sync";
import { getRoomCredential, type RoomCredential } from "@/lib/room-storage";
import { trpc } from "@/lib/trpc";
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
  const [networkState, setNetworkState] = useState("اختر اللعبة أولاً");
  const [remoteVerified, setRemoteVerified] = useState(false);
  const [roomConnected, setRoomConnected] = useState(false);
  const [remoteOnline, setRemoteOnline] = useState(false);
  const [assignedPlayer, setAssignedPlayer] = useState<1 | 2 | null>(null);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [inGameChatOpen, setInGameChatOpen] = useState(false);
  const [inGameMicMuted, setInGameMicMuted] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [controlScale, setControlScale] = useState(1);

  useEffect(() => {
    if (Platform.OS === "web") return;
    MoudieEmulatorModule.setFamicomFocusLandscape(false).catch(() => undefined);
    return () => {
      MoudieEmulatorModule.setFamicomFocusLandscape(false).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (Number.isFinite(roomId)) getRoomCredential(roomId).then(setCredential);
    AsyncStorage.getItem("moudie.control-scale").then((saved) => {
      const parsed = Number(saved);
      if (Number.isFinite(parsed) && parsed >= 0.75 && parsed <= 1.3) setControlScale(parsed);
    });
    return () => {
      Object.values(directionReleaseTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      connectionRef.current?.close();
      peerRef.current?.destroy();
      socketRef.current?.disconnect();
      browserRef.current?.destroy();
    };
  }, [roomId]);

  const changeControlScale = (delta: number) => {
    setControlScale((current) => {
      const next = Math.min(1.3, Math.max(0.75, Math.round((current + delta) * 100) / 100));
      AsyncStorage.setItem("moudie.control-scale", String(next));
      return next;
    });
  };

  const snapshotQuery = trpc.rooms.snapshot.useQuery(
    { roomId, memberId: credential?.memberId ?? 0, memberToken: credential?.memberToken ?? "" },
    { enabled: Boolean(credential && roomId), refetchInterval: 3000 },
  );
  const setReady = trpc.rooms.setReady.useMutation({ onSuccess: () => snapshotQuery.refetch() });
  const startRoom = trpc.rooms.start.useMutation({ onSuccess: () => snapshotQuery.refetch() });
  const snapshot = snapshotQuery.data;
  const membership = snapshot?.members.find((member) => member.id === credential?.memberId);
  const isHost = membership?.role === "host";
  const readyCount = snapshot?.members.filter((member) => member.isReady).length ?? 0;

  useEffect(() => {
    if (Platform.OS === "web" || !fingerprint || !snapshot) return;
    const matchingPlayers = snapshot.members.filter(
      (member) => member.isReady && member.gameFingerprint === fingerprint && member.coreVersion === FAMICOM_CORE_VERSION,
    );
    const verified = matchingPlayers.length >= 2;
    setRemoteVerified(verified);
    if (verified && roomConnected) setNetworkState("تم التحقق من ملف اللعبة عند اللاعب الآخر. يمكن للمضيف بدء الجلسة.");
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
      setNetworkState("تم استرجاع آخر حالة محلية للعبة.");
    } catch {
      setNetworkState("تعذر استرجاع آخر حالة محلية للعبة.");
    }
  };

  const saveLocalState = () => {
    if (Platform.OS === "web" || !localStateStorageKey) return;
    nativePlayerRef.current?.requestState("local");
    setNetworkState("جارٍ حفظ حالة اللعبة محلياً…");
  };

  const loadLocalState = async () => {
    if (Platform.OS === "web" || !localStateStorageKey) return;
    const snapshotValue = await AsyncStorage.getItem(localStateStorageKey);
    if (!snapshotValue) {
      Alert.alert("لا توجد حالة محفوظة", "ابدأ اللعب ثم اضغط «حفظ محلي» لإنشاء حالة لهذه اللعبة.");
      return;
    }
    nativePlayerRef.current?.applyState(snapshotValue);
    setNetworkState("تم استرجاع آخر حالة محلية للعبة.");
    haptic.success();
  };

  const launchCompatibilityPlayer = async () => {
    if (Platform.OS === "web" || !romUri || !romName) return;
    try {
      setIsCompatLaunching(true);
      setNetworkState("جارٍ فتح وضع التوافق الموسّع محلياً…");
      await MoudieEmulatorModule.launchFamicomCompatGame(romUri, romName);
      setNetworkState("يعمل وضع التوافق الموسّع محلياً. ارجع هنا للعب NetPlay.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر فتح وضع التوافق الموسّع.";
      setNetworkState(message);
      Alert.alert("تعذر فتح وضع التوافق", message);
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
      setNetworkState("جارٍ فتح وضع التركيز الأصلي مع صوت ورسوم Famicom…");
      await MoudieEmulatorModule.launchFamicomFocusGame(romUri, romName);
      setNetworkState("عاد وضع التركيز الأصلي. تبقى قناة NetPlay في شاشة الغرفة؛ اللعب الأصلي محلياً حالياً.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر فتح وضع التركيز الأصلي.";
      setNetworkState(message);
      Alert.alert("تعذر فتح وضع التركيز", message);
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
        setNetworkState("تمت مزامنة بداية اللعبة من المضيف.");
      } catch {
        setNetworkState("تعذرت مزامنة بداية اللعبة. أعيدا تحميل الملف ثم اتصال الغرفة.");
      }
      return;
    }
    if (message.type !== "rom") return;
    const localFingerprint = fingerprintRef.current;
    if (message.fingerprint !== localFingerprint || message.coreVersion !== FAMICOM_CORE_VERSION) {
      setNetworkState("الملف أو إصدار المحرك مختلف عند اللاعب الآخر.");
      haptic.error();
      return;
    }
    setRemoteVerified(true);
    setNetworkState("تم التحقق من اللعبة. يمكن للمضيف بدء الجلسة الثنائية.");
    haptic.success();
  };

  const attachConnection = (connection: Connection) => {
    connectionRef.current = connection;
    connection.on("open", () => {
      const currentFingerprint = fingerprintRef.current;
      if (!currentFingerprint) return;
      connection.send({ type: "rom", fingerprint: currentFingerprint, coreVersion: FAMICOM_CORE_VERSION });
      setNetworkState("تم الاتصال بالجهاز الآخر. جارٍ التحقق من ملف اللعبة…");
    });
    connection.on("data", receiveMessage);
    connection.on("close", () => setNetworkState("انقطع الاتصال باللاعب الآخر."));
    connection.on("error", () => setNetworkState("تعذر إكمال الاتصال. تأكد أن اللاعب الآخر فتح مشغّل Famicom."));
  };

  const connectNativeNetplay = () => {
    if (!credential || !fingerprint) return;
    try {
      socketRef.current?.disconnect();
      setRoomConnected(false);
      setRemoteOnline(false);
      setNetworkState("جارٍ ربط قناة NetPlay الخاصة بالغرفة…");
      const socket = createNetplaySocket({ roomId, memberId: credential.memberId, memberToken: credential.memberToken });
      socketRef.current = socket;
      socket.on("connect", () => {
        setRoomConnected(true);
        setNetworkState("تم تجهيز قناة الغرفة. انتظر دخول اللاعب الآخر واختيار الملف نفسه.");
      });
      socket.on("connect_error", () => {
        setRoomConnected(false);
        setNetworkState("تعذر الاتصال بالغرفة. تأكد من الإنترنت ثم أعد المحاولة.");
      });
      socket.on("disconnect", () => {
        assignedPlayerRef.current = null;
        setAssignedPlayer(null);
        setRoomConnected(false);
        setRemoteOnline(false);
        setNetworkState("انقطع اتصال الغرفة مؤقتاً؛ جارٍ إعادة الاتصال تلقائياً…");
      });
      socket.io.on("reconnect_attempt", () => setNetworkState("جارٍ إعادة اتصال الغرفة…"));
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
        setNetworkState("تم تأكيد مطابقة اللعبة. يبدأ اللاعبان الآن من الحالة المحلية نفسها.");
        if (assignedPlayerRef.current === 1 && credential.hostToken) {
          startRoom.mutateAsync({ roomId, hostToken: credential.hostToken }).catch((error) => {
            setNetworkState(error instanceof Error ? error.message : "تعذر تثبيت بدء الجلسة.");
          });
        }
      });
      socket.on("netplay:session-start-refused", (payload: { message?: string }) => {
        setNetworkState(payload.message ?? "بانتظار تأكيد اللاعب الآخر للملف والمحرك.");
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
      setNetworkState(error instanceof Error ? error.message : "تعذر تجهيز اتصال NetPlay.");
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
        Alert.alert("الملف غير مناسب", "اختر ملف Famicom بامتداد .nes من ألعابك التي تملكها قانونياً.");
        return;
      }
      setLoading(true);
      if (Platform.OS !== "web") {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        if (!base64) throw new Error("تعذر قراءة ملف اللعبة من التخزين.");
        const localFingerprint = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
        fingerprintRef.current = localFingerprint;
        setFingerprint(localFingerprint);
        setRomName(asset.name);
        setRomUri(asset.uri);
        setRomBase64(base64);
        setGameReady(false);
        setRemoteVerified(false);
        setNetworkState("جارٍ تحميل اللعبة محلياً على الهاتف…");
        if (credential) {
          await setReady.mutateAsync({
            memberId: credential.memberId,
            memberToken: credential.memberToken,
            isReady: false,
            gameFingerprint: localFingerprint,
            coreVersion: FAMICOM_CORE_VERSION,
          });
        }
        haptic.success();
        return;
      }
      if (!asset.file) throw new Error("تعذر قراءة ملف اللعبة من المتصفح.");
      const romData = await asset.file.arrayBuffer();
      const localFingerprint = await fingerprintRom(romData);
      const jsnes = (await import("jsnes")) as unknown as JsNesModule;
      jsNesRef.current = jsnes;
      browserRef.current?.destroy();
      if (!mountRef.current) throw new Error("تعذر تجهيز شاشة المحاكي.");
      mountRef.current.innerHTML = "";
      browserRef.current = new jsnes.Browser({ container: mountRef.current, romData });
      fingerprintRef.current = localFingerprint;
      setFingerprint(localFingerprint);
      setRomName(asset.name);
      setRomUri(asset.uri);
      setGameReady(false);
      setRemoteVerified(false);
      setNetworkState("تم تشغيل اللعبة محلياً. اضغط ربط اللاعب الآخر بعد أن يختار اللعبة نفسها.");
      if (credential) {
        await setReady.mutateAsync({ memberId: credential.memberId, memberToken: credential.memberToken, isReady: false, gameFingerprint: localFingerprint, coreVersion: FAMICOM_CORE_VERSION });
      }
      haptic.success();
    } catch (error) {
      setNetworkState("تعذر تشغيل الملف. جرّب ملف .nes آخر متوافقاً.");
      haptic.error();
      Alert.alert("تعذر تشغيل اللعبة", error instanceof Error ? error.message : "حاول بملف Famicom آخر.");
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
      setNetworkState(isHost ? "جارٍ تجهيز اتصال الغرفة…" : "جارٍ الاتصال بالمضيف…");
      const peerModule = await import("peerjs");
      const PeerConstructor = peerModule.default;
      const peer = (isHost ? new PeerConstructor(peerIdForRoom(roomId)) : new PeerConstructor()) as unknown as PeerInstance;
      peerRef.current = peer;
      peer.on("error", () => setNetworkState(isHost ? "تعذر حجز اتصال الغرفة. أعد المحاولة بعد دقيقة." : "المضيف غير جاهز بعد. اطلب منه الضغط على زر الربط أولاً."));
      if (isHost) {
        peer.on("open", () => setNetworkState("اتصال الغرفة جاهز. انتظر اللاعب الثاني ليضغط ربط اللاعب الآخر."));
        peer.on("connection", (incoming) => attachConnection(incoming as Connection));
      } else {
        peer.on("open", () => {
          const connection = peer.connect(peerIdForRoom(roomId), { reliable: true });
          attachConnection(connection);
        });
      }
    } catch {
      setNetworkState("تعذر تشغيل NetPlay على هذا الاتصال. تأكد من تحديث المتصفح ثم أعد المحاولة.");
      haptic.error();
    }
  };

  const markGameReady = async () => {
    if (!credential || !fingerprint || !roomConnected) return;
    try {
      await setReady.mutateAsync({
        memberId: credential.memberId,
        memberToken: credential.memberToken,
        isReady: true,
        gameFingerprint: fingerprint,
        coreVersion: FAMICOM_CORE_VERSION,
      });
      socketRef.current?.emit("netplay:session-ready", { system: "nes", fingerprint, coreVersion: FAMICOM_CORE_VERSION });
      setGameReady(true);
      setNetworkState("تم إعلان جاهزية ملفك. انتظر جاهزية اللاعب الآخر، ثم يبدأ المضيف الجلسة.");
      haptic.success();
    } catch (error) {
      haptic.error();
      Alert.alert("تعذر إعلان الاستعداد", error instanceof Error ? error.message : "أعد المحاولة.");
    }
  };

  const startSession = async () => {
    const isAuthoritativeHost = Platform.OS === "web" ? isHost : assignedPlayer === 1;
    if (!isAuthoritativeHost || !credential?.hostToken || !remoteVerified) return;
    try {
      if (Platform.OS !== "web") {
        if (!socketRef.current?.connected || !remoteOnline) throw new Error("انتظر حتى يربط اللاعب الآخر قناة الغرفة.");
        socketRef.current.emit("netplay:session-start-request", { system: "nes" });
        setNetworkState("جارٍ التحقق من الملف والمحرك عند الجهازين قبل البدء…");
        haptic.success();
        return;
      }
      const initialState = browserRef.current?.nes.toJSON();
      if (!initialState || !connectionRef.current) {
        throw new Error("الربط بين الهاتفين غير مكتمل بعد.");
      }
      connectionRef.current.send({ type: "state", snapshot: JSON.stringify(initialState), syncId: ++famicomSyncSequenceRef.current });
      await startRoom.mutateAsync({ roomId, hostToken: credential.hostToken });
      setNetworkState("الجلسة الثنائية نشطة. المضيف لاعب 1 والضيف لاعب 2.");
      haptic.success();
    } catch (error) {
      Alert.alert("لم تبدأ الجلسة", error instanceof Error ? error.message : "انتظر حتى يصبح اللاعبان جاهزين.");
    }
  };

  const setLocalButton = (button: ButtonName, isDown: boolean) => {
    if (isDown && Platform.OS !== "web") nativePlayerRef.current?.resumeAudio();
    const player = Platform.OS === "web" ? (isHost ? 1 : 2) : (assignedPlayer ?? (romBase64 ? 1 : null));
    if (!player) {
      if (isDown) setNetworkState("جارٍ تثبيت دور جهازك في الغرفة. انتظر لحظة ثم اضغط الزر مرة أخرى.");
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
      if (isDown) setNetworkState("جارٍ تثبيت دور جهازك في الغرفة. انتظر لحظة ثم اضغط الزر مرة أخرى.");
      return;
    }
    applyButton(player, button, isDown);
    if (Platform.OS !== "web") socketRef.current?.emit("netplay:input", { button, isDown, frame: 0 });
    else connectionRef.current?.send({ type: "input", player, button, isDown });
  };

  const controllerButton = (label: string, button: ButtonName, variant: "main" | "minor" = "main", placement?: ViewStyle, scale = controlScale) => (
    <Pressable key={button} onPressIn={() => setLocalButton(button, true)} onPressOut={() => setLocalButton(button, false)} style={({ pressed }) => [variant === "main" ? [styles.controlButton, focusMode && styles.focusControlButton, { width: 54 * scale, height: 54 * scale, borderRadius: 27 * scale }] : [styles.minorButton, focusMode && styles.focusMinorButton], placement, pressed && styles.controlPressed]}>
      <Text style={variant === "main" ? styles.controlText : styles.minorText}>{label}</Text>
    </Pressable>
  );

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
  // The displayed percentage must match the actual Focus controls. The new
  // separated rows leave enough room for the configured 75–130% range.
  const focusScale = controlScale;
  const focusDpadButtons = getFocusDpadButtons(I18nManager.isRTL, focusScale);
  const focusControlPlacement = getFocusControlPlacement(I18nManager.isRTL);

  return (
    <ScreenContainer className={focusMode ? "bg-black px-3" : "px-5"} containerClassName={focusMode ? "bg-black" : undefined} edges={["top", "bottom", "left", "right"]}>
      <StatusBar style="light" hidden={focusMode} animated />
      <ScrollView contentContainerStyle={[styles.content, focusMode && styles.focusContent]}>
        <View style={styles.topActions}>
          <Pressable onPress={() => focusMode ? setFocusMode(false) : router.replace({ pathname: "/room/[roomId]", params: { roomId: String(roomId) } })} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><Text style={styles.backText}>{focusMode ? "تصغير وضع التركيز" : "‹ العودة إلى الغرفة"}</Text></Pressable>
          {!focusMode && romName && <Pressable onPress={launchNativeFocusPlayer} disabled={isCompatLaunching} style={({ pressed }) => [styles.focusButton, (pressed || isCompatLaunching) && styles.pressed]}><Text style={styles.focusButtonText}>{isCompatLaunching ? "جارٍ فتح وضع التركيز…" : "وضع تركيز"}</Text></Pressable>}
        </View>
        {!focusMode && <><Text style={styles.eyebrow}>FAMICOM · NETPLAY</Text><Text style={styles.title}>مشغّل اللعبة</Text><Text style={styles.subtitle}>اختر ملف .nes نفسه على الهاتفين. يبقى الملف محلياً ولا يرفعه Moudie NetPlay أو يشاركه.</Text></>}

        <View style={[styles.emulatorFrame, focusMode && styles.focusFrame]}>
          {Platform.OS === "web" ? <View ref={mountRef as never} style={styles.webMount} /> : romBase64 ? <FamicomNativePlayer ref={nativePlayerRef} romBase64={romBase64} onStatus={setNetworkState} onReady={restoreLocalState} onState={(snapshotValue, requestId) => { if (localStateStorageKey) AsyncStorage.setItem(localStateStorageKey, snapshotValue).catch(() => undefined); if (requestId === "netplay" && assignedPlayer === 1) socketRef.current?.emit("netplay:state", { snapshot: snapshotValue, syncId: ++famicomSyncSequenceRef.current }); if (requestId === "local") setNetworkState("تم حفظ حالة اللعبة محلياً."); }} /> : null}
          {!romName && <View style={styles.emptyScreen}><Text style={styles.emptyIcon}>▦</Text><Text style={styles.emptyText}>لم يتم اختيار لعبة بعد</Text></View>}
          {Platform.OS !== "web" && gameActive && romName && <View style={styles.inGameOverlay}><Pressable onPress={() => setInGameChatOpen((open) => !open)} style={({ pressed }) => [styles.inGameOverlayButton, pressed && styles.pressed]}><Text style={styles.inGameOverlayText}>▣</Text></Pressable><Pressable onPress={() => { const muted = !inGameMicMuted; setInGameMicMuted(muted); voiceChatRef.current?.setMicrophoneEnabled(!muted); }} style={({ pressed }) => [styles.inGameOverlayButton, pressed && styles.pressed]}><Text style={styles.inGameOverlayText}>{inGameMicMuted ? "MIC×" : "MIC"}</Text></Pressable></View>}
          {Platform.OS !== "web" && gameActive && inGameChatOpen && <View style={styles.inGameChatOverlay}><TextInput value={chatDraft} onChangeText={setChatDraft} placeholder="رسالة…" placeholderTextColor="#A7B7C7" style={styles.inGameChatInput} returnKeyType="send" onSubmitEditing={() => { sendChat(); setInGameChatOpen(false); }} /><Pressable onPress={() => { sendChat(); setInGameChatOpen(false); }} style={styles.inGameChatSend}><Text style={styles.inGameChatSendText}>إرسال</Text></Pressable></View>}
        </View>
        {focusMode && romName && <View style={[styles.focusPortraitControls, !controlsEnabled && styles.controlsMuted]}>
          <FamicomFocusMultitouch scale={focusScale} onButtonChange={setFocusButton} style={styles.focusGameTouchSurface}>
            <View pointerEvents="none" style={[styles.focusDpadGrid, focusControlPlacement.dpad, { width: 138 * focusScale, height: 138 * focusScale }]}>
              {focusDpadButtons.map(({ label, button, placement }) => controllerButton(label, button, "main", { position: "absolute", ...placement }, focusScale))}
            </View>
            <View pointerEvents="none" style={[styles.focusActionCompact, focusControlPlacement.actions]}>{controllerButton("B", "B", "main", undefined, focusScale)}{controllerButton("A", "A", "main", undefined, focusScale)}</View>
          </FamicomFocusMultitouch>
          <View style={styles.focusBottomControls}>
            <View style={styles.sizeBar}><Pressable onPress={() => changeControlScale(-0.1)} style={styles.sizeButton}><Text style={styles.sizeText}>−</Text></Pressable><Text style={styles.sizeLabel}>{Math.round(controlScale * 100)}%</Text><Pressable onPress={() => changeControlScale(0.1)} style={styles.sizeButton}><Text style={styles.sizeText}>+</Text></Pressable></View>
            <View style={styles.focusUtilityCompact}>{controllerButton("SELECT", "SELECT", "minor")}{controllerButton("START", "START", "minor")}</View>
            <View style={styles.focusStateRow}>
              <Pressable onPress={loadLocalState} style={({ pressed }) => [styles.focusStateButton, pressed && styles.pressed]}><Text style={styles.focusStateText}>استرجاع</Text></Pressable>
              <Pressable onPress={saveLocalState} style={({ pressed }) => [styles.focusStateButton, pressed && styles.pressed]}><Text style={styles.focusStateText}>حفظ</Text></Pressable>
            </View>
          </View>
        </View>}
        {!focusMode && <><Pressable onPress={pickRom} disabled={loading || isCompatLaunching} style={({ pressed }) => [styles.pickButton, (pressed || loading || isCompatLaunching) && styles.pressed]}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.pickText}>{romName ? "تغيير ملف اللعبة" : "1. اختيار ملف .nes"}</Text>}</Pressable>{romName && <Text style={styles.romName}>الملف المحلي: {romName}</Text>}{romName && Platform.OS !== "web" && <View style={[styles.utilityRow, physicalHorizontalRow]}><Pressable onPress={saveLocalState} style={({ pressed }) => [styles.minorButton, pressed && styles.pressed]}><Text style={styles.minorText}>حفظ محلي</Text></Pressable><Pressable onPress={loadLocalState} style={({ pressed }) => [styles.minorButton, pressed && styles.pressed]}><Text style={styles.minorText}>استرجاع الحفظ</Text></Pressable></View>}{romName && Platform.OS !== "web" && <Pressable onPress={launchCompatibilityPlayer} disabled={isCompatLaunching} style={({ pressed }) => [styles.connectButton, (pressed || isCompatLaunching) && styles.pressed]}>{isCompatLaunching ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.connectText}>ملف لا يعمل؟ افتح وضع التوافق الموسّع</Text>}</Pressable>}</>}

        {!focusMode && <><View style={styles.statusCard}><Text style={styles.statusTitle}>حالة NetPlay</Text><Text style={styles.statusText}>{networkState}</Text><Text style={styles.progress}>{readyCount} لاعب جاهز من أصل {snapshot?.members.length ?? 0}</Text></View>
        {romName && (Platform.OS === "web" ? !remoteVerified : !roomConnected) && <Pressable onPress={connectNetPlay} style={({ pressed }) => [styles.connectButton, pressed && styles.pressed]}><Text style={styles.connectText}>{Platform.OS === "web" ? (isHost ? "2. تجهيز اتصال الغرفة" : "2. ربط اللاعب الآخر") : "2. ربط قناة NetPlay"}</Text></Pressable>}
        {Platform.OS !== "web" && romName && roomConnected && <Text style={styles.connectionLine}>{remoteOnline ? "● اللاعب الآخر متصل بالقناة" : "○ بانتظار اللاعب الآخر ليربط القناة"}</Text>}
        {Platform.OS !== "web" && romName && roomConnected && <Pressable onPress={markGameReady} disabled={gameReady} style={({ pressed }) => [styles.startButton, (pressed || gameReady) && styles.pressed]}><Text style={styles.startText}>{gameReady ? "تم إعلان الاستعداد" : "3. استعداد"}</Text></Pressable>}
        {canStart && <Pressable onPress={startSession} disabled={startRoom.isPending} style={({ pressed }) => [styles.startButton, (pressed || startRoom.isPending) && styles.pressed]}>{startRoom.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.startText}>4. بدء اللعب للاعبين</Text>}</Pressable>}
        {gameReady && remoteVerified && (Platform.OS === "web" ? !isHost : assignedPlayer === 2) && <Text style={styles.waitText}>تم التحقق. انتظر المضيف ليبدأ الجلسة.</Text>}</>}

        {!focusMode && Platform.OS !== "web" && romName && <View style={styles.chatCard}><Text style={styles.chatTitle}>دردشة الغرفة</Text><View style={styles.chatMessages}>{chatMessages.length ? chatMessages.slice(-4).map((message) => <Text key={message.id} style={styles.chatMessage}><Text style={styles.chatSender}>{message.displayName}: </Text>{message.text}</Text>) : <Text style={styles.chatEmpty}>{roomConnected ? "اكتب رسالة للاعب الآخر." : "اربط قناة NetPlay لتفعيل الدردشة."}</Text>}</View><View style={styles.chatComposer}><TextInput value={chatDraft} onChangeText={setChatDraft} editable={roomConnected} placeholder="اكتب رسالة…" placeholderTextColor="#71839A" style={styles.chatInput} textAlign="right" returnKeyType="send" onSubmitEditing={sendChat} /><Pressable onPress={sendChat} disabled={!roomConnected || !chatDraft.trim()} style={({ pressed }) => [styles.chatSend, (pressed || !roomConnected || !chatDraft.trim()) && styles.chatSendDisabled]}><Text style={styles.chatSendText}>إرسال</Text></Pressable></View></View>}
        {!focusMode && Platform.OS !== "web" && romName && <RoomVoiceChat ref={voiceChatRef} socket={roomConnected ? socketRef.current : null} isHost={assignedPlayer === 1} remoteOnline={remoteOnline} />}

        {!focusMode && romName && <View style={[styles.controls, !controlsEnabled && styles.controlsMuted]}><Text style={styles.controlLabel}>{localNativeGameActive ? `التحكم المحلي · أنت اللاعب ${assignedPlayer ?? 1}` : gameActive ? `التحكم · أنت اللاعب ${Platform.OS === "web" ? (isHost ? "الأول" : "الثاني") : assignedPlayer === 1 ? "الأول" : "الثاني"}` : "تظهر أزرار اللعب بعد بدء المضيف للجلسة"}</Text><View style={styles.sizeBar}><Pressable onPress={() => changeControlScale(-0.1)} style={styles.sizeButton}><Text style={styles.sizeText}>−</Text></Pressable><Text style={styles.sizeLabel}>حجم الأزرار {Math.round(controlScale * 100)}%</Text><Pressable onPress={() => changeControlScale(0.1)} style={styles.sizeButton}><Text style={styles.sizeText}>+</Text></Pressable></View><View style={styles.dpad}><View style={styles.dpadRow}>{controllerButton("↑", "UP")}</View><View style={[styles.dpadRow, physicalHorizontalRow]}>{controllerButton("←", "LEFT")}{controllerButton("↓", "DOWN")}{controllerButton("→", "RIGHT")}</View></View><View style={[styles.actionRow, physicalHorizontalRow]}>{controllerButton("B", "B")}{controllerButton("A", "A")}</View><View style={[styles.utilityRow, styles.systemButtonRow]}>{controllerButton("SELECT", "SELECT", "minor")}{controllerButton("START", "START", "minor")}</View><Pressable onPress={() => Platform.OS === "web" ? browserRef.current?.nes.reset() : nativePlayerRef.current?.reset()} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}><Text style={styles.resetText}>إعادة تشغيل اللعبة</Text></Pressable></View>}
        {!focusMode && <View style={styles.warning}><Text style={styles.warningTitle}>طريقة اللعب الآن</Text><Text style={styles.warningText}>{Platform.OS === "web" ? "تجربة NetPlay من المتصفح ما زالت تتطلب اتصالاً ثابتاً وأن يختار اللاعبان الملف نفسه." : "اختارا ملف .nes نفسه، اربطا قناة NetPlay على الهاتفين، ثم يبدأ المضيف الجلسة. تنتقل أزرار المضيف كلاعب 1 والضيف كلاعب 2 عبر الغرفة الخاصة."}</Text></View>}
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
  focusButtonText: { color: "#D8F4FF", fontSize: 12, fontWeight: "900" },
  eyebrow: { color: "#62C2EB", fontSize: 12, fontWeight: "900", letterSpacing: 1, textAlign: "right", marginTop: 18 },
  title: { color: "#F3F7FB", fontSize: 30, fontWeight: "900", textAlign: "right", marginTop: 4 },
  subtitle: { color: "#9BAFC4", fontSize: 14, lineHeight: 21, textAlign: "right", marginTop: 8 },
  emulatorFrame: { minHeight: 252, marginTop: 22, backgroundColor: "#05080E", borderRadius: 19, overflow: "hidden", borderWidth: 1, borderColor: "#31465F", alignItems: "center", justifyContent: "center" },
  focusFrame: { marginTop: 4, borderRadius: 12, borderColor: "#1A2635", minHeight: 360 },
  webMount: { width: "100%", aspectRatio: 256 / 240 },
  inGameOverlay: { position: "absolute", right: 10, top: 18, gap: 9 },
  inGameOverlayButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(10, 31, 49, 0.84)", borderWidth: 1, borderColor: "rgba(184, 224, 246, 0.72)", alignItems: "center", justifyContent: "center" },
  inGameOverlayText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  inGameChatOverlay: { position: "absolute", right: 10, top: 124, width: 190, padding: 8, borderRadius: 12, backgroundColor: "rgba(6, 16, 27, 0.95)", borderWidth: 1, borderColor: "#4A7895", flexDirection: "row-reverse", gap: 6 },
  inGameChatInput: { flex: 1, minHeight: 38, color: "#FFFFFF", backgroundColor: "#102236", borderRadius: 8, paddingHorizontal: 8, fontSize: 12, textAlign: "right" },
  inGameChatSend: { minWidth: 48, borderRadius: 8, backgroundColor: "#146C94", alignItems: "center", justifyContent: "center" },
  inGameChatSendText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  emptyScreen: { position: "absolute", alignItems: "center" },
  emptyIcon: { color: "#62C2EB", fontSize: 42 },
  emptyText: { color: "#8BA0B4", fontSize: 14, marginTop: 8 },
  focusPortraitControls: { width: "100%", height: 302, position: "relative", marginTop: 15, direction: "ltr" },
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
  romName: { color: "#83E0B1", fontSize: 12, textAlign: "right", marginTop: 8 },
  statusCard: { backgroundColor: "#162235", borderRadius: 15, padding: 14, marginTop: 16 },
  statusTitle: { color: "#F4C662", fontSize: 13, fontWeight: "900", textAlign: "right" },
  statusText: { color: "#C4D0DC", fontSize: 13, lineHeight: 20, textAlign: "right", marginTop: 4 },
  progress: { color: "#8BB7CF", fontSize: 12, fontWeight: "800", textAlign: "right", marginTop: 9 },
  connectionLine: { color: "#83E0B1", fontSize: 12, fontWeight: "800", textAlign: "center", marginTop: 10 },
  connectButton: { minHeight: 52, borderRadius: 16, backgroundColor: "#2A6D73", alignItems: "center", justifyContent: "center", marginTop: 12 },
  connectText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  startButton: { minHeight: 54, borderRadius: 16, backgroundColor: "#F26B5B", alignItems: "center", justifyContent: "center", marginTop: 12 },
  startText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  waitText: { color: "#83E0B1", fontSize: 13, fontWeight: "800", textAlign: "center", marginTop: 12 },
  chatCard: { backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#29415B", borderRadius: 16, padding: 13, marginTop: 18 },
  chatTitle: { color: "#F4C662", fontSize: 13, fontWeight: "900", textAlign: "right" },
  chatMessages: { minHeight: 42, marginTop: 8, gap: 4 },
  chatMessage: { color: "#DCE7F1", fontSize: 12, lineHeight: 18, textAlign: "right" },
  chatSender: { color: "#62C2EB", fontWeight: "900" },
  chatEmpty: { color: "#8093A7", fontSize: 12, textAlign: "right" },
  chatComposer: { flexDirection: "row-reverse", gap: 8, marginTop: 10 },
  chatInput: { flex: 1, minHeight: 42, color: "#FFFFFF", backgroundColor: "#07101C", borderWidth: 1, borderColor: "#29415B", borderRadius: 12, paddingHorizontal: 11, fontSize: 13 },
  chatSend: { minWidth: 70, borderRadius: 12, backgroundColor: "#146C94", alignItems: "center", justifyContent: "center" },
  chatSendDisabled: { opacity: 0.42 },
  chatSendText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  controls: { alignItems: "center", marginTop: 24 },
  controlsMuted: { opacity: 0.52 },
  controlLabel: { color: "#DCE7F1", fontSize: 14, fontWeight: "900", alignSelf: "flex-end", marginBottom: 13 },
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
  warningTitle: { color: "#F4C662", fontSize: 13, fontWeight: "900", textAlign: "right" },
  warningText: { color: "#D5C5BD", fontSize: 12, lineHeight: 19, textAlign: "right", marginTop: 4 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  controlPressed: { opacity: 0.72, transform: [{ scale: 0.94 }] },
});
