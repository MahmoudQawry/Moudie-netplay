// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

const rawBundleId = "com.app.moudienetplay";
const bundleId = rawBundleId
  .replace(/[-_]/g, ".")
  .replace(/[^a-zA-Z0-9.]/g, "")
  .replace(/\.+/g, ".")
  .replace(/^\.+|\.+$/g, "")
  .toLowerCase()
  .split(".")
  .map((segment) => (/^[a-zA-Z]/.test(segment) ? segment : "x" + segment))
  .join(".") || "space.manus.app";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  appName: "Classic Era by Moudie",
  appSlug: "moudie-netplay",
  logoUrl: "./assets/images/moudie-brand-icon.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.4.21",
  orientation: "default",
  icon: "./assets/images/moudie-brand-icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: false,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    versionCode: 44,
    adaptiveIcon: {
      backgroundColor: "#101827",
      foregroundImage: "./assets/images/moudie-brand-icon.png",
      backgroundImage: "./assets/images/moudie-brand-icon.png",
      monochromeImage: "./assets/images/moudie-brand-icon.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: [
      "POST_NOTIFICATIONS",
      "RECORD_AUDIO",
      "MODIFY_AUDIO_SETTINGS",
      "ACCESS_NETWORK_STATE",
      "CHANGE_NETWORK_STATE",
      "BLUETOOTH",
      "BLUETOOTH_ADMIN",
      "BLUETOOTH_CONNECT",
    ],
    intentFilters: [{
      action: "VIEW",
      autoVerify: true,
      data: [{ scheme: env.scheme, host: "*" }],
      category: ["BROWSABLE", "DEFAULT"],
    }],
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/moudie-brand-icon.png",
  },
  plugins: [
    "expo-router",
    ["expo-secure-store", { configureAndroidBackup: true }],
    "expo-document-picker",
    "@livekit/react-native-expo-plugin",
    [
      "@config-plugins/react-native-webrtc",
      { microphonePermission: "اسمح لـ Classic Era by Moudie باستخدام الميكروفون للتحدث داخل الغرف الخاصة." },
    ],
    [
      "expo-build-properties",
      { android: { buildArchs: ["armeabi-v7a", "arm64-v8a"], minSdkVersion: 24 } },
    ],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
};

export default config;
