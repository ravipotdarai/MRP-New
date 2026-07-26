import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';
import {ColorPalette, spacing, radius} from '../../shared/theme';

type Props = {
  title: string;
  subtitle: string;
  icon: string;
  badge?: string;
  index: number;
  colors: ColorPalette;
  onPress: () => void;
};

/** Hub menu row with press scale + staggered fade-in (P7-2). */
export function HubMenuCard({
  title,
  subtitle,
  icon,
  badge,
  index,
  colors,
  onPress,
}: Props) {
  const scale = useSharedValue(1);
  const styles = createStyles(colors);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
  }));

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).springify()}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.97, {damping: 18, stiffness: 320});
        }}
        onPressOut={() => {
          scale.value = withSpring(1, {damping: 14, stiffness: 280});
        }}
        onPress={onPress}>
        <Animated.View style={[styles.menuCard, animStyle]}>
          <View style={styles.menuIconWrap}>
            <Text style={styles.menuIcon}>{icon}</Text>
          </View>
          <View style={styles.menuText}>
            <View style={styles.menuTitleRow}>
              <Text style={styles.menuTitle}>{title}</Text>
              {badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.menuSubtitle}>{subtitle}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    menuCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    menuIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.skySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    menuIcon: {fontSize: 22},
    menuText: {flex: 1},
    menuTitleRow: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8},
    menuTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    menuSubtitle: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
    badge: {
      backgroundColor: colors.violet,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#fff',
      textTransform: 'uppercase',
    },
    chevron: {
      fontSize: 22,
      color: colors.textMuted,
      marginLeft: spacing.sm,
    },
  });
}
