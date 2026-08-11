import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Image,
  ImageSourcePropType,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';
import {ColorPalette, spacing, radius, brandColors} from '../../shared/theme';

type Props = {
  title: string;
  subtitle?: string;
  icon?: string;
  iconSource?: ImageSourcePropType;
  badge?: string;
  index: number;
  colors: ColorPalette;
  onPress: () => void;
  /** Grid tile (brand kit) vs list row */
  variant?: 'row' | 'tile';
};

/** Hub menu card — brand-kit tile or classic row. */
export function HubMenuCard({
  title,
  subtitle,
  icon,
  iconSource,
  badge,
  index,
  colors,
  onPress,
  variant = 'row',
}: Props) {
  const scale = useSharedValue(1);
  const styles = createStyles(colors);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
  }));

  if (variant === 'tile') {
    return (
      <Animated.View
        style={styles.tileWrap}
        entering={FadeInDown.delay(Math.min(index, 8) * 40).springify()}>
        <Pressable
          onPressIn={() => {
            scale.value = withSpring(0.96, {damping: 18, stiffness: 320});
          }}
          onPressOut={() => {
            scale.value = withSpring(1, {damping: 14, stiffness: 280});
          }}
          onPress={onPress}
          style={{flex: 1}}>
          <Animated.View style={[styles.tile, animStyle]}>
            <View style={styles.tileIconWrap}>
              {iconSource ? (
                <Image source={iconSource} style={styles.tileIconImg} />
              ) : (
                <Text style={styles.tileEmoji}>{icon}</Text>
              )}
            </View>
            <Text style={styles.tileTitle} numberOfLines={2}>
              {title}
            </Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
    );
  }

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
            {iconSource ? (
              <Image source={iconSource} style={styles.rowIconImg} />
            ) : (
              <Text style={styles.menuIcon}>{icon}</Text>
            )}
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
            {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
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
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: brandColors.iconBg || colors.skySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
      overflow: 'hidden',
    },
    menuIcon: {fontSize: 22},
    rowIconImg: {width: 48, height: 48, borderRadius: 14},
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
      backgroundColor: brandColors.googleBlue,
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
    tileWrap: {
      width: '25%',
      padding: 4,
      marginBottom: 4,
    },
    tile: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 4,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      minHeight: 108,
    },
    tileIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 8,
    },
    tileIconImg: {width: 52, height: 52},
    tileEmoji: {fontSize: 28, textAlign: 'center', lineHeight: 52},
    tileTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      lineHeight: 14,
      paddingHorizontal: 2,
    },
  });
}
