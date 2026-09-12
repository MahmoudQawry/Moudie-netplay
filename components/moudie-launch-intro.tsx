import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/lib/language";

type Props = { children: ReactNode };

/** Official boot video only: no duplicate logo, poster, animation, or overlay branding. */
export function MoudieLaunchIntro({ children }: Props) {
  const { t } = useLanguage();
  const [introVisible, setIntroVisible] = useState(true);
  const bootVideo = useVideoPlayer(require("@/assets/videos/classic-era-official-boot.mp4"), (player) => {
    player.muted = true;
    player.loop = false;
    player.play();
  });

  useEffect(() => {
    const endSubscription = bootVideo.addListener("playToEnd", () => setIntroVisible(false));
    return () => endSubscription.remove();
  }, [bootVideo]);

  return <View style={styles.host}>
    {children}
    {introVisible && <View style={styles.screen} accessibilityLabel={t("introBootLabel")}>
      <VideoView player={bootVideo} style={styles.video} nativeControls={false} contentFit="cover" />
      <Pressable style={styles.skip} onPress={() => setIntroVisible(false)} accessibilityRole="button">
        <Text style={styles.skipText}>{t("introSkip")}</Text>
      </Pressable>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: "#030711", overflow: "hidden", zIndex: 20 },
  video: { ...StyleSheet.absoluteFillObject },
  skip: { position: "absolute", right: 18, bottom: 28, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.55)" },
  skipText: { color: "#FFFFFF", fontSize: 11, letterSpacing: 1.2, fontWeight: "900" },
});
