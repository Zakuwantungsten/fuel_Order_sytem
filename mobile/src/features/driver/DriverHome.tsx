import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { findLpoHighlightIndex } from '../../navigation/notificationRouting';
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

export default function DriverHome({
  highlightLpoNo,
  highlightTruckNo,
}: {
  highlightLpoNo?: string;
  highlightTruckNo?: string;
} = {}) {
  const { user } = useAuth();
  const { colors, spacing, radius, font, weight } = useTheme();
  const truck = user?.truckNo ?? '';

  const [selected, setSelected] = useState<DriverLpoEntry | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const rowOffsets = useRef<Record<string, number>>({});

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

  useEffect(() => {
    if (!highlightLpoNo || !query.data?.lpoEntries?.length) return;
    const idx = findLpoHighlightIndex(query.data.lpoEntries, highlightLpoNo, highlightTruckNo);
    if (idx < 0) return;
    const entry = query.data.lpoEntries[idx];
    setHighlightedId(entry.id);
    const offset = rowOffsets.current[entry.id];
    if (offset != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, offset - 24), animated: true });
    }
    const t = setTimeout(() => setHighlightedId(null), 5000);
    return () => clearTimeout(t);
  }, [highlightLpoNo, highlightTruckNo, query.data?.lpoEntries]);

  if (!truck) {
    return (
      <Screen>
        <AppHeader title="limka" subtitle="Driver" />
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
        <AppHeader title="limka" subtitle={truck} />
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
      <AppHeader title="limka" subtitle={truck} badge="Driver" />
      <ScrollView
        ref={scrollRef}
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
              data!.lpoEntries.map((e) => <LpoCard key={e.id} entry={e} highlighted={e.id === highlightedId} />)
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

  function LpoCard({ entry, highlighted }: { entry: DriverLpoEntry; highlighted?: boolean }) {
    const cancelled = entry.isCancelled;
    const amended = !cancelled && !!entry.amendedAt;
    const driverAc = entry.isDriverAccount && !cancelled;
    const sym = symbolFor(entry.station);

    const stationColor = cancelled ? colors.textMuted : colors.text;
    const dateLabel = entry.date ? new Date(entry.date).toLocaleDateString() : null;

    return (
      <Pressable
        onPress={() => setSelected(entry)}
        onLayout={(e) => {
          rowOffsets.current[entry.id] = e.nativeEvent.layout.y;
        }}
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <Card
          style={{
            marginBottom: spacing.sm,
            padding: 0,
            overflow: 'hidden',
            ...(highlighted
              ? { borderColor: colors.warning, borderWidth: 2, backgroundColor: colors.warningMuted }
              : {}),
          }}
        >
          {/* Header: station (stands out) + amount */}
          <View style={[styles.lpoHeader, { padding: spacing.md, paddingBottom: spacing.sm }]}>
            <View style={[styles.inline, { gap: spacing.sm, flex: 1 }]}>
              <View style={[styles.stationBadge, { backgroundColor: cancelled ? colors.surfaceAlt : colors.primaryMuted }]}>
                <Ionicons name="business" size={18} color={cancelled ? colors.textMuted : colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.miniLabel, { color: colors.textMuted }]}>STATION</Text>
                <Text numberOfLines={1} style={{ fontSize: font.h3, fontWeight: weight.heavy, color: stationColor }}>
                  {entry.station}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', marginLeft: spacing.sm }}>
              <Text style={[styles.miniLabel, { color: colors.textMuted }]}>LITERS</Text>
              <View style={styles.litersWrap}>
                <Text
                  style={{
                    fontSize: font.display,
                    fontWeight: weight.heavy,
                    lineHeight: font.display + 2,
                    color: cancelled ? colors.textMuted : colors.text,
                    textDecorationLine: cancelled ? 'line-through' : 'none',
                  }}
                >
                  {entry.liters?.toLocaleString()}
                </Text>
                <Text style={{ fontSize: font.h3, fontWeight: weight.bold, color: colors.textMuted, marginBottom: 3 }}>L</Text>
              </View>
            </View>
          </View>

          {/* Status tags */}
          {(cancelled || amended || driverAc) && (
            <View style={[styles.lpoTop, { paddingHorizontal: spacing.md, paddingBottom: spacing.sm }]}>
              {cancelled ? <Tag label="CANCELLED" color={colors.danger} bg={colors.dangerMuted} /> : null}
              {amended ? <Tag label="AMENDED" color={colors.warning} bg={colors.warningMuted} /> : null}
              {driverAc ? <Tag label="DRIVER A/C" color={colors.warning} bg={colors.warningMuted} /> : null}
            </View>
          )}

          {/* Contextual note: what changed / why cancelled */}
          {amended && entry.originalLiters != null ? (
            <View style={[styles.noteBox, { backgroundColor: colors.warningMuted, marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md }]}>
              <Ionicons name="create-outline" size={15} color={colors.warning} />
              <Text style={{ color: colors.warning, fontSize: font.small, marginLeft: 6, flex: 1 }}>
                Amended{' '}
                <Text style={{ fontWeight: weight.bold, textDecorationLine: 'line-through' }}>{entry.originalLiters.toLocaleString()}L</Text>
                {' → '}
                <Text style={{ fontWeight: weight.bold }}>{entry.liters.toLocaleString()}L</Text>
              </Text>
            </View>
          ) : null}
          {cancelled ? (
            <View style={[styles.noteBox, { backgroundColor: colors.dangerMuted, marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md }]}>
              <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: font.small, marginLeft: 6, flex: 1 }} numberOfLines={2}>
                {entry.cancellationReason || 'This entry was cancelled.'}
              </Text>
            </View>
          ) : null}

          {/* LPO + DO — the two identifiers that should stand out */}
          <View style={[styles.idRow, { paddingHorizontal: spacing.md, gap: spacing.sm }]}>
            <View style={[styles.idTile, { backgroundColor: colors.primaryMuted, borderRadius: radius.md }]}>
              <View style={styles.inline}>
                <Ionicons name="receipt-outline" size={13} color={colors.primary} />
                <Text style={[styles.idLabel, { color: colors.primary }]}>LPO No.</Text>
              </View>
              <Text numberOfLines={1} style={{ fontSize: font.h3, fontWeight: weight.heavy, color: colors.primary, marginTop: 2 }}>
                {entry.lpoNo || 'N/A'}
              </Text>
            </View>
            <View style={[styles.idTile, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
              <View style={styles.inline}>
                <Ionicons name="cube-outline" size={13} color={colors.text} />
                <Text style={[styles.idLabel, { color: colors.textMuted }]}>DO No.</Text>
              </View>
              <Text numberOfLines={1} style={{ fontSize: font.h3, fontWeight: weight.bold, color: colors.text, marginTop: 2 }}>
                {entry.doNo || 'N/A'}
              </Text>
            </View>
          </View>

          {/* Footer: destination • liters • date */}
          <View style={[styles.lpoFooter, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.sm, borderTopColor: colors.border }]}>
            <View style={[styles.inline, { flex: 1 }]}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <Text numberOfLines={1} style={{ fontSize: font.small, color: colors.textMuted, flex: 1 }}>
                {entry.destination || 'N/A'}
              </Text>
            </View>
            <View style={styles.inline}>
              <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
              <Text
                style={{
                  fontSize: font.small,
                  fontWeight: weight.semibold,
                  color: cancelled ? colors.textMuted : colors.text,
                  textDecorationLine: cancelled ? 'line-through' : 'none',
                }}
              >
                {sym} {entry.amount?.toLocaleString()}
              </Text>
            </View>
            {dateLabel ? <Text style={{ fontSize: font.tiny, color: colors.textMuted }}>{dateLabel}</Text> : null}
          </View>
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
  lpoHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  stationBadge: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  miniLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 1 },
  litersWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  idRow: { flexDirection: 'row' },
  idTile: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  idLabel: { fontSize: 11, fontWeight: '700', marginLeft: 4 },
  lpoFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth },
  noteBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
});
