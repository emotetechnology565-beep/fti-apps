import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

export function PriceTicker({
  count,
  children,
}: {
  count: number;
  children: (duplicate: boolean) => ReactNode;
}) {
  const [position] = useState(() => new Animated.Value(0));
  const [viewport, setViewport] = useState(0);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [touching, setTouching] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [screenReader, setScreenReader] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const copies = Math.max(1, Math.ceil(viewport / Math.max(1, count * 336)));
  const staticMode = reduceMotion || screenReader;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotion(value);
      })
      .catch(() => {});
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => {
        if (mounted) setScreenReader(value);
      })
      .catch(() => {});
    const motion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    const reader = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setScreenReader,
    );
    const app = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => {
      mounted = false;
      motion.remove();
      reader.remove();
      app.remove();
    };
  }, []);

  useEffect(() => {
    position.setValue(0);
  }, [position, width]);

  useEffect(() => {
    if (!width || staticMode || hovered || touching || !active) return;
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;
    function run(from: number) {
      if (cancelled) return;
      animation = Animated.timing(position, {
        toValue: -width,
        duration: Math.max(1, ((width + from) / 36) * 1000),
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
        isInteraction: false,
      });
      animation.start(({ finished }) => {
        if (finished && !cancelled) {
          position.setValue(0);
          run(0);
        }
      });
    }
    position.stopAnimation((value) =>
      run(Math.max(-width, Math.min(0, value))),
    );
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [position, width, staticMode, hovered, touching, active]);

  return (
    <View>
      <View
        style={styles.viewport}
        onLayout={(event) => setViewport(event.nativeEvent.layout.width)}
        onPointerEnter={(event) => {
          if (event.nativeEvent.pointerType === 'mouse') setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
        onTouchStart={() => setTouching(true)}
        onTouchEnd={() => setTouching(false)}
        onTouchCancel={() => setTouching(false)}
      >
        {staticMode ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.group}
          >
            {children(false)}
          </ScrollView>
        ) : (
          <Animated.View
            style={[styles.belt, { transform: [{ translateX: position }] }]}
          >
            {[false, true].map((duplicate) => (
              <View
                key={String(duplicate)}
                style={styles.group}
                aria-hidden={duplicate}
                accessibilityElementsHidden={duplicate}
                importantForAccessibility={
                  duplicate ? 'no-hide-descendants' : 'auto'
                }
                onLayout={
                  duplicate
                    ? undefined
                    : (event) => setWidth(event.nativeEvent.layout.width)
                }
              >
                {Array.from({ length: copies }, (_, index) => (
                  <View key={index} style={styles.items}>
                    {children(duplicate || index > 0)}
                  </View>
                ))}
              </View>
            ))}
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden', paddingVertical: 12 },
  belt: { flexDirection: 'row', alignSelf: 'flex-start' },
  group: { flexDirection: 'row', gap: 16, paddingRight: 16, flexShrink: 0 },
  items: { flexDirection: 'row', gap: 16, flexShrink: 0 },
});
