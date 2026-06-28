import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth/AuthContext';
import { Loading } from '../src/components/ui';

/**
 * Entry route: decide where to send the user once we've checked stored tokens.
 */
export default function Index() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return <Loading label="Loading…" />;
  }

  if (user) {
    if (user.mustChangePassword) return <Redirect href="/change-password" />;
    return <Redirect href="/(app)/home" />;
  }
  return <Redirect href="/login" />;
}
