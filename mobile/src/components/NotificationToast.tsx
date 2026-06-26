import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ToastData {
  title: string;
  message: string;
  type?: string;
}

interface ToastContextValue {
  showToast: (data: ToastData) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

function iconFor(type?: string): { icon: IoniconName; tone: 'primary' | 'danger' | 'warning' | 'info' | 'success' } {
  if (type === 'lpo_cancelled') return { icon: 'close-circle', tone: 'danger' };
  if (type === 'lpo_amended') return { icon: 'create', tone: 'warning' };
  if (type === 'lpo_created') return { icon: 'receipt', tone: 'primary' };
  if (type === 'yard_fuel_recorded') return { icon: 'water', tone: 'info' };
  if (type === 'error') return { icon: 'alert-circle', tone: 'danger' };
  if (type === 'warning') return { icon: 'warning', tone: 'warning' };
  return { icon: 'notifications', tone: 'primary' };
}

export function NotificationToastProvider({ children }: { children: React.ReactNode }) {
  const { colors, spacing, font, weight, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastData | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -16, duration: 250, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  const showToast = useCallback(
    (data: ToastData) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(data);
      opacity.setValue(0);
      translateY.setValue(-16);

      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      ]).start();

      timer.current = setTimeout(dismiss, 4500);
    },
    [opacity, translateY, dismiss]
  );

  const meta = toast ? iconFor(toast.type) : null;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && meta ? (
        <Animated.View
          style={[
            styles.container,
            {
              top: insets.top + 6,
              backgroundColor: colors.surface,
              borderColor: colors[meta.tone],
              borderRadius: radius.lg,
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <Pressable onPress={dismiss} style={styles.inner}>
            <View style={[styles.iconWrap, { backgroundColor: `${colors[meta.tone]}22` }]}>
              <Ionicons name={meta.icon} size={20} color={colors[meta.tone]} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text
                style={{ color: colors.text, fontWeight: weight.bold, fontSize: font.body }}
                numberOfLines={1}
              >
                {toast.title}
              </Text>
              <Text
                style={{ color: colors.textMuted, fontSize: font.small, marginTop: 1 }}
                numberOfLines={2}
              >
                {toast.message}
              </Text>
            </View>
            <Ionicons name="close" size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
