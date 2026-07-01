import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { Tag } from './ui';

/** Normalised data the LPO details sheet renders (role-agnostic). */
export interface LpoDetailsItem {
  lpoNo?: string;
  dateLabel?: string;
  truckNo?: string;
  doNo: string;
  station: string;
  destination: string;
  liters: number;
  rate: number;
  amount: number;
  /** Pre-resolved currency symbol, e.g. "$" or "TSh". */
  symbol: string;
  isCancelled?: boolean;
  isDriverAccount?: boolean;
  isRefer?: boolean;
  amended?: boolean;
  originalLiters?: number | null;
  amendedAtLabel?: string;
  cancellationReason?: string;
}

/**
 * Bottom-sheet LPO details, shared by the Manager and Driver dashboards so the
 * presentation stays identical. Read-only.
 */
export function LpoDetailsSheet({ item, onClose }: { item: LpoDetailsItem; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const Field = ({ label, value }: { label: string; value: string }) => (
    <View style={[styles.fieldBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable style={styles.scrimFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.head}>
            <Text style={[styles.headTitle, { color: colors.text }]}>LPO Details</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <ScrollView contentContainerStyle={{ padding: spacing.md }}>
            <View style={styles.lpoRow}>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>LPO Number</Text>
                <Text style={[styles.lpoNumber, { color: colors.primary }]}>{item.lpoNo || 'N/A'}</Text>
              </View>
              {item.dateLabel ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Date</Text>
                  <Text style={[styles.dateValue, { color: colors.text }]}>{item.dateLabel}</Text>
                </View>
              ) : null}
            </View>

            {(item.isCancelled || item.amended || item.isDriverAccount || item.isRefer) ? (
              <View style={styles.tagRow}>
                {item.isCancelled ? <Tag label="CANCELLED" color={colors.danger} bg={colors.dangerMuted} /> : null}
                {item.amended && !item.isCancelled ? <Tag label="AMENDED" color={colors.warning} /> : null}
                {item.isDriverAccount ? <Tag label="DRIVER A/C" color={colors.warning} /> : null}
                {item.isRefer ? <Tag label="REFER" color={colors.info} /> : null}
              </View>
            ) : null}

            <View style={styles.grid}>
              <Field label="Truck No." value={item.truckNo || 'N/A'} />
              <Field label="DO / SDI" value={item.doNo} />
            </View>
            <View style={styles.grid}>
              <Field label="Station" value={item.station} />
              <Field label="Destination" value={item.destination} />
            </View>

            <View style={[styles.amountBox, { backgroundColor: colors.successMuted, borderColor: colors.success }]}>
              <View style={styles.amountTopRow}>
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.success }]}>Liters</Text>
                  <Text style={[styles.litersValue, { color: colors.success }]}>{item.liters.toLocaleString()}L</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.fieldLabel, { color: colors.success }]}>Rate per Ltr</Text>
                  <Text style={[styles.rateValue, { color: colors.success }]}>{item.rate}</Text>
                </View>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.success, opacity: 0.3, marginVertical: spacing.sm }]} />
              <Text style={[styles.fieldLabel, { color: colors.success }]}>Total Amount</Text>
              <Text style={[styles.totalValue, { color: colors.success }]}>
                {item.symbol} {money(item.amount)}
              </Text>
            </View>

            {item.amended && item.originalLiters != null ? (
              <View style={[styles.noteBox, { backgroundColor: colors.warningMuted }]}>
                <Ionicons name="create-outline" size={16} color={colors.warning} />
                <Text style={{ color: colors.warning, fontSize: 13, marginLeft: 6, flex: 1 }}>
                  Amended from {item.originalLiters.toLocaleString()}L to {item.liters.toLocaleString()}L
                  {item.amendedAtLabel ? ` on ${item.amendedAtLabel}` : ''}
                </Text>
              </View>
            ) : null}

            {item.isCancelled ? (
              <View style={[styles.noteBox, { backgroundColor: colors.dangerMuted }]}>
                <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 13, marginLeft: 6, flex: 1 }}>
                  {item.cancellationReason || 'This entry was cancelled.'}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  scrimFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headTitle: { fontSize: 20, fontWeight: '800' },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth },
  lpoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  lpoNumber: { fontSize: 34, fontWeight: '900', marginTop: 2 },
  dateValue: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  grid: { flexDirection: 'row', gap: 10, marginTop: 12 },
  fieldBox: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  fieldValue: { fontSize: 16, fontWeight: '700', marginTop: 3 },
  amountBox: { marginTop: 16, borderWidth: 1, borderRadius: 14, padding: 14 },
  amountTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  litersValue: { fontSize: 26, fontWeight: '900', marginTop: 2 },
  rateValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  totalValue: { fontSize: 26, fontWeight: '900', marginTop: 2 },
  noteBox: { flexDirection: 'row', alignItems: 'center', marginTop: 12, borderRadius: 10, padding: 12 },
});

export default LpoDetailsSheet;
