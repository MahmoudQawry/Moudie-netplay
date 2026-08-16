import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

function canHaptic() {
  return Platform.OS !== "web";
}

export const haptic = {
  light: () => canHaptic() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  success: () => canHaptic() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => canHaptic() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  selection: () => canHaptic() && Haptics.selectionAsync(),
};
