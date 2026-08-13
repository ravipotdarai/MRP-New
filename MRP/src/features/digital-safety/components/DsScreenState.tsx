import React, {useMemo} from 'react';
import {View, Text, StyleSheet, ActivityIndicator, TouchableOpacity} from 'react-native';
import {ColorPalette, spacing, brandColors} from '../../../shared/theme';

/** Shared loading / empty / error presentation for Digital Safety screens. */
export function DsScreenState({
  colors,
  loading,
  error,
  empty,
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  onRetry,
  children,
}: {
  colors: ColorPalette;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  onRetry?: () => void;
  children?: React.ReactNode;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={brandColors.googleBlue} />
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.box}>
        <Text style={styles.title}>Couldn’t load</Text>
        <Text style={styles.body}>{error}</Text>
        {onRetry ? (
          <TouchableOpacity style={styles.btn} onPress={onRetry}>
            <Text style={styles.btnText}>Try again</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (empty) {
    return (
      <View style={styles.box}>
        <Text style={styles.title}>{emptyTitle}</Text>
        {emptyMessage ? <Text style={styles.body}>{emptyMessage}</Text> : null}
        {onRetry ? (
          <TouchableOpacity style={styles.btn} onPress={onRetry}>
            <Text style={styles.btnText}>Refresh</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return <>{children}</>;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    center: {alignItems: 'center', paddingVertical: spacing.xl},
    muted: {marginTop: spacing.sm, color: colors.textMuted, fontSize: 13},
    box: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: spacing.lg,
      marginVertical: spacing.md,
    },
    title: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
    body: {fontSize: 13, color: colors.textBody, marginTop: spacing.sm, lineHeight: 20},
    btn: {
      marginTop: spacing.md,
      backgroundColor: brandColors.googleBlue,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
    },
    btnText: {color: '#fff', fontWeight: '800'},
  });
}
