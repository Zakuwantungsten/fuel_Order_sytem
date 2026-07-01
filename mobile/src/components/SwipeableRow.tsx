import React, { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

const SWIPE_TRIGGER = 88;
const DISMISS_SLIDE = 420;

interface SwipeableRowProps {
  children: React.ReactNode;
  onDismiss: () => void;
  actionColor: string;
  actionLabel?: string;
}

/**
 * Swipe left or right to dismiss. Uses PanResponder (OTA-safe, no extra native deps).
 */
export function SwipeableRow({
  children,
  onDismiss,
  actionColor,
  actionLabel = 'Dismiss',
}: SwipeableRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const dismissing = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        !dismissing.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        if (dismissing.current) return;
        translateX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (dismissing.current) return;
        const shouldDismiss = Math.abs(g.dx) > SWIPE_TRIGGER || Math.abs(g.vx) > 0.75;
        if (shouldDismiss) {
          dismissing.current = true;
          const toValue = g.dx >= 0 ? DISMISS_SLIDE : -DISMISS_SLIDE;
          Animated.timing(translateX, {
            toValue,
            duration: 180,
            useNativeDriver: true,
          }).start(() => onDismiss());
          return;
        }
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
      onPanResponderTerminate: () => {
        if (dismissing.current) return;
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    })
  ).current;

  const leftActionOpacity = translateX.interpolate({
    inputRange: [0, 24, SWIPE_TRIGGER],
    outputRange: [0, 0.6, 1],
    extrapolate: 'clamp',
  });

  const rightActionOpacity = translateX.interpolate({
    inputRange: [-SWIPE_TRIGGER, -24, 0],
    outputRange: [1, 0.6, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[styles.action, styles.actionLeft, { backgroundColor: actionColor, opacity: leftActionOpacity }]}
      >
        <Text style={styles.actionText}>{actionLabel}</Text>
      </Animated.View>
      <Animated.View
        style={[styles.action, styles.actionRight, { backgroundColor: actionColor, opacity: rightActionOpacity }]}
      >
        <Text style={styles.actionText}>{actionLabel}</Text>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  action: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  actionLeft: {
    alignItems: 'flex-start',
    paddingLeft: 22,
  },
  actionRight: {
    alignItems: 'flex-end',
    paddingRight: 22,
  },
  actionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
