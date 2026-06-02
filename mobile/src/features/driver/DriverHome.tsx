import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { getApiErrorMessage } from '../../api/client';
import { DriverDashboard, DriverLpoEntry, JourneyPhase, getDriverDashboard } from '../../api/driver';
import { getStationCurrencyMap } from '../../api/config';
import { currencyForStation, currencySymbol } from '../../api/manager';
import { AppHeader } from '../../components/AppHeader';
import { Card, EmptyState, Loading, Muted, Screen, SectionHeader, StatTile, Tag } from '../../components/ui';
import { LpoDetailsSheet } from '../../components/LpoDetailsSheet';
import { useTheme } from '../../theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function phaseMeta(phase: JourneyPhase, colors: ReturnType<typeof useTheme>['colors']) {
  switch (phase) {
    case 'going':
      return { label: 'Going to destination', color: colors.success, icon: 'navigate' as IoniconName };
    case 'returning':
      return { label: 'Returning journey', color: colors.info, icon: 'return-up-back' as IoniconName };
    case 'completed':
      return { label: 'Journey completed', color: colors.textMuted, icon: 'checkmark-done' as IoniconName };
    default:
      return { label: 'Awaiting assignment', color: colors.warning, icon: 'time' as IoniconName };
  }
}

export default function DriverHome() {
  const { user } = useAuth();
  const { colors, spacing, radius, font, weight } = useTheme();
  const truck = user?.truckNo ?? '';

  const [selected, setSelected] = useState<DriverLpoEntry | null>(null);

  const query = useQuery<DriverDashboard>({
    queryKey: ['driver-dashboard', truck],
    queryFn: () => getDriverDashboard(truck),
    enabled: !!truck,
  });

  const { data: currencyMap } = useQuery({
    queryKey: ['station-currencies'],
    queryFn: getStationCurrencyMap,
    staleTime: 10 * 60_000,
  });
  const symbolFor = (st: string) => currencySymbol(currencyForStation(st, currencyMap));

  const onRefresh = useCallback(() => {
    query.refetch();
  }, [query]);

  if (!truck) {
    return (
      <Screen>
        <AppHeader title="FuelOrder" subtitle="Driver" />
        <View style={{ padding: spacing.md }}>
          <Card>
            <EmptyState
              icon="alert-circle-outline"
              title="Truck number required"
              subtitle="Your account has no truck assigned. Please contact your supervisor."
            />
          </Card>
        </View>
      </Screen>
    );
  }

  if (query.isLoading) {
    return (
      <Screen>
        <AppHeader title="FuelOrder" subtitle={truck} />
        <Loading label="Loading your trip…" />
      </Screen>
    );
  }

  const data = query.data;
  const phase = data ? phaseMeta(data.journey.journeyPhase, colors) : phaseMeta('none', colors);
  const going = data?.journey.goingDO;
  const returning = data?.journey.returningDO;
  const loadingPoint = going?.loadingPoint || returning?.loadingPoint || 'N/A';

  return (
    <Screen>
      <AppHeader title="FuelOrder" subtitle={truck} badge="Driver" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.md }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {query.isError ? (
          <Card>
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load your data"
              subtitle={getApiErrorMessage(query.error, 'Pull down to retry.')}
            />
          </Card>
        ) : (
          <>
            {/* Journey card */}
            <View style={[styles.journey, { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.md }]}>
              <View style={styles.journeyTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.jLabel, { color: colors.onPrimary, opacity: 0.85 }]}>Your truck</Text>
                  <Text style={[styles.truck, { color: colors.onPrimary }]}>{truck}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.jLabel, { color: colors.onPrimary, opacity: 0.85 }]}>Loading point</Text>
                  <View style={styles.inline}>
                    <Ionicons name="location" size={14} color={colors.onPrimary} />
                    <Text style={[styles.loadPoint, { color: colors.onPrimary }]}>{loadingPoint}</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.phasePill, { backgroundColor: phase.color }]}>
                <Ionicons name={phase.icon} size={13} color="#fff" />
                <Text style={styles.phaseText}>{phase.label}</Text>
              </View>

              <View style={[styles.doRow, { gap: spacing.sm }]}>
                <DoBox heading="GOING" doNo={going?.doNumber} dest={going?.destination} active={data?.journey.journeyPhase === 'going'} />
                <DoBox heading="RETURNING" doNo={returning?.doNumber} dest={returning?.destination} active={data?.journey.journeyPhase === 'returning'} />
              </View>
            </View>

            {/* Fuel summary */}
            <View style={[styles.stats, { gap: spacing.sm, marginTop: spacing.md }]}>
              <StatTile label="Total" value={`${data?.totals.total ?? 0}L`} icon="water" tone="primary" />
              <StatTile label="Used" value={`${data?.totals.used ?? 0}L`} icon="flame" tone="warning" />
              <StatTile label="Remaining" value={`${data?.totals.remaining ?? 0}L`} icon="checkmark-circle" tone="success" />
            </View>

            {/* LPO entries */}
            <SectionHeader title="Fuel Orders / LPOs" count={data?.lpoEntries.length ?? 0} />
            {(data?.lpoEntries.length ?? 0) === 0 ? (
              <Card>
                <EmptyState icon="receipt-outline" title="No fuel orders yet" subtitle="LPO entries appear here once created." />
              </Card>
            ) : (
              data!.lpoEntries.map((e) => <LpoCard key={e.id} entry={e} />)
            )}
          </>
        )}
      </ScrollView>

      {selected ? (
        <LpoDetailsSheet
          item={{
            lpoNo: selected.lpoNo,
            dateLabel: selected.date ? new Date(selected.date).toLocaleDateString() : undefined,
            truckNo: truck,
            doNo: selected.doNo,
            station: selected.station,
            destination: selected.destination,
            liters: selected.liters,
            rate: selected.rate,
            amount: selected.amount,
            symbol: symbolFor(selected.station),
            isCancelled: selected.isCancelled,
            isDriverAccount: selected.isDriverAccount,
            amended: !!selected.amendedAt,
            originalLiters: selected.originalLiters,
            amendedAtLabel: selected.amendedAt ? new Date(selected.amendedAt).toLocaleDateString() : undefined,
            cancellationReason: selected.cancellationReason,
          }}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </Screen>
  );

  function DoBox({ heading, doNo, dest, active }: { heading: string; doNo?: string; dest?: string; active?: boolean }) {
    return (
      <View
        style={[
          styles.doBox,
          { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.md, padding: spacing.sm },
          active ? { backgroundColor: 'rgba(255,255,255,0.30)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' } : null,
        ]}
      >
        <Text style={[styles.doHeading, { color: colors.onPrimary, opacity: 0.85 }]}>{heading}</Text>
        <Text style={[styles.doNo, { color: colors.onPrimary }]}>DO: {doNo || 'N/A'}</Text>
        <View style={styles.inline}>
          <Ionicons name="arrow-forward" size={12} color={colors.onPrimary} />
          <Text style={[styles.doDest, { color: colors.onPrimary, opacity: 0.9 }]} numberOfLines={1}>
            {dest || 'N/A'}
          </Text>
        </View>
      </View>
    );
  }

  function LpoCard({ entry }: { entry: DriverLpoEntry }) {
    const cancelled = entry.isCancelled;
    const amended = !cancelled && !!entry.amendedAt;
    const accent = cancelled ? colors.danger : entry.isDriverAccount ? colors.warning : colors.primary;
    const sym = symbolFor(entry.station);
    return (
      <Pressable onPress={() => setSelected(entry)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Card accent={accent} style={{ marginBottom: spacing.sm }}>
          <View style={styles.lpoTop}>
            <Text style={{ fontSize: font.body, fontWeight: weight.bold, color: cancelled ? colors.textMuted : colors.text }}>{entry.station}</Text>
            {cancelled ? <Tag label="CANCELLED" color={colors.textMuted} /> : null}
            {amended ? <Tag label="AMENDED" color={colors.warning} /> : null}
            {entry.isDriverAccount && !cancelled ? <Tag label="DRIVER A/C" color={colors.warning} /> : null}
          </View>
          <Text
            style={{
              fontSize: font.body,
              color: cancelled ? colors.textMuted : colors.text,
              marginTop: spacing.xs,
              textDecorationLine: cancelled ? 'line-through' : 'none',
            }}
          >
            {entry.liters}L @ {entry.rate} ={' '}
            <Text style={{ fontWeight: weight.bold }}>{sym} {entry.amount?.toLocaleString()}</Text>
          </Text>
          <Text style={{ fontSize: font.small, color: colors.textMuted, marginTop: 2 }}>
            LPO: {entry.lpoNo || 'N/A'} • DO: {entry.doNo}
          </Text>
          <Text style={{ fontSize: font.small, color: colors.textMuted, marginTop: 2 }}>Dest: {entry.destination}</Text>
          {entry.date ? (
            <Text style={{ fontSize: font.tiny, color: colors.textMuted, marginTop: spacing.xs }}>
              {new Date(entry.date).toLocaleDateString()}
            </Text>
          ) : null}
        </Card>
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  journey: {},
  journeyTop: { flexDirection: 'row', justifyContent: 'space-between' },
  jLabel: { fontSize: 12 },
  truck: { fontSize: 22, fontWeight: '800' },
  loadPoint: { fontSize: 16, fontWeight: '700' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  phasePill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 14 },
  phaseText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  doRow: { flexDirection: 'row', marginTop: 14 },
  doBox: { flex: 1 },
  doHeading: { fontSize: 11, marginBottom: 2, fontWeight: '600' },
  doNo: { fontSize: 14, fontWeight: '700' },
  doDest: { fontSize: 12 },
  stats: { flexDirection: 'row' },
  lpoTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
