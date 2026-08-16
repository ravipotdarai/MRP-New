import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {brandColors, brandCopy, brandImages} from '../../assets/brand';
import {useTheme} from '../ThemeContext';

type Size = 'splash' | 'lock' | 'compact';

const LOGO = {
  splash: {width: 220, height: 176},
  lock: {width: 196, height: 158},
  compact: {width: 112, height: 90},
} as const;

/** Centered eagle lockup + wordmark, matching the brand splash sheet. */
export function BrandLockup({
  size = 'lock',
  showFullName = true,
  showTagline = true,
  showPillars = false,
  light = false,
}: {
  size?: Size;
  showFullName?: boolean;
  showTagline?: boolean;
  showPillars?: boolean;
  /** White splash / PIN sheet — onyx wordmark like the brand kit. */
  light?: boolean;
}) {
  const {colors} = useTheme();
  const dim = LOGO[size];
  const nameSize = size === 'compact' ? 28 : 36;
  const nameColor = light ? brandColors.onyx : colors.textPrimary;
  const muted = light ? '#5F6368' : colors.textMuted;
  return (
    <View style={styles.wrap} accessibilityRole="image" accessibilityLabel="MRP">
      <Image source={brandImages.logoMark} style={dim} resizeMode="contain" />
      <Text style={[styles.name, {fontSize: nameSize, color: nameColor}]}>{brandCopy.name}</Text>
      {showFullName ? <Text style={[styles.full, {color: muted}]}>{brandCopy.fullName}</Text> : null}
      {showTagline ? <Text style={styles.tagline}>{brandCopy.tagline}</Text> : null}
      {showPillars ? <Text style={[styles.pillars, {color: muted}]}>{brandCopy.pillars}</Text> : null}
    </View>
  );
}

/** Colorful footer wave from the splash mock. */
export function BrandWave() {
  return (
    <View style={styles.waveWrap} pointerEvents="none">
      <LinearGradient
        colors={[brandColors.googleBlue, brandColors.googleGreen, brandColors.googleYellow, '#FF8A3D']}
        start={{x: 0, y: 0.5}}
        end={{x: 1, y: 0.5}}
        style={styles.wave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  name: {
    fontWeight: '900',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  full: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginTop: 4,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 16,
    fontWeight: '700',
    color: brandColors.googleBlue,
    marginTop: 10,
    textAlign: 'center',
  },
  pillars: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  waveWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 28,
    overflow: 'hidden',
  },
  wave: {
    height: 48,
    marginTop: 8,
    borderTopLeftRadius: 80,
    borderTopRightRadius: 40,
    transform: [{scaleX: 1.15}],
  },
});
