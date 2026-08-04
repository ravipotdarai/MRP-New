import {useMemo, useRef} from 'react';
import {PanResponder, type GestureResponderHandlers} from 'react-native';

/**
 * Horizontal swipe between tabs. Ignores mostly-vertical pans so nested
 * ScrollViews (Timeline, etc.) keep scrolling.
 */
export function useHorizontalTabSwipe(
  index: number,
  count: number,
  onIndexChange: (next: number) => void,
): GestureResponderHandlers {
  const indexRef = useRef(index);
  indexRef.current = index;
  const onChangeRef = useRef(onIndexChange);
  onChangeRef.current = onIndexChange;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 28 && Math.abs(g.dx) > Math.abs(g.dy) * 1.35,
        onPanResponderRelease: (_, g) => {
          const i = indexRef.current;
          if (g.dx < -50 && i < count - 1) {
            onChangeRef.current(i + 1);
          } else if (g.dx > 50 && i > 0) {
            onChangeRef.current(i - 1);
          }
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [count],
  );

  return responder.panHandlers;
}
