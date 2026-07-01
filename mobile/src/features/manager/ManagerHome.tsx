import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { getApiErrorMessage } from '../../api/client';
import { getStationCurrencyMap, getSuperManagerAccess, getLpoFilterStations } from '../../api/config';
import {
  LpoEntry,
  LpoPage,
  LpoSortKey,
  SORT_OPTIONS,
  availableStations,
  currencyForStation,
  currencySymbol,
  getManagerLpoPage,
  isSuperManager,
} from '../../api/manager';
import { AppHeader } from '../../components/AppHeader';
import { Card, EmptyState, Loading, Tag } from '../../components/ui';
import { LpoDetailsSheet } from '../../components/LpoDetailsSheet';
import { useTheme } from '../../theme';

const PAGE_SIZE = 30;

/** Strip station prefixes for compact labels. */
function shortName(s: string) {
  return s.replace(/^LAKE\s+/i, '').replace(/^GBP\s+/i, '').replace(/^GPB\s+/i, '');
}

export default function ManagerHome() {
  const { user } = useAuth();
  const { colors, spacing, radius, font, weight } = useTheme();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // Multi-select: empty = all allowed stations
  const [selectedStations, setSelectedStations] = useState<string[]>([]);
  const [customZambiaOnly, setCustomZambiaOnly] = useState(false);
  const [stationPickerOpen, setStationPickerOpen] = useState(false);
  const [sort, setSort] = useState<LpoSortKey>('newest');
  const [sortOpen, setSortOpen] = useState(false);
  const [selected, setSelected] = useState<LpoEntry | null>(null);
  const [newEntriesAvailable, setNewEntriesAvailable] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const lastKnownFirstId = useRef<string | undefined>(undefined);
  const prevUpdateSignalRef = useRef<number | undefined>(undefined);

  const { data: currencyMap } = useQuery({
    queryKey: ['station-currencies'],
    queryFn: getStationCurrencyMap,
    staleTime: 10 * 60_000,
  });

  // Watches for real-time LPO change signals from RealtimeProvider without
  // triggering an automatic re-fetch. Chip is shown; user taps to refresh.
  const { data: lpoUpdateSignal } = useQuery<number>({
    queryKey: ['lpo-update-signal'],
    queryFn: () => 0,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const symbolFor = (st: string) => currencySymbol(currencyForStation(st, currencyMap));

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const superMgr = isSuperManager(user);

  const { data: smAccess } = useQuery({
    queryKey: ['sm-access', user?.role],
    queryFn: getSuperManagerAccess,
    enabled: superMgr,
  });

  const { data: configuredStations } = useQuery({
    queryKey: ['sm-stations', user?.role],
    queryFn: async () => (await getSuperManagerAccess()).configuredStations,
    enabled: superMgr,
  });

  const { data: filterStations } = useQuery({
    queryKey: ['lpo-filter-stations', user?.role],
    queryFn: getLpoFilterStations,
    enabled: superMgr,
    staleTime: 60_000,
  });

  const regularStations = useMemo(() => {
    const base = availableStations(user, configuredStations);
    const fromApi = filterStations?.regularStations ?? [];
    return Array.from(new Set([...base, ...fromApi])).sort();
  }, [user, configuredStations, filterStations?.regularStations]);

  const customStations = useMemo(() => {
    if (!filterStations?.customZambiaEnabled) return [];
    return filterStations.customStations ?? [];
  }, [filterStations]);

  const showCustomSection = customStations.length > 0 || smAccess?.customZambiaEnabled;

  const stations = regularStations;

  const stationLabel = useMemo(() => {
    if (!superMgr) return stations[0] ?? 'Your station';
    if (customZambiaOnly && selectedStations.length === 0) return 'Custom Zambia';
    if (selectedStations.length === 0) return 'All stations';
    if (selectedStations.length === 1) return shortName(selectedStations[0]);
    return `${selectedStations.length} stations`;
  }, [superMgr, stations, selectedStations, customZambiaOnly]);

  const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? 'Newest';

  const query = useInfiniteQuery<LpoPage>({
    queryKey: [
      'manager-lpos',
      user?.role,
      user?.station,
      user?.username,
      selectedStations.join(','),
      customZambiaOnly,
      search,
      sort,
      regularStations.join(','),
      customStations.join(','),
    ],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getManagerLpoPage(user, {
        page: pageParam as number,
        limit: PAGE_SIZE,
        search,
        sort,
        selectedStations: superMgr ? selectedStations : undefined,
        allowedStations: superMgr ? regularStations : undefined,
        customZambiaOnly: superMgr ? customZambiaOnly : undefined,
      }),
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    refetchInterval: 60_000, // Fallback polling — socket invalidation handles real-time
  });

  const entries = useMemo(() => query.data?.pages.flatMap((p) => p.entries) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;

  // Reset the "new entries" signal whenever the sort changes so we don't show a
  // stale chip after switching from a different sort back to newest.
  useEffect(() => {
    setNewEntriesAvailable(false);
    lastKnownFirstId.current = undefined;
  }, [sort]);

  // Show chip when RealtimeProvider increments the lpo-update-signal — without
  // triggering a background re-fetch. User taps chip to fetch on their own terms.
  useEffect(() => {
    if (lpoUpdateSignal === undefined || lpoUpdateSignal === 0) return;
    if (prevUpdateSignalRef.current === undefined) {
      prevUpdateSignalRef.current = lpoUpdateSignal;
      return;
    }
    if (lpoUpdateSignal !== prevUpdateSignalRef.current) {
      prevUpdateSignalRef.current = lpoUpdateSignal;
      setNewEntriesAvailable(true);
    }
  }, [lpoUpdateSignal]);

  // Detect when a new entry appears at position 0 while sorted by newest.
  // The sort effect above runs first (same render), so lastKnownFirstId is
  // already cleared on sort changes and won't produce a false positive.
  useEffect(() => {
    const currentFirstId = entries[0]?.id;
    if (!currentFirstId) return;
    if (
      sort === 'newest' &&
      lastKnownFirstId.current !== undefined &&
      lastKnownFirstId.current !== currentFirstId
    ) {
      setNewEntriesAvailable(true);
    }
    lastKnownFirstId.current = currentFirstId;
  }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle a station in/out of the selection
  function toggleStation(s: string) {
    setCustomZambiaOnly(false);
    setSelectedStations((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function toggleCustomZambiaAll() {
    setCustomZambiaOnly((prev) => !prev);
    setSelectedStations([]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="limka" subtitle={stationLabel} badge={superMgr ? 'Super Manager' : 'Manager'} />

      {/* Search */}
      <View
        style={[
          styles.searchWrap,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            marginHorizontal: spacing.md,
            marginTop: spacing.md,
            borderRadius: radius.md,
          },
        ]}
      >
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={{ flex: 1, marginLeft: spacing.sm, fontSize: font.body, color: colors.text }}
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search LPO, truck, DO, station…"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchInput ? (
          <Ionicons name="close-circle" size={18} color={colors.textMuted} onPress={() => setSearchInput('')} />
        ) : null}
      </View>

      {/* Station filter button (super manager only) */}
      {superMgr && (stations.length > 0 || showCustomSection) ? (
        <Pressable
          onPress={() => setStationPickerOpen(true)}
          style={({ pressed }) => [
            styles.stationFilterBtn,
            {
              backgroundColor: colors.surface,
              borderColor: selectedStations.length > 0 || customZambiaOnly ? colors.primary : colors.border,
              marginHorizontal: spacing.md,
              marginTop: spacing.sm,
              borderRadius: radius.md,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Ionicons
            name="business-outline"
            size={16}
            color={selectedStations.length > 0 || customZambiaOnly ? colors.primary : colors.textMuted}
          />
          <Text
            style={{
              flex: 1,
              marginLeft: spacing.sm,
              fontSize: font.body,
              color: selectedStations.length > 0 || customZambiaOnly ? colors.primary : colors.text,
              fontWeight: selectedStations.length > 0 || customZambiaOnly ? weight.semibold : weight.regular,
            }}
            numberOfLines={1}
          >
            {stationLabel}
          </Text>
          {(selectedStations.length > 0 || customZambiaOnly) ? (
            <View style={[styles.filterBadge, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.onPrimary, fontSize: font.tiny, fontWeight: weight.bold }}>
                {customZambiaOnly ? 'C' : selectedStations.length}
              </Text>
            </View>
          ) : null}
          <Ionicons name="chevron-down" size={15} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {/* Count + sort */}
      <View style={[styles.controls, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ color: colors.textMuted, fontSize: font.small, fontWeight: weight.semibold }}>
            {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
          </Text>
          {query.isFetching && !query.isRefetching ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : null}
        </View>

        <Pressable
          onPress={() => setSortOpen(true)}
          style={({ pressed }) => [
            styles.sortBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="swap-vertical" size={15} color={colors.textMuted} />
          <Text style={{ color: colors.text, fontSize: font.small, fontWeight: weight.semibold, marginHorizontal: 4 }}>
            {sortLabel}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      {query.isLoading ? (
        <Loading label="Loading LPOs…" />
      ) : query.isError ? (
        <View style={{ padding: spacing.md }}>
          <Card>
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load LPOs"
              subtitle={getApiErrorMessage(query.error, 'Pull down to retry.')}
            />
          </Card>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={entries}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <LpoRow entry={item} />}
            contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xl }}
            onRefresh={() => {
              setNewEntriesAvailable(false);
              lastKnownFirstId.current = undefined;
              query.refetch();
            }}
            refreshing={query.isRefetching}
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
            }}
          ListEmptyComponent={
            <Card>
              <EmptyState icon="receipt-outline" title="No LPO entries found" />
            </Card>
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} />
            ) : null
          }
        />
        {newEntriesAvailable ? (
          <Pressable
            onPress={() => {
              flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
              setNewEntriesAvailable(false);
              query.refetch();
            }}
            style={[styles.newEntriesChip, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="arrow-up" size={14} color={colors.onPrimary} />
            <Text style={{ color: colors.onPrimary, fontSize: font.small, fontWeight: weight.bold, marginLeft: 5 }}>
              New entries
            </Text>
          </Pressable>
        ) : null}
        </View>
      )}

      {/* ── Station picker bottom sheet ─────────────────────────────────── */}
      <Modal
        visible={stationPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setStationPickerOpen(false)}
      >
        <Pressable
          style={[styles.sheetScrim, { backgroundColor: colors.scrim }]}
          onPress={() => setStationPickerOpen(false)}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Sheet header */}
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: font.h3, fontWeight: weight.bold }}>
                Filter Stations
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable
                  onPress={() => { setSelectedStations([...stations, ...customStations]); setCustomZambiaOnly(false); }}
                  hitSlop={8}
                >
                  <Text style={{ color: colors.primary, fontSize: font.small, fontWeight: weight.semibold }}>
                    All
                  </Text>
                </Pressable>
                <Text style={{ color: colors.border, fontSize: font.body }}>|</Text>
                <Pressable
                  onPress={() => { setSelectedStations([]); setCustomZambiaOnly(false); }}
                  hitSlop={8}
                >
                  <Text style={{ color: colors.textMuted, fontSize: font.small, fontWeight: weight.semibold }}>
                    None
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Station list */}
            <ScrollView bounces={false}>
              {stations.map((s) => {
                const checked = selectedStations.includes(s);
                return (
                  <Pressable
                    key={s}
                    onPress={() => toggleStation(s)}
                    style={({ pressed }) => [
                      styles.stationRow,
                      {
                        backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: checked ? colors.primary : colors.border,
                          backgroundColor: checked ? colors.primary : 'transparent',
                        },
                      ]}
                    >
                      {checked ? (
                        <Ionicons name="checkmark" size={13} color={colors.onPrimary} />
                      ) : null}
                    </View>

                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text
                        style={{
                          color: checked ? colors.primary : colors.text,
                          fontSize: font.body,
                          fontWeight: checked ? weight.bold : weight.semibold,
                        }}
                      >
                        {shortName(s)}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: font.small, marginTop: 1 }}>
                        {s}
                      </Text>
                    </View>

                    {checked ? (
                      <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                    ) : (
                      <View style={{ width: 20 }} />
                    )}
                  </Pressable>
                );
              })}

              {showCustomSection ? (
                <>
                  <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
                    <Text style={{ color: colors.textMuted, fontSize: font.small, fontWeight: weight.bold }}>
                      CUSTOM (ZAMBIA)
                    </Text>
                  </View>

                  {smAccess?.customZambiaEnabled ? (
                    <Pressable
                      onPress={toggleCustomZambiaAll}
                      style={({ pressed }) => [
                        styles.stationRow,
                        {
                          backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                          borderBottomColor: colors.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          {
                            borderColor: customZambiaOnly ? colors.primary : colors.border,
                            backgroundColor: customZambiaOnly ? colors.primary : 'transparent',
                          },
                        ]}
                      >
                        {customZambiaOnly ? (
                          <Ionicons name="checkmark" size={13} color={colors.onPrimary} />
                        ) : null}
                      </View>
                      <View style={{ flex: 1, marginLeft: spacing.sm }}>
                        <Text
                          style={{
                            color: customZambiaOnly ? colors.primary : colors.text,
                            fontSize: font.body,
                            fontWeight: customZambiaOnly ? weight.bold : weight.semibold,
                          }}
                        >
                          All custom stations
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: font.small, marginTop: 1 }}>
                          Unlisted Zambia stations
                        </Text>
                      </View>
                    </Pressable>
                  ) : null}

                  {customStations.map((s) => {
                    const checked = selectedStations.includes(s);
                    return (
                      <Pressable
                        key={`custom-${s}`}
                        onPress={() => toggleStation(s)}
                        style={({ pressed }) => [
                          styles.stationRow,
                          {
                            backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                            borderBottomColor: colors.border,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            {
                              borderColor: checked ? colors.primary : colors.border,
                              backgroundColor: checked ? colors.primary : 'transparent',
                            },
                          ]}
                        >
                          {checked ? (
                            <Ionicons name="checkmark" size={13} color={colors.onPrimary} />
                          ) : null}
                        </View>
                        <View style={{ flex: 1, marginLeft: spacing.sm }}>
                          <Text
                            style={{
                              color: checked ? colors.primary : colors.text,
                              fontSize: font.body,
                              fontWeight: checked ? weight.bold : weight.semibold,
                            }}
                          >
                            {shortName(s)}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: font.small, marginTop: 1 }}>
                            {s}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              ) : null}
            </ScrollView>

            {/* Apply / close button */}
            <Pressable
              onPress={() => setStationPickerOpen(false)}
              style={({ pressed }) => [
                styles.applyBtn,
                { backgroundColor: colors.primary, margin: spacing.md, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={{ color: colors.onPrimary, fontSize: font.body, fontWeight: weight.bold }}>
                {customZambiaOnly
                  ? 'Show custom Zambia'
                  : selectedStations.length === 0
                  ? 'Show All Stations'
                  : `Show ${selectedStations.length} Station${selectedStations.length !== 1 ? 's' : ''}`}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Sort dropdown ──────────────────────────────────────────────── */}
      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={[styles.sortScrim, { backgroundColor: colors.scrim }]} onPress={() => setSortOpen(false)}>
          <Pressable
            style={[styles.sortMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            {SORT_OPTIONS.map((o) => {
              const active = o.key === sort;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => {
                    setSort(o.key);
                    setSortOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.sortItem,
                    { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? colors.primary : colors.text,
                      fontSize: font.body,
                      fontWeight: active ? weight.bold : weight.regular,
                    }}
                  >
                    {o.label}
                  </Text>
                  {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : <View />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── LPO details sheet ──────────────────────────────────────────── */}
      {selected ? (
        <LpoDetailsSheet
          item={{
            lpoNo: selected.lpoNo,
            dateLabel: selected.createdAt
              ? new Date(selected.createdAt).toLocaleDateString()
              : selected.date,
            truckNo: selected.truckNo,
            doNo: selected.doNo,
            station: selected.station,
            destination: selected.destination,
            liters: selected.liters,
            rate: selected.rate,
            amount: selected.amount,
            symbol: symbolFor(selected.station),
            isCancelled: selected.isCancelled,
            isDriverAccount: selected.isDriverAccount,
            isRefer: selected.isRefer,
            amended: !!selected.amendedAt,
            originalLiters: selected.originalLiters,
            amendedAtLabel: selected.amendedAt
              ? new Date(selected.amendedAt).toLocaleDateString()
              : undefined,
          }}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </View>
  );

  function LpoRow({ entry }: { entry: LpoEntry }) {
    const cancelled = entry.isCancelled;
    const amended = !cancelled && !!entry.amendedAt;
    const dim = cancelled ? 0.55 : 1;
    const sym = symbolFor(entry.station);
    const stationColor = cancelled ? colors.textMuted : colors.primary;
    const dateLabel = entry.date
      ? new Date(entry.date).toLocaleDateString()
      : entry.createdAt
      ? new Date(entry.createdAt).toLocaleDateString()
      : '';

    return (
      <Pressable onPress={() => setSelected(entry)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Card style={styles.row}>
          {/* Identity row */}
          <View style={styles.idRow}>
            <View style={styles.idLeft}>
              <Ionicons name="business" size={15} color={stationColor} />
              <Text
                style={{
                  fontSize: font.body,
                  fontWeight: weight.heavy,
                  color: stationColor,
                  marginLeft: 5,
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                {entry.station}
              </Text>
            </View>
            <View style={[styles.lpoPill, { backgroundColor: colors.primaryMuted }]}>
              <Text
                style={{
                  fontSize: font.small,
                  fontWeight: weight.bold,
                  color: cancelled ? colors.textMuted : colors.primary,
                }}
                numberOfLines={1}
              >
                LPO {entry.lpoNo}
              </Text>
            </View>
          </View>

          {/* Truck + tags | total */}
          <View style={[styles.rowTop, { opacity: dim }]}>
            <View style={{ flex: 1 }}>
              <View style={styles.truckLine}>
                <Text
                  style={{
                    fontSize: font.body,
                    fontWeight: weight.bold,
                    color: cancelled ? colors.textMuted : colors.text,
                  }}
                  numberOfLines={1}
                >
                  {entry.truckNo}
                </Text>
                {cancelled ? <Tag label="CANCELLED" color={colors.textMuted} /> : null}
                {amended ? <Tag label="AMENDED" color={colors.warning} /> : null}
                {entry.isDriverAccount && !cancelled ? <Tag label="DRIVER A/C" color={colors.warning} /> : null}
                {entry.isRefer && !cancelled ? <Tag label="REFER" color={colors.info} /> : null}
              </View>
              <Text style={{ fontSize: font.small, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                DO #{entry.doNo} • {entry.destination}
              </Text>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: font.tiny, color: colors.textMuted, fontWeight: weight.semibold }}>
                TOTAL
              </Text>
              <Text
                style={{
                  fontSize: font.h3,
                  fontWeight: weight.heavy,
                  color: cancelled ? colors.textMuted : colors.text,
                  textDecorationLine: cancelled ? 'line-through' : 'none',
                }}
              >
                {sym}{' '}
                {entry.amount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
          </View>

          {/* Quantity | Rate */}
          <View style={[styles.rowBottom, { borderTopColor: colors.border, opacity: dim }]}>
            <View>
              <Text style={styles.metaLabel}>QUANTITY</Text>
              <Text
                style={{
                  fontSize: font.body,
                  fontWeight: weight.bold,
                  color: cancelled ? colors.textMuted : colors.text,
                }}
              >
                {entry.liters.toLocaleString()} L
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.metaLabel}>RATE</Text>
              <Text
                style={{
                  fontSize: font.body,
                  fontWeight: weight.semibold,
                  color: cancelled ? colors.textMuted : colors.text,
                }}
              >
                {sym} {entry.rate} / L
              </Text>
            </View>
          </View>

          {/* Date footer */}
          <View style={[styles.footer, { opacity: dim }]}>
            <Ionicons name="time-outline" size={12} color={colors.textMuted} />
            <Text style={[styles.footerText, { marginLeft: 4 }]}>{dateLabel}</Text>
          </View>
        </Card>
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  stationFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginRight: 6,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  row: { marginBottom: 8, paddingVertical: 10, paddingHorizontal: 12 },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  idLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  lpoPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, flexShrink: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  truckLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 8,
  },
  metaLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: '#94a3b8' },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  footerText: { fontSize: 11, color: '#94a3b8' },
  // Station picker bottom sheet
  sheetScrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '72%',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  applyBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  newEntriesChip: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  // Sort dropdown
  sortScrim: { flex: 1 },
  sortMenu: {
    position: 'absolute',
    right: 16,
    top: 150,
    width: 180,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  sortItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
});
