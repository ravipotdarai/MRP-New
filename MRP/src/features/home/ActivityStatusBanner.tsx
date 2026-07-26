import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

type Props = {
  panicActive?: boolean;
  circleSharing?: boolean;
  circleName?: string;
};

/** Home status strip when Panic or Circle live share is active (P7-6). */
export function ActivityStatusBanner({
  panicActive,
  circleSharing,
  circleName,
}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!panicActive && !circleSharing) return null;

  return (
    <View style={styles.wrap}>
      {panicActive ? (
        <View style={[styles.chip, styles.panic]}>
          <Text style={styles.chipText}>🆘 Panic alert sent — contacts notified</Text>
        </View>
      ) : null}
      {circleSharing ? (
        <View style={[styles.chip, styles.share]}>
          <Text style={styles.chipText}>
            📍 Circle sharing ON{circleName ? ` · ${circleName}` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {gap: 6, marginBottom: spacing.sm},
    chip: {
      borderRadius: radius.md,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderWidth: 1,
    },
    panic: {
      backgroundColor: colors.redSoft,
      borderColor: colors.red,
    },
    share: {
      backgroundColor: colors.emeraldSoft,
      borderColor: colors.emerald,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
    },
  });
}
