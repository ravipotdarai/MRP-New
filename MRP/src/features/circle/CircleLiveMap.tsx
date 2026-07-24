import React, {useMemo, useState} from 'react';
import {View, Text, Image, StyleSheet, TouchableOpacity, Linking} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {
  LiveMapPoint,
  buildCircleMapUris,
  pinStyle,
} from './circleMapUrls';

type Props = {
  points: LiveMapPoint[];
  title?: string;
};

export function CircleLiveMap({points, title = 'Live map'}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const uris = useMemo(() => buildCircleMapUris(points), [points]);
  const [uriIndex, setUriIndex] = useState(0);
  const uri = uris[uriIndex] ?? null;

  if (points.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          No live points yet. Turn Share ON after mutual consent (requires Google Sign-In + Firebase
          RTDB).
        </Text>
      </View>
    );
  }

  const openMaps = () => {
    const p = points[0];
    Linking.openURL(
      `https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=15/${p.latitude}/${p.longitude}`,
    ).catch(() => {});
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {uri ? (
        <TouchableOpacity activeOpacity={0.9} onPress={openMaps}>
          <Image
            source={{uri}}
            style={styles.map}
            resizeMode="cover"
            onError={() => {
              if (uriIndex + 1 < uris.length) setUriIndex(uriIndex + 1);
            }}
          />
        </TouchableOpacity>
      ) : null}
      <View style={styles.legend}>
        {points.map(p => {
          const style = pinStyle(p.colorIndex);
          return (
            <View key={p.id} style={styles.legendRow}>
              <View style={[styles.dot, {backgroundColor: style.hex}]} />
              <Text style={styles.legendText} numberOfLines={1}>
                {p.displayName}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {marginBottom: spacing.md},
    title: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
    },
    map: {
      width: '100%',
      height: 180,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    legend: {marginTop: spacing.sm, gap: 6},
    legendRow: {flexDirection: 'row', alignItems: 'center'},
    dot: {width: 10, height: 10, borderRadius: 5, marginRight: 8},
    legendText: {fontSize: 13, color: colors.textBody, flex: 1},
    empty: {
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: spacing.md,
    },
    emptyText: {fontSize: 13, color: colors.textMuted, lineHeight: 18},
  });
}
