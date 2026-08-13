import React, {useMemo} from 'react';
import {View, Text, StyleSheet, Switch} from 'react-native';
import {ColorPalette, spacing, radius} from '../../../shared/theme';

type Props = {
  colors: ColorPalette;
  title: string;
  description: string;
  dataStays: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
  locked?: boolean;
  lockReason?: string;
};

export function AutomationConsentCard({
  colors,
  title,
  description,
  dataStays,
  enabled,
  onToggle,
  disabled = false,
  locked = false,
  lockReason,
}: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          disabled={disabled || locked}
        />
      </View>
      <Text style={styles.body}>{description}</Text>
      <Text style={styles.meta}>Data stays: {dataStays}</Text>
      {locked && lockReason ? <Text style={styles.lock}>{lockReason}</Text> : null}
    </View>
  );
}

export function AutomationStatusRow({
  colors,
  label,
  value,
}: {
  colors: ColorPalette;
  label: string;
  value: string;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    head: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
    title: {fontSize: 16, fontWeight: '800', color: colors.textPrimary, flex: 1, marginRight: 8},
    body: {fontSize: 13, color: colors.textBody, marginTop: spacing.sm, lineHeight: 20},
    meta: {fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, fontStyle: 'italic'},
    lock: {fontSize: 12, color: colors.amber, marginTop: spacing.sm, fontWeight: '600'},
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    rowLabel: {color: colors.textMuted, fontSize: 13},
    rowValue: {color: colors.textPrimary, fontWeight: '700', fontSize: 13},
  });
}
