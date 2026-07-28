import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

type Props = {
  panicActive?: boolean;
  emergencyActive?: boolean;
  circleSharing?: boolean;
  circleName?: string;
};

/** Home status strip when Panic, Emergency, or Circle live share is active. */
export function ActivityStatusBanner({
  panicActive,
  emergencyActive,
  circleSharing,
  circleName,
}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!panicActive && !emergencyActive && !circleSharing) return null;

  return (
    <View style={styles.wrap}>
      {panicActive ? (
        <View style={[styles.chip, styles.panic]}>
          <Text style={styles.chipText}>🆘 Panic alert sent — contacts notified</Text>
        </View>
      ) : null}
      {emergencyActive ? (
        <View style={[styles.chip, styles.emergency]}>
          <Text style={styles.chipText}>
            📡 Emergency / Find-my-device tracking ON
          </Text>
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
    emergency: {
      backgroundColor: colors.amberSoft,
      borderColor: colors.amber,
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
