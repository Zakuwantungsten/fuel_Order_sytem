import React from 'react';
import { ScrollView, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { roleHomeFor } from '../../src/auth/roles';
import { AppHeader } from '../../src/components/AppHeader';
import { Card, EmptyState, Screen } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { RoleHome } from '../../src/types';
import DriverHome from '../../src/features/driver/DriverHome';
import ManagerHome from '../../src/features/manager/ManagerHome';

const PLACEHOLDER: Record<Exclude<RoleHome, 'driver' | 'manager'>, { title: string; subtitle: string; icon: any }> = {
  yard: {
    title: 'Yard dashboard coming soon',
    subtitle: 'Yard fuel dispenses and pending items will appear here.',
    icon: 'cube-outline',
  },
  station: {
    title: 'Station dashboard coming soon',
    subtitle: 'Station fuel records and LPO views will appear here.',
    icon: 'business-outline',
  },
  unsupported: {
    title: 'Not available on mobile yet',
    subtitle: 'Your role is not supported in the app yet. Please use the web portal.',
    icon: 'phone-portrait-outline',
  },
};

export default function HomeScreen() {
  const { user } = useAuth();
  const { spacing } = useTheme();
  const home = roleHomeFor(user?.role);

  if (home === 'driver') return <DriverHome />;
  if (home === 'manager') return <ManagerHome />;

  const info = PLACEHOLDER[home];
  return (
    <Screen>
      <AppHeader title="limka" subtitle={user?.station || user?.yard || 'Dashboard'} />
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Card>
          <EmptyState icon={info.icon} title={info.title} subtitle={info.subtitle} />
        </Card>
      </ScrollView>
    </Screen>
  );
}
