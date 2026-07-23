import React, {useMemo, useState} from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

type Props = {
  visible: boolean;
  recoveryCode: string;
  onConfirm: () => void;
};

export function RecoveryCodeSetupModal({visible, recoveryCode, onConfirm}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [ack, setAck] = useState(false);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Save your recovery code</Text>
          <Text style={styles.body}>
            Write these 12 words on paper. You need them to reset your PIN if you forget it. MRP
            cannot recover this code for you.
          </Text>
          <ScrollView style={styles.codeBox} contentContainerStyle={styles.codeInner}>
            <Text style={styles.codeText} selectable>
              {recoveryCode}
            </Text>
          </ScrollView>
          <Pressable style={styles.checkRow} onPress={() => setAck(v => !v)}>
            <Text style={styles.checkBox}>{ack ? '☑' : '☐'}</Text>
            <Text style={styles.checkLabel}>I saved this recovery code offline</Text>
          </Pressable>
          <TouchableOpacity
            style={[styles.btn, !ack && styles.btnDisabled]}
            disabled={!ack}
            onPress={onConfirm}>
            <Text style={styles.btnText}>Continue to MRP</Text>
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
      maxHeight: '90%',
    },
    title: {fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm},
    body: {fontSize: 14, color: colors.textBody, lineHeight: 20, marginBottom: spacing.md},
    codeBox: {
      backgroundColor: colors.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      maxHeight: 160,
      marginBottom: spacing.md,
    },
    codeInner: {padding: spacing.md},
    codeText: {
      fontSize: 15,
      lineHeight: 24,
      color: colors.sky,
      fontWeight: '700',
      fontFamily: 'monospace',
    },
    checkRow: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md},
    checkBox: {fontSize: 20, marginRight: spacing.sm, color: colors.sky},
    checkLabel: {flex: 1, fontSize: 14, color: colors.textPrimary, fontWeight: '600'},
    btn: {
      backgroundColor: colors.sky,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    btnDisabled: {opacity: 0.45},
    btnText: {color: '#fff', fontWeight: '800', fontSize: 15},
  });
}
