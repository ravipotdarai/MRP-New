import React, {useMemo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {ColorPalette, spacing, radius, brandColors} from '../../../shared/theme';

type Action = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'safe' | 'danger';
  disabled?: boolean;
};

export function ProtectionActionBar({colors, actions}: {colors: ColorPalette; actions: Action[]}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      {actions.map((a, i) => {
        const variant = a.variant ?? (i === actions.length - 1 ? 'primary' : 'secondary');
        return (
          <TouchableOpacity
            key={a.label}
            style={[
              styles.btn,
              variant === 'primary' && styles.primary,
              variant === 'secondary' && styles.secondary,
              variant === 'safe' && styles.safe,
              variant === 'danger' && styles.danger,
              a.disabled && styles.disabled,
            ]}
            disabled={a.disabled}
            onPress={a.onPress}>
            <Text
              style={[
                styles.text,
                variant === 'primary' && styles.primaryText,
                variant === 'secondary' && styles.secondaryText,
                variant === 'safe' && styles.primaryText,
                variant === 'danger' && styles.dangerText,
              ]}>
              {a.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    row: {flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md, gap: 8},
    btn: {
      flex: 1,
      minWidth: '45%',
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primary: {backgroundColor: brandColors.googleBlue},
    secondary: {borderWidth: 1, borderColor: colors.border},
    safe: {backgroundColor: brandColors.googleGreen},
    danger: {borderWidth: 1, borderColor: brandColors.googleRed},
    disabled: {opacity: 0.5},
    text: {fontWeight: '800'},
    primaryText: {color: '#fff'},
    secondaryText: {color: colors.textPrimary, fontWeight: '700'},
    dangerText: {color: brandColors.googleRed, fontWeight: '700'},
  });
}
