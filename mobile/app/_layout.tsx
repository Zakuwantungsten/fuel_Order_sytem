import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
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

  // Set up the notification handler early so that local notifications (triggered
  // by socket events) show banners and play sound even before a push token is
  // registered. Idempotent — safe to also call inside registerForPush().
  useEffect(() => {
    initNotificationHandler();
  }, []);

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
