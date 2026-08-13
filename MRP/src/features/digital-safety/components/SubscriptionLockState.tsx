import React, {useMemo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {ColorPalette, spacing, radius, brandColors} from '../../../shared/theme';

export function SubscriptionLockState({
  colors,
  title,
  message,
  onUpgrade,
}: {
  colors: ColorPalette;
  title: string;
  message: string;
  onUpgrade?: () => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.msg}>{message}</Text>
      {onUpgrade ? (
        <TouchableOpacity style={styles.btn} onPress={onUpgrade}>
          <Text style={styles.btnText}>View plans</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    box: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.amber,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    title: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
    msg: {fontSize: 13, color: colors.textBody, marginTop: spacing.sm, lineHeight: 20},
    btn: {
      marginTop: spacing.md,
      backgroundColor: brandColors.googleBlue,
      borderRadius: radius.md,
      paddingVertical: 10,
      alignItems: 'center',
    },
    btnText: {color: '#fff', fontWeight: '800'},
  });
}
