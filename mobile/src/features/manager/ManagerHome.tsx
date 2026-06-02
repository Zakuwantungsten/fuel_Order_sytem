import React, { useEffect, useMemo, useState } from 'react';
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
import { getStationCurrencyMap, getSuperManagerStations } from '../../api/config';
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
import { Card, Chip, EmptyState, Loading, Tag } from '../../components/ui';
import { LpoDetailsSheet } from '../../components/LpoDetailsSheet';
import { useTheme } from '../../theme';

const PAGE_SIZE = 30;

export default function ManagerHome() {
  const { user } = useAuth();
  const { colors, spacing, radius, font, weight } = useTheme();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [station, setStation] = useState<string>('all');
  const [sort, setSort] = useState<LpoSortKey>('newest');
  const [sortOpen, setSortOpen] = useState(false);
  const [selected, setSelected] = useState<LpoEntry | null>(null);

  // Station → currency (so totals show the station's real currency, not a default).
  const { data: currencyMap } = useQuery({
    queryKey: ['station-currencies'],
    queryFn: getStationCurrencyMap,
    staleTime: 10 * 60_000,
  });
  const symbolFor = (st: string) => currencySymbol(currencyForStation(st, currencyMap));

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const superMgr = isSuperManager(user);

  const { data: configuredStations } = useQuery({
    queryKey: ['sm-stations', user?.role],
    queryFn: getSuperManagerStations,
    enabled: superMgr,
  });

  const stations = useMemo(() => availableStations(user, configuredStations), [user, configuredStations]);
  const stationLabel = superMgr ? (station === 'all' ? 'All stations' : station) : stations[0] ?? 'Your station';
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? 'Newest';

  const query = useInfiniteQuery<LpoPage>({
    queryKey: ['manager-lpos', user?.role, user?.station, user?.username, station, search, sort, stations.join(',')],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getManagerLpoPage(user, {
        page: pageParam as number,
        limit: PAGE_SIZE,
        search,
        sort,
        station: superMgr ? station : undefined,
        allowedStations: superMgr ? stations : undefined,
      }),
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });

  const entries = useMemo(() => query.data?.pages.flatMap((p) => p.entries) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="FuelOrder" subtitle={stationLabel} badge={superMgr ? 'Super Manager' : 'Manager'} />

      {/* Search */}
      <View
        style={[
          styles.searchWrap,
          { backgroundColor: colors.surface, borderColor: colors.border, marginHorizontal: spacing.md, marginTop: spacing.md, borderRadius: radius.md },
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

      {/* Station picker (super manager) */}
      {superMgr && stations.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm, paddingHorizontal: spacing.md, flexGrow: 0 }}>
          <Chip label="All" active={station === 'all'} onPress={() => setStation('all')} />
          {stations.map((s) => (
            <Chip key={s} label={s.replace('LAKE ', '')} active={station === s} onPress={() => setStation(s)} />
          ))}
        </ScrollView>
      ) : null}

      {/* Count + sort */}
      <View style={[styles.controls, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ color: colors.textMuted, fontSize: font.small, fontWeight: weight.semibold }}>
            {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
          </Text>
          {query.isFetching && !query.isRefetching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </View>

        <Pressable
          onPress={() => setSortOpen(true)}
          style={({ pressed }) => [
            styles.sortBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="swap-vertical" size={15} color={colors.textMuted} />
          <Text style={{ color: colors.text, fontSize: font.small, fontWeight: weight.semibold, marginHorizontal: 4 }}>{sortLabel}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      {query.isLoading ? (
        <Loading label="Loading LPOs…" />
      ) : query.isError ? (
        <View style={{ padding: spacing.md }}>
          <Card>
            <EmptyState icon="cloud-offline-outline" title="Couldn't load LPOs" subtitle={getApiErrorMessage(query.error, 'Pull down to retry.')} />
          </Card>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <LpoRow entry={item} />}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xl }}
          onRefresh={query.refetch}
          refreshing={query.isRefetching}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
          }}
          ListEmptyComponent={<Card><EmptyState icon="receipt-outline" title="No LPO entries found" /></Card>}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} /> : null}
        />
      )}

      {/* Sort dropdown */}
      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={[styles.sortScrim, { backgroundColor: colors.scrim }]} onPress={() => setSortOpen(false)}>
          <Pressable style={[styles.sortMenu, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            {SORT_OPTIONS.map((o) => {
              const active = o.key === sort;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => {
                    setSort(o.key);
                    setSortOpen(false);
                  }}
                  style={({ pressed }) => [styles.sortItem, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
                >
                  <Text style={{ color: active ? colors.primary : colors.text, fontSize: font.body, fontWeight: active ? weight.bold : weight.regular }}>
                    {o.label}
                  </Text>
                  {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : <View />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* LPO details */}
      {selected ? (
        <LpoDetailsSheet
          item={{
            lpoNo: selected.lpoNo,
            dateLabel: selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : selected.date,
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
            amendedAtLabel: selected.amendedAt ? new Date(selected.amendedAt).toLocaleDateString() : undefined,
          }}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </View>
  );

  function LpoRow({ entry }: { entry: LpoEntry }) {
    const cancelled = entry.isCancelled;
    const amended = !cancelled && !!entry.amendedAt;
    const accent = cancelled
      ? colors.danger
      : entry.isDriverAccount
      ? colors.warning
      : entry.isRefer
      ? colors.info
      : colors.primary;
    const dim = cancelled ? 0.55 : 1;
    const sym = symbolFor(entry.station);

    return (
      <Pressable onPress={() => setSelected(entry)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Card accent={accent} style={styles.row}>
          {/* Top: truck + tags | total */}
          <View style={styles.rowTop}>
            <View style={{ flex: 1, opacity: dim }}>
              <View style={styles.truckLine}>
                <Text style={{ fontSize: font.body, fontWeight: weight.bold, color: cancelled ? colors.textMuted : colors.text }} numberOfLines={1}>
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

            <View style={{ alignItems: 'flex-end', opacity: dim }}>
              <Text style={{ fontSize: font.tiny, color: colors.textMuted, fontWeight: weight.semibold }}>TOTAL</Text>
              <Text
                style={{
                  fontSize: font.h3,
                  fontWeight: weight.heavy,
                  color: cancelled ? colors.textMuted : colors.text,
                  textDecorationLine: cancelled ? 'line-through' : 'none',
                }}
              >
                {sym} {entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>

          {/* Bottom: quantity | rate */}
          <View style={[styles.rowBottom, { borderTopColor: colors.border, opacity: dim }]}>
            <View>
              <Text style={styles.metaLabel}>QUANTITY</Text>
              <Text style={{ fontSize: font.body, fontWeight: weight.semibold, color: cancelled ? colors.textMuted : colors.text }}>
                {entry.liters.toLocaleString()} L
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.metaLabel}>RATE</Text>
              <Text style={{ fontSize: font.body, fontWeight: weight.semibold, color: cancelled ? colors.textMuted : colors.text }}>
                {sym} {entry.rate} / L
              </Text>
            </View>
          </View>

          {/* LPO + station + created (small footer) */}
          <View style={[styles.footer, { opacity: dim }]}>
            <Text style={styles.footerText} numberOfLines={1}>
              LPO {entry.lpoNo}{superMgr ? ` • ${entry.station}` : ''}
            </Text>
            <Text style={styles.footerText}>{entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : entry.date}</Text>
          </View>
        </Card>
      </Pressable>
    );
  }

}

const styles = StyleSheet.create({
  searchWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 9 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  row: { marginBottom: 8, paddingVertical: 10, paddingHorizontal: 12 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  truckLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 8 },
  metaLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: '#94a3b8' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  footerText: { fontSize: 11, color: '#94a3b8' },
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
  sortItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 },
});

