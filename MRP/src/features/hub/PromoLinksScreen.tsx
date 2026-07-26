import React, {useMemo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {AFFILIATES, PROMOTIONS, type PromoLink} from './promoConfig';

type Kind = 'promotions' | 'affiliates';

export function PromoLinksScreen({kind}: {kind: Kind}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const items: PromoLink[] = kind === 'promotions' ? PROMOTIONS : AFFILIATES;
  const title = kind === 'promotions' ? 'Promotions' : 'Affiliates';
  const lead =
    kind === 'promotions'
      ? 'Offers and rewards. Links are config-driven (Remote Config optional later).'
      : 'Share MRP. Referral tracking lands with Nest + Play billing.';

  const open = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
      <Text style={styles.lead}>{lead}</Text>
      {items.map(item => (
        <TouchableOpacity
          key={item.id}
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => open(item.url)}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardSub}>{item.subtitle}</Text>
          <Text style={styles.link}>Open →</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    pad: {padding: spacing.lg, paddingBottom: spacing.xl},
    lead: {
      fontSize: 14,
      color: colors.textMuted,
      lineHeight: 20,
      marginBottom: spacing.md,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    cardSub: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 4,
      lineHeight: 18,
    },
    link: {
      marginTop: spacing.sm,
      fontSize: 13,
      fontWeight: '700',
      color: colors.sky,
    },
  });
}
