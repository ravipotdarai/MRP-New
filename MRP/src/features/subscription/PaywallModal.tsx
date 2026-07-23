import React, {useMemo} from 'react';
import {Modal, View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

type Props = {
  visible: boolean;
  title?: string;
  message: string;
  onClose: () => void;
  onUpgrade?: () => void;
};

export function PaywallModal({
  visible,
  title = 'Upgrade required',
  message,
  onClose,
  onUpgrade,
}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{message}</Text>
          {onUpgrade ? (
            <TouchableOpacity style={styles.primary} onPress={onUpgrade}>
              <Text style={styles.primaryText}>View plans</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.secondary} onPress={onClose}>
            <Text style={styles.secondaryText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm},
    body: {fontSize: 14, color: colors.textBody, lineHeight: 20, marginBottom: spacing.md},
    primary: {
      backgroundColor: colors.sky,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    primaryText: {color: '#fff', fontWeight: '800'},
    secondary: {alignItems: 'center', paddingVertical: 8},
    secondaryText: {color: colors.textMuted, fontWeight: '700'},
  });
}
