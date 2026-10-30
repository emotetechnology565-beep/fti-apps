import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Platform,
  StyleSheet,
  View,
  type ViewStyle,
  type DimensionValue,
} from 'react-native';

/** One animation per loading region; decorative blocks stay out of the accessibility tree. */
export function Skeleton({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotion(value);
      })
      .catch(() => {});
    const motion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    const app = AppState.addEventListener('change', (value) =>
      setActive(value === 'active'),
    );
    return () => {
      mounted = false;
      motion.remove();
      app.remove();
    };
  }, []);
  useEffect(() => {
    if (reduceMotion || !active) {
      opacity.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 850,
          useNativeDriver: Platform.OS !== 'web',
          isInteraction: false,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 850,
          useNativeDriver: Platform.OS !== 'web',
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, opacity, reduceMotion]);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      aria-busy
      style={style}
    >
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        style={{ opacity }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export function SkeletonBlock({
  width = '100%',
  height = 14,
  radius = 5,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[styles.block, { width, height, borderRadius: radius }, style]}
    />
  );
}
const styles = StyleSheet.create({ block: { backgroundColor: '#E1E8F1' } });
