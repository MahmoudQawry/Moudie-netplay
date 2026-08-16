const ReactNative = require("react-native");

const Animated = {
  View: ReactNative.View,
  Text: ReactNative.Text,
  ScrollView: ReactNative.ScrollView,
  Image: ReactNative.Image,
  createAnimatedComponent: (Component) => Component,
};

const passthrough = (value) => value;

module.exports = {
  default: Animated,
  ...Animated,
  makeMutable: (value) => ({ value }),
  useSharedValue: (value) => ({ value }),
  useAnimatedStyle: (factory) => factory(),
  useAnimatedRef: () => null,
  useScrollOffset: () => ({ value: 0 }),
  withTiming: passthrough,
  withSpring: passthrough,
  withDelay: (_delay, value) => value,
  withRepeat: passthrough,
  withSequence: (...values) => values[values.length - 1],
  interpolate: (value) => value,
  Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },
};
