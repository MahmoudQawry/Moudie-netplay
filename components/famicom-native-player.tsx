import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { FAMICOM_WEBVIEW_HTML } from "@/lib/famicom-webview-html";
import { withFamicomStableRenderer } from "@/lib/famicom-stable-renderer";

const FAMICOM_HTML_WITH_STABLE_RENDERER = withFamicomStableRenderer(FAMICOM_WEBVIEW_HTML);

export type FamicomNativePlayerHandle = {
  setButton: (player: 1 | 2, button: string, isDown: boolean) => void;
  resumeAudio: () => void;
  reset: () => void;
  requestState: (requestId?: "local" | "netplay") => void;
  applyState: (snapshot: string) => void;
};

type PlayerMessage = { type?: string; message?: string; snapshot?: string; requestId?: "local" | "netplay" };

type Props = {
  romBase64: string | null;
  onStatus: (message: string) => void;
  onState: (snapshot: string, requestId?: "local" | "netplay") => void;
  onReady?: () => void;
};

export const FamicomNativePlayer = forwardRef<FamicomNativePlayerHandle, Props>(function FamicomNativePlayer({ romBase64, onStatus, onState, onReady }, ref) {
  const webViewRef = useRef<WebView>(null);
  const bridgeReadyRef = useRef(false);

  const send = (payload: object) => webViewRef.current?.postMessage(JSON.stringify(payload));

  useImperativeHandle(ref, () => ({
    setButton: (player, button, isDown) => send({ type: "input", player, button, isDown }),
    resumeAudio: () => send({ type: "resume-audio" }),
    reset: () => send({ type: "reset" }),
    requestState: (requestId = "local") => send({ type: "request-state", requestId }),
    applyState: (snapshot) => send({ type: "apply-state", snapshot }),
  }));

  useEffect(() => {
    if (bridgeReadyRef.current && romBase64) send({ type: "load", romBase64 });
  }, [romBase64]);

  return (
    <View style={styles.root}>
      <WebView
        ref={webViewRef}
        source={{ html: FAMICOM_HTML_WITH_STABLE_RENDERER }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction={false}
        scrollEnabled={false}
        bounces={false}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data) as PlayerMessage;
            if (message.type === "bridge-ready") {
              bridgeReadyRef.current = true;
              if (romBase64) send({ type: "load", romBase64 });
            } else if (message.type === "ready") {
              onStatus("اللعبة تعمل محلياً. استخدم أزرار التحكم أسفل الشاشة.");
              onReady?.();
            } else if (message.type === "state" && typeof message.snapshot === "string") {
              onState(message.snapshot, message.requestId);
            } else if (message.type === "state-applied") {
              onStatus("تمت مزامنة بداية اللعبة مع المضيف.");
            } else if (message.type === "audio-active") {
              onStatus("صوت اللعبة يعمل الآن.");
            } else if (message.type === "error") {
              onStatus(message.message ?? "تعذر تشغيل ملف NES هذا.");
            }
          } catch {
            onStatus("تعذر التواصل مع شاشة المشغّل.");
          }
        }}
        style={styles.webView}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { width: "100%", aspectRatio: 4 / 3, backgroundColor: "#05080E" },
  webView: { flex: 1, backgroundColor: "#05080E" },
});
