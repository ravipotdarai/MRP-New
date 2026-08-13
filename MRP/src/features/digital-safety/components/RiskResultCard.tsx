import React, {useMemo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {ColorPalette, spacing, radius, brandColors} from '../../../shared/theme';
import type {RiskBand} from '../risk/types';

export function bandColor(band: string, colors: ColorPalette): string {
  switch (band) {
    case 'SAFE':
      return brandColors.googleGreen;
    case 'LOW_RISK':
      return colors.sky;
    case 'SUSPICIOUS':
      return brandColors.googleYellow;
    case 'HIGH_RISK':
      return colors.amber;
    case 'CRITICAL':
      return brandColors.googleRed;
    default:
      return colors.textMuted;
  }
}

type RiskResultCardProps = {
  colors: ColorPalette;
  band: RiskBand | string;
  score: number;
  title?: string;
  subtitle?: string;
  reasons: string[];
  showReasons?: boolean;
  onToggleReasons?: () => void;
  footer?: string;
  children?: React.ReactNode;
};

export function RiskResultCard({
  colors,
  band,
  score,
  title,
  subtitle,
  reasons,
  showReasons = false,
  onToggleReasons,
  footer,
  children,
}: RiskResultCardProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const color = bandColor(band, colors);

  return (
    <View style={[styles.card, {borderColor: color}]}>
      <Text style={[styles.band, {color}]}>
        {String(band).replace(/_/g, ' ')} · {score}/100
      </Text>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      {onToggleReasons ? (
        <TouchableOpacity onPress={onToggleReasons}>
          <Text style={styles.whyLink}>
            {showReasons ? 'Hide reasons' : 'Why is this flagged?'}
          </Text>
        </TouchableOpacity>
      ) : null}
      {showReasons
        ? reasons.map((r, i) => (
            <Text key={i} style={styles.reason}>
              • {r}
            </Text>
          ))
        : null}
      {children}
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 2,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    band: {fontSize: 18, fontWeight: '800', marginBottom: 6},
    title: {fontSize: 16, fontWeight: '700', color: colors.textPrimary},
    sub: {fontSize: 13, color: colors.textBody, marginTop: 4},
    whyLink: {
      color: brandColors.googleBlue,
      fontWeight: '700',
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    reason: {fontSize: 13, color: colors.textBody, marginBottom: 4},
    footer: {
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: 'italic',
      marginTop: spacing.md,
      lineHeight: 18,
    },
  });
}
