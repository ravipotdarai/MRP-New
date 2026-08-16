import React, {useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {useOpsCatalog} from './useOpsCatalog';
import MrpOps from '../../native/MrpOps.types';

export function InboxScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {ops, refresh} = useOpsCatalog();

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.lead}>
        Offers, coupons, and plan changes pushed by MRP admin. Badge on Home clears when you open this
        list.
      </Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={async () => {
          await MrpOps?.markInboxRead?.();
          await refresh();
        }}>
        <Text style={styles.btnText}>Mark all read</Text>
      </TouchableOpacity>
      {ops.inbox.length === 0 ? (
        <Text style={styles.muted}>No notifications yet.</Text>
      ) : (
        ops.inbox.map(item => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.kind}>{item.kind}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.muted}>
              {item.atMs ? new Date(item.atMs).toLocaleString() : ''}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    pad: {padding: spacing.lg, paddingBottom: spacing.xxl},
    lead: {fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.md},
    btn: {
      alignSelf: 'flex-start',
      backgroundColor: colors.sky,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginBottom: spacing.md,
    },
    btnText: {color: '#fff', fontWeight: '800', fontSize: 13},
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    kind: {fontSize: 11, fontWeight: '800', color: colors.sky, textTransform: 'uppercase'},
    title: {fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginTop: 4},
    body: {fontSize: 14, color: colors.textBody, marginTop: 4, lineHeight: 20},
    muted: {fontSize: 12, color: colors.textMuted, marginTop: 6},
  });
}
