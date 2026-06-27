import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';
import { Loading } from '../../src/components/ui';

/**
 * Auth guard for everything under (app). Screens render their own AppHeader,
 * so the native stack header stays hidden.
 */
export default function AppLayout() {
  const { user, initializing } = useAuth();

  if (initializing) return <Loading label="Loading…" />;
  if (!user) return <Redirect href="/login" />;
  // Block access to the main app until the user has set a permanent password.
  if (user.mustChangePassword) return <Redirect href="/change-password" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
