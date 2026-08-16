import { useCallback, useRef, useState, type ReactNode } from "react";
import { View, type GestureResponderEvent, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";

import { getFamicomFocusButtonAt, type FamicomFocusButton } from "@/lib/famicom-focus-touch";

type ActiveTouch = { identifier: number; locationX: number; locationY: number };

type Props = {
  scale: number;
  onButtonChange: (button: FamicomFocusButton, isDown: boolean) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Handles every finger from one responder surface. Unlike independent
 * Pressables, it preserves D-pad + A/B combinations on Android.
 */
export function FamicomFocusMultitouch({ scale, onButtonChange, children, style }: Props) {
  const [width, setWidth] = useState(0);
  const activeButtonsRef = useRef(new Map<number, FamicomFocusButton>());

  const syncTouches = useCallback((touches: readonly ActiveTouch[]) => {
    if (width <= 0) return;
    const next = new Map<number, FamicomFocusButton>();
    touches.forEach((touch) => {
      const button = getFamicomFocusButtonAt(touch.locationX, touch.locationY, width, scale);
      if (button) next.set(touch.identifier, button);
    });

    const previous = activeButtonsRef.current;
    previous.forEach((button, identifier) => {
      if (next.get(identifier) !== button) onButtonChange(button, false);
    });
    next.forEach((button, identifier) => {
      if (previous.get(identifier) !== button) onButtonChange(button, true);
    });
    activeButtonsRef.current = next;
  }, [onButtonChange, scale, width]);

  const handleLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const handleTouch = (event: GestureResponderEvent) => syncTouches(event.nativeEvent.touches as unknown as ActiveTouch[]);
  const releaseAll = () => {
    activeButtonsRef.current.forEach((button) => onButtonChange(button, false));
    activeButtonsRef.current.clear();
  };

  return (
    <View
      style={style}
      onLayout={handleLayout}
      onTouchStart={handleTouch}
      onTouchMove={handleTouch}
      onTouchEnd={handleTouch}
      onTouchCancel={releaseAll}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleTouch}
      onResponderMove={handleTouch}
      onResponderRelease={handleTouch}
      onResponderTerminate={releaseAll}
      onResponderTerminationRequest={() => false}
    >
      {children}
    </View>
  );
}
