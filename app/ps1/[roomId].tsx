import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { RoomChat } from "@/components/room-chat";
import { RoomVoiceChat } from "@/components/room-voice-chat";
import { getApiBaseUrl } from "@/constants/oauth";
import { haptic } from "@/lib/haptics";
import { createNetplaySocket } from "@/lib/netplay-socket";
import { getRoomCredential, type RoomCredential } from "@/lib/room-storage";
import { trpc } from "@/lib/trpc";
import MoudieEmulatorModule from "@/modules/moudie-emulator/src/MoudieEmulatorModule";

// Android's single-file picker cannot guarantee that a CUE's companion BIN remains beside it.
// Accept self-contained formats so the native player receives a complete game image.
const SUPPORTED_EXTENSIONS = [".bin", ".chd", ".pbp"] as const;
const PS1_NETPLAY_CORE_VERSION = "pcsx-rearmed-0.13.2-lockstep-v1";
type BiosStatus = Record<string, { required: boolean; available: boolean; files?: string[]; message: string }>;
type RoomVoiceChatHandle = { setMicrophoneEnabled: (enabled: boolean) => Promise<void> };

function isPs1GameFile(name: string) {
  const normalized = name.trim().toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export default function PS1Screen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const numericRoomId = Number(roomId);
  const [credential, setCredential] = useState<RoomCredential | null | undefined>(undefined);
  const socketRef = useRef<ReturnType<typeof createNetplaySocket> | null>(null);
  const voiceChatRef = useRef<RoomVoiceChatHandle | null>(null);
  const [roomConnected, setRoomConnected] = useState(false);
  const [remoteOnline, setRemoteOnline] = useState(false);
  const [game, setGame] = useState<{ name: string; uri: string; fingerprint: string } | null>(null);
  const [gameReady, setGameReady] = useState(false);
  const [startRequested, setStartRequested] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isInstallingBios, setIsInstallingBios] = useState(false);
  const [biosStatus, setBiosStatus] = useState<BiosStatus | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<{ available: boolean; message: string } | null>(null);
  const [status, setStatus] = useState("اختر ملف لعبة PS1 من هاتفك. يبقى الملف محلياً ولا يرفعه التطبيق.");
  const snapshotQuery = trpc.rooms.snapshot.useQuery(
    { roomId: numericRoomId, memberId: credential?.memberId ?? 0, memberToken: credential?.memberToken ?? "" },
    { enabled: Boolean(credential && Number.isFinite(numericRoomId)), refetchInterval: 3000 },
  );
  const setReady = trpc.rooms.setReady.useMutation({ onSuccess: () => snapshotQuery.refetch() });
  const membership = snapshotQuery.data?.members.find((member) => member.id === credential?.memberId);
  const assignedPlayer: 1 | 2 = membership?.role === "host" ? 1 : 2;
  const matchingPlayers = game ? snapshotQuery.data?.members.filter((member) => member.isReady && member.gameFingerprint === game.fingerprint && member.coreVersion === PS1_NETPLAY_CORE_VERSION) ?? [] : [];
  const ps1NetplayReady = Boolean(game && credential && matchingPlayers.length >= 2);

  const refreshBiosStatus = () => {
    if (Platform.OS === "web") return;
    setBiosStatus(MoudieEmulatorModule.getBiosStatus());
    setRuntimeStatus(MoudieEmulatorModule.getPs1LaunchStatus());
  };

  useEffect(() => {
    refreshBiosStatus();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = MoudieEmulatorModule.addListener("nativeOverlayAction", (payload) => {
      if (payload.action === "toggle-microphone") voiceChatRef.current?.setMicrophoneEnabled(!payload.muted);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Number.isFinite(numericRoomId)) getRoomCredential(numericRoomId).then(setCredential);
  }, [numericRoomId]);

  useEffect(() => {
    if (!credential || Platform.OS === "web") return;
    const socket = createNetplaySocket({ roomId: numericRoomId, memberId: credential.memberId, memberToken: credential.memberToken });
    socketRef.current = socket;
    const connected = () => setRoomConnected(true);
    const disconnected = () => { setRoomConnected(false); setRemoteOnline(false); };
    const joined = (payload: { onlineMemberIds?: number[] }) => setRemoteOnline(Boolean(payload.onlineMemberIds?.some((id) => id !== credential.memberId)));
    const presence = (payload: { memberId?: number; online?: boolean }) => {
      if (payload.memberId !== credential.memberId) setRemoteOnline(Boolean(payload.online));
    };
    const start = (payload: { system?: string }) => {
      if (payload.system !== "ps1" || !game || !credential) return;
      setStatus("تم تأكيد جاهزية الجهازين. جارٍ فتح مشغّل PS1 بالتوقيت المشترك…");
      launchGame(true);
    };
    socket.on("connect", connected);
    socket.on("disconnect", disconnected);
    socket.on("netplay:joined", joined);
    socket.on("netplay:presence", presence);
    socket.on("netplay:session-start", start);
    socket.connect();
    return () => {
      socket.off("connect", connected);
      socket.off("disconnect", disconnected);
      socket.off("netplay:joined", joined);
      socket.off("netplay:presence", presence);
      socket.off("netplay:session-start", start);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [credential, game, numericRoomId]);

  const pickGame = async () => {
    try {
      setIsPicking(true);
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, base64: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!isPs1GameFile(asset.name)) {
        haptic.error();
        Alert.alert("الملف غير مناسب", "اختر ملف PS1 كاملاً بامتداد .bin أو .chd أو .pbp. لا تختر ملف CUE وحده لأنه يحتاج BIN مرافقاً.");
        return;
      }
      if (Platform.OS === "web") throw new Error("فحص ملف PS1 وتجهيزه للغرفة متاحان في APK Android فقط.");
      setStatus("جارٍ فحص بصمة ملف PS1 محلياً للتحقق من تطابقه عند اللاعب الآخر…");
      const fingerprint = await MoudieEmulatorModule.fingerprintPS1Game(asset.uri, asset.name);
      setGame({ name: asset.name, uri: asset.uri, fingerprint });
      setGameReady(false);
      setStartRequested(false);
      if (credential) {
        await setReady.mutateAsync({
          memberId: credential.memberId,
          memberToken: credential.memberToken,
          isReady: false,
          gameFingerprint: fingerprint,
          coreVersion: PS1_NETPLAY_CORE_VERSION,
        });
      }
      setStatus("تم اختيار الملف وبصمته محلياً. اضغط «استعداد» بعد التأكد من اختيار اللاعب الآخر للملف نفسه.");
      haptic.success();
    } catch (error) {
      haptic.error();
      Alert.alert("تعذر اختيار الملف", error instanceof Error ? error.message : "أعد المحاولة واختر ملف لعبة من التخزين.");
    } finally {
      setIsPicking(false);
    }
  };

  const markGameReady = async () => {
    if (!game || !credential || !roomConnected) return;
    try {
      await setReady.mutateAsync({
        memberId: credential.memberId,
        memberToken: credential.memberToken,
        isReady: true,
        gameFingerprint: game.fingerprint,
        coreVersion: PS1_NETPLAY_CORE_VERSION,
      });
      socketRef.current?.emit("netplay:session-ready", { system: "ps1", fingerprint: game.fingerprint, coreVersion: PS1_NETPLAY_CORE_VERSION });
      setGameReady(true);
      setStatus("تم إعلان جاهزية ملفك. انتظر جاهزية اللاعب الآخر، ثم يطلب المضيف بدء الجلسة.");
      haptic.success();
    } catch (error) {
      haptic.error();
      Alert.alert("تعذر إعلان الاستعداد", error instanceof Error ? error.message : "أعد المحاولة.");
    }
  };

  const requestSynchronizedStart = () => {
    if (!gameReady || assignedPlayer !== 1 || !ps1NetplayReady) return;
    socketRef.current?.emit("netplay:session-start-request", { system: "ps1" });
    setStartRequested(true);
    setStatus("جارٍ التحقق من ملف الجهازين والمحرك قبل إعطاء إشارة البدء…");
  };

  const launchGame = async (withNetplay = false) => {
    if (!game) return;
    if (Platform.OS === "web") {
      Alert.alert("نسخة Android مطلوبة", "مشغّل PS1 الأصلي يعمل في ملف APK على أندرويد، ولا يعمل داخل معاينة الويب.");
      return;
    }
    try {
      setIsLaunching(true);
      const netplay = withNetplay && credential && game.fingerprint && ps1NetplayReady ? {
        serverUrl: getApiBaseUrl(),
        roomId: numericRoomId,
        memberId: credential.memberId,
        memberToken: credential.memberToken,
        fingerprint: game.fingerprint,
        player: assignedPlayer,
      } : undefined;
      if (withNetplay && !netplay) throw new Error("PS1 NetPlay يحتاج لاعبين في الغرفة اختارا الملف نفسه كاملاً.");
      setStatus(netplay ? "جارٍ تجهيز PS1 NetPlay وتعيين دور جهازك داخل الغرفة…" : "جارٍ تجهيز الملف وفتح PCSX ReARMed…");
      await MoudieEmulatorModule.launchPS1Game(game.uri, game.name, netplay);
      setStatus(netplay ? "تم فتح مشغّل PS1 وربطه بالغرفة. انتظر رسالة التحقق داخل شاشة اللعب." : "تم فتح المشغّل المحلي. عند الرجوع ستعود إلى هذه الغرفة.");
    } catch (error) {
      haptic.error();
      const message = error instanceof Error ? error.message : "تعذر بدء مشغّل PS1.";
      setStatus(message);
      Alert.alert("تعذر تشغيل اللعبة", message);
    } finally {
      setIsLaunching(false);
    }
  };

  const pickBios = async () => {
    if (Platform.OS === "web") {
      Alert.alert("نسخة Android مطلوبة", "فحص وإضافة BIOS محلي متاحان في ملف APK فقط.");
      return;
    }
    try {
      setIsInstallingBios(true);
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, base64: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      const nextStatus = await MoudieEmulatorModule.installPS1Bios(asset.uri, asset.name);
      setBiosStatus(nextStatus);
      haptic.success();
      Alert.alert("تمت إضافة BIOS", "تم حفظ ملف BIOS محلياً داخل التطبيق. لا يتم رفعه أو مشاركته.");
    } catch (error) {
      haptic.error();
      Alert.alert("تعذر إضافة BIOS", error instanceof Error ? error.message : "اختر dump قانونياً باسم متوافق.");
    } finally {
      setIsInstallingBios(false);
    }
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.replace({ pathname: "/room/[roomId]", params: { roomId: String(roomId ?? "") } })} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Text style={styles.backText}>‹ العودة إلى الغرفة</Text>
          </Pressable>
          <Text style={styles.chip}>PS1 · BETA</Text>
        </View>

        <Text style={styles.eyebrow}>PCSX REARMED</Text>
        <Text style={styles.title}>مشغّل PlayStation 1</Text>
        <Text style={styles.subtitle}>تشغيل محلي داخل تطبيق Moudie NetPlay. لا تتضمن النسخة ألعاباً أو ملفات BIOS؛ استخدم فقط الملفات التي تملكها قانونياً.</Text>

        <View style={styles.preview}>
          <Text style={styles.previewMark}>PS</Text>
          <Text style={styles.previewTitle}>{game ? game.name : "لم يتم اختيار لعبة"}</Text>
          <Text style={styles.previewText}>{game ? "جاهز للفتح في المشغّل الأصلي" : "تدعم النسخة BIN وCHD وPBP الكاملة"}</Text>
        </View>

        <Pressable onPress={pickGame} disabled={isPicking || isLaunching} style={({ pressed }) => [styles.primaryButton, (pressed || isPicking || isLaunching) && styles.pressed]}>
          {isPicking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{game ? "تغيير ملف لعبة PS1" : "1. اختيار ملف لعبة PS1"}</Text>}
        </Pressable>

        {game && (
          <Pressable onPress={() => launchGame(false)} disabled={isLaunching || isPicking || runtimeStatus?.available === false} style={({ pressed }) => [styles.launchButton, (pressed || isLaunching || isPicking || runtimeStatus?.available === false) && styles.pressed]}>
            {isLaunching ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.launchText}>2. تشغيل محلياً بوضع أفقي</Text>}
          </Pressable>
        )}

        {game && <View style={styles.netplayCard}>
          <Text style={styles.statusTitle}>PS1 NetPlay</Text>
          <Text style={styles.statusText}>{ps1NetplayReady ? `اختار اللاعبان نفس الملف. ستكون اللاعب ${assignedPlayer}.` : `بانتظار الاستعداد والملف المطابق (${matchingPlayers.length}/2 جاهزان).`}</Text>
          <Pressable onPress={markGameReady} disabled={gameReady || isLaunching || isPicking || !roomConnected} style={({ pressed }) => [styles.netplayButton, (gameReady || pressed || isLaunching || isPicking || !roomConnected) && styles.netplayDisabled]}>
            <Text style={styles.launchText}>{gameReady ? "تم إعلان الاستعداد" : "2. استعداد"}</Text>
          </Pressable>
          <Pressable onPress={requestSynchronizedStart} disabled={!gameReady || !ps1NetplayReady || assignedPlayer !== 1 || startRequested || isLaunching} style={({ pressed }) => [styles.netplayButton, (!gameReady || !ps1NetplayReady || assignedPlayer !== 1 || startRequested || pressed || isLaunching) && styles.netplayDisabled]}>
            {isLaunching ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.launchText}>{assignedPlayer === 1 ? (startRequested ? "جارٍ تأكيد البداية…" : "3. ابدأ PS1 للجميع") : "بانتظار المضيف لبدء الجلسة"}</Text>}
          </Pressable>
        </View>}

        {Platform.OS !== "web" && <>
          <RoomChat socket={roomConnected ? socketRef.current : null} title="دردشة غرفة PS1" />
          <RoomVoiceChat ref={voiceChatRef} socket={roomConnected ? socketRef.current : null} isHost={assignedPlayer === 1} remoteOnline={remoteOnline} />
        </>}

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>حالة مشغّل PS1</Text>
          <Text style={styles.statusText}>{status}</Text>
          <Text style={styles.statusText}>{runtimeStatus?.message ?? "جارٍ التحقق من core المحلي…"}</Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>حالة BIOS</Text>
          <Text style={styles.statusText}>{biosStatus?.ps1.message ?? "جارٍ فحص BIOS المحلي…"}</Text>
          {!biosStatus?.ps1.available && <Text style={styles.biosWarning}>قد تبدأ بعض الألعاب عبر HLE، لكن إضافة BIOS محلي متوافق تحسن توافق PCSX ReARMed وتكشف سبب فشل الألعاب التي تحتاجه.</Text>}
          <Pressable onPress={pickBios} disabled={isInstallingBios || isLaunching} style={({ pressed }) => [styles.primaryButton, (pressed || isInstallingBios || isLaunching) && styles.pressed]}>
            {isInstallingBios ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>إضافة BIOS محلي قانوني</Text>}
          </Pressable>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>حدود النسخة التجريبية الحالية</Text>
          <Text style={styles.noteText}>يعمل PS1 NetPlay فقط عندما يختار اللاعبان ملفاً مطابقاً بالبصمة نفسها. لا تُرفع اللعبة إلى الخادم؛ تمر عبر الغرفة ضغطات التحكم وحالة بداية قصيرة فقط.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 10, paddingBottom: 28 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  back: { paddingVertical: 8 },
  backText: { color: "#9BAFC4", fontSize: 15, fontWeight: "800" },
  chip: { color: "#F4C662", backgroundColor: "#2B2920", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, fontSize: 11, fontWeight: "900" },
  eyebrow: { color: "#62C2EB", fontSize: 12, fontWeight: "900", letterSpacing: 1.1, textAlign: "right", marginTop: 23 },
  title: { color: "#F3F7FB", fontSize: 29, lineHeight: 38, fontWeight: "900", textAlign: "right", marginTop: 4 },
  subtitle: { color: "#9BAFC4", fontSize: 14, lineHeight: 21, textAlign: "right", marginTop: 8 },
  preview: { minHeight: 210, backgroundColor: "#070C15", borderWidth: 1, borderColor: "#31465F", borderRadius: 20, alignItems: "center", justifyContent: "center", padding: 22, marginTop: 22 },
  previewMark: { width: 66, height: 66, borderRadius: 33, textAlign: "center", textAlignVertical: "center", color: "#D8F4FF", backgroundColor: "#13415A", borderWidth: 1, borderColor: "#37799B", fontSize: 25, fontWeight: "900" },
  previewTitle: { color: "#F3F7FB", fontSize: 16, fontWeight: "900", textAlign: "center", marginTop: 13 },
  previewText: { color: "#8FA9C0", fontSize: 12, textAlign: "center", marginTop: 5 },
  primaryButton: { minHeight: 53, borderRadius: 16, backgroundColor: "#146C94", justifyContent: "center", alignItems: "center", marginTop: 15 },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  launchButton: { minHeight: 53, borderRadius: 16, backgroundColor: "#F26B5B", justifyContent: "center", alignItems: "center", marginTop: 10 },
  launchText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  netplayCard: { backgroundColor: "#102A34", borderWidth: 1, borderColor: "#2E7890", borderRadius: 16, padding: 15, marginTop: 18 },
  netplayButton: { minHeight: 49, borderRadius: 14, backgroundColor: "#247F9E", justifyContent: "center", alignItems: "center", marginTop: 12 },
  netplayDisabled: { opacity: 0.45 },
  statusCard: { backgroundColor: "#162235", borderColor: "#29415B", borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 18 },
  statusTitle: { color: "#F4C662", fontSize: 13, fontWeight: "900", textAlign: "right" },
  statusText: { color: "#D5E1EB", fontSize: 13, lineHeight: 20, textAlign: "right", marginTop: 5 },
  noteCard: { backgroundColor: "#2A2221", borderLeftWidth: 3, borderLeftColor: "#F4B942", borderRadius: 15, padding: 14, marginTop: 15 },
  noteTitle: { color: "#F4C662", fontSize: 13, fontWeight: "900", textAlign: "right" },
  noteText: { color: "#D5C5BD", fontSize: 12, lineHeight: 19, textAlign: "right", marginTop: 4 },
  biosWarning: { color: "#F4C662", fontSize: 12, lineHeight: 18, textAlign: "right", marginTop: 10 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
