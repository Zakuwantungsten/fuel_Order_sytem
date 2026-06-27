import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/auth/AuthContext';
import { RealtimeProvider } from '../src/realtime/RealtimeProvider';
import { ThemeProvider, useTheme } from '../src/theme';
import { NotificationToastProvider } from '../src/components/NotificationToast';
import { initNotificationHandler } from '../src/push/registerPush';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

function ThemedNavigator() {
  const { colors } = useTheme();
  const router = useRouter();

  // Set up the notification handler early so banners and sound fire when a
  // remote push arrives. Idempotent — safe to call multiple times.
  useEffect(() => {
    initNotificationHandler();
  }, []);

  // Handle notification taps in all three app states:
  //   1. App in foreground  — listener fires immediately
  //   2. App in background  — listener fires when user taps the banner
  //   3. App was closed     — getLastNotificationResponseAsync returns the tap
  //                           that cold-launched the app
  useEffect(() => {
    let subscription: { remove: () => void } | undefined;

    (async () => {
      const Notifications = await import('expo-notifications');

      // Live listener (foreground + background taps)
      subscription = Notifications.addNotificationResponseReceivedListener(() => {
        router.push('/(app)/notifications');
      });

      // Cold-launch: app was killed, user tapped the notification
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last) {
        router.push('/(app)/notifications');
      }
    })();

    return () => subscription?.remove();
  }, [router]);

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
