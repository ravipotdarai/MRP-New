import React from 'react';
import {View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

type Props = {
  visible: boolean;
  onContinue: () => void;
  onCancel: () => void;
};

/**
 * In-app disclosure before background location (P7-5 / Play policy).
 * Must match Play listing Data Safety copy.
 */
export function BackgroundLocationDisclosure({visible, onContinue, onCancel}: Props) {
  const {colors} = useTheme();
  const styles = createStyles(colors);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Background location</Text>
            <Text style={styles.body}>
              MRP uses location in the background only when you enable monitoring features such as
              geofence alerts or emergency / find-my-device tracking.
            </Text>
            <Text style={styles.body}>
              Your security data stays on this device. If Drive sync is on, an encrypted copy is
              stored only in your private Google Drive app folder (unlocked with your PIN). Location
              is not uploaded to MRP servers as raw GPS. MRP does not sell your data.
            </Text>
            <Text style={styles.body}>
              You can turn off background tracking anytime in Hub → Geofence / Sync policy, or revoke
              location in Android Settings.
            </Text>
          </ScrollView>
          <TouchableOpacity style={styles.primary} onPress={onContinue} activeOpacity={0.85}>
            <Text style={styles.primaryText}>Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onCancel} activeOpacity={0.85}>
            <Text style={styles.secondaryText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: spacing.lg,
      maxHeight: '75%',
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: spacing.md,
    },
    body: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textBody,
      marginBottom: spacing.md,
    },
    primary: {
      backgroundColor: colors.sky,
      borderRadius: radius.lg,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    primaryText: {color: '#fff', fontWeight: '700', fontSize: 15},
    secondary: {
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    secondaryText: {color: colors.textMuted, fontWeight: '600'},
  });
}
