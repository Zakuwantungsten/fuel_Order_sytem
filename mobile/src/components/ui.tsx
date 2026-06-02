import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/* ── Layout ─────────────────────────────────────────────────────────────── */

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>{children}</View>;
}

export function Card({
  children,
  style,
  accent,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          ...(accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ── Typography ─────────────────────────────────────────────────────────── */

function useTextStyles() {
  const { colors, font, weight } = useTheme();
  return { colors, font, weight };
}

export function Display({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const { colors, font, weight } = useTextStyles();
  return <Text style={[{ fontSize: font.display, fontWeight: weight.heavy, color: colors.text }, style]}>{children}</Text>;
}
export function H1({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const { colors, font, weight } = useTextStyles();
  return <Text style={[{ fontSize: font.h1, fontWeight: weight.heavy, color: colors.text }, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const { colors, font, weight } = useTextStyles();
  return <Text style={[{ fontSize: font.h2, fontWeight: weight.bold, color: colors.text }, style]}>{children}</Text>;
}
export function H3({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const { colors, font, weight } = useTextStyles();
  return <Text style={[{ fontSize: font.h3, fontWeight: weight.semibold, color: colors.text }, style]}>{children}</Text>;
}
export function Body({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const { colors, font } = useTextStyles();
  return <Text style={[{ fontSize: font.body, color: colors.text }, style]}>{children}</Text>;
}
export function Muted({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const { colors, font } = useTextStyles();
  return <Text style={[{ fontSize: font.small, color: colors.textMuted }, style]}>{children}</Text>;
}

/* ── Badges / Tags ──────────────────────────────────────────────────────── */

export function Tag({ label, color, bg }: { label: string; color: string; bg?: string }) {
  const { radius, spacing, font, weight } = useTheme();
  return (
    <View
      style={{
        backgroundColor: bg ?? color,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radius.sm,
      }}
    >
      <Text style={{ color: bg ? color : '#fff', fontSize: font.tiny, fontWeight: weight.bold }}>{label}</Text>
    </View>
  );
}

/* ── Stat tile ──────────────────────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: string;
  icon?: IoniconName;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const { colors, radius, spacing, font, weight } = useTheme();
  const toneColor = colors[tone];
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }}
    >
      {icon ? <Ionicons name={icon} size={18} color={toneColor} style={{ marginBottom: 4 }} /> : null}
      <Text style={{ color: colors.textMuted, fontSize: font.small }}>{label}</Text>
      <Text style={{ color: toneColor, fontSize: font.h3, fontWeight: weight.heavy, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

/* ── Chip ───────────────────────────────────────────────────────────────── */

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, radius, spacing, font, weight } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: active ? colors.primary : colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? colors.primary : colors.border,
        marginRight: spacing.sm,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: active ? colors.onPrimary : colors.text, fontSize: font.small, fontWeight: weight.semibold }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ── Section header ─────────────────────────────────────────────────────── */

export function SectionHeader({ title, count }: { title: string; count?: number }) {
  const { colors, spacing, radius, font, weight } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm }}>
      <H2>{title}</H2>
      {count !== undefined ? (
        <View style={{ backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
          <Text style={{ color: colors.onPrimary, fontWeight: weight.bold, fontSize: font.small }}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ── States ─────────────────────────────────────────────────────────────── */

export function Loading({ label }: { label?: string }) {
  const { colors, spacing, font } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={{ color: colors.textMuted, fontSize: font.body, marginTop: spacing.sm }}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, subtitle }: { icon?: IoniconName; title: string; subtitle?: string }) {
  const { colors, spacing, font, weight } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
      <Ionicons name={icon} size={44} color={colors.textMuted} />
      <Text style={{ color: colors.text, fontWeight: weight.semibold, fontSize: font.body, marginTop: spacing.sm }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: colors.textMuted, fontSize: font.small, marginTop: 4, textAlign: 'center' }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

/* ── Icon button (44pt target) ──────────────────────────────────────────── */

export function IconButton({
  icon,
  onPress,
  color,
  accessibilityLabel,
}: {
  icon: IoniconName;
  onPress: () => void;
  color?: string;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 22,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={24} color={color} />
    </Pressable>
  );
}
