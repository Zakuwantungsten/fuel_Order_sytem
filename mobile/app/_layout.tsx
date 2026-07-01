import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { AuthProvider } from '../src/auth/AuthContext';
import { RealtimeProvider } from '../src/realtime/RealtimeProvider';
import { ThemeProvider, useTheme } from '../src/theme';
import { NotificationToastProvider } from '../src/components/NotificationToast';
import { initNotificationHandler } from '../src/push/registerPush';
import { navigateFromPushData } from '../src/navigation/notificationRouting';
import { markAllReadAndClearBadge } from '../src/notifications/badge';
import { markAllNotificationsRead } from '../src/api/notifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

function ThemedNavigator() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Set up the notification handler early so banners and sound fire when a
  // remote push arrives. Idempotent — safe to call multiple times.
  useEffect(() => {
    initNotificationHandler();
  }, []);

  // Handle notification taps in all three app states:
  useEffect(() => {
    let subscription: { remove: () => void } | undefined;

    (async () => {
      const Notifications = await import('expo-notifications');

      const handlePushResponse = (data: Record<string, unknown>) => {
        void markAllReadAndClearBadge(queryClient, markAllNotificationsRead);
        if (!navigateFromPushData(router, data)) {
          router.push('/(app)/notifications');
        }
      };

      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
        handlePushResponse(data);
      });

      const last = await Notifications.getLastNotificationResponseAsync();
      if (last) {
        const data = (last.notification.request.content.data ?? {}) as Record<string, unknown>;
        handlePushResponse(data);
      }
    })();

    return () => subscription?.remove();
  }, [router, queryClient]);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            {/*
              NotificationToastProvider must wrap RealtimeProvider so the socket
              listener can call showToast() via useToast().
            */}
            <NotificationToastProvider>
              <RealtimeProvider>
                <ThemedNavigator />
              </RealtimeProvider>
            </NotificationToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
