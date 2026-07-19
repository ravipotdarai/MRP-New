import React, {useMemo} from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import {useTheme} from '../ThemeContext';
import {ThemeId} from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Compact theme picker — opened from Home header near the bell.
 */
export function ThemePickerModal({visible, onClose}: Props) {
  const {colors, themes, themeId, setThemeId, spacing, radius} = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {flex: 1, justifyContent: 'flex-end'},
        backdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(2, 6, 23, 0.55)',
        },
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
          paddingBottom: spacing.xxl,
          borderTopWidth: 1,
          borderColor: colors.borderSoft,
        },
        handle: {
          alignSelf: 'center',
          width: 40,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.border,
          marginBottom: spacing.md,
        },
        title: {
          fontSize: 18,
          fontWeight: '800',
          color: colors.textPrimary,
          marginBottom: 4,
        },
        subtitle: {
          fontSize: 13,
          color: colors.textSecondary,
          marginBottom: spacing.lg,
        },
        row: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
        },
        option: {
          width: '48%',
          flexGrow: 1,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: colors.border,
          backgroundColor: colors.bg,
          marginBottom: spacing.sm,
        },
        optionActive: {
          borderColor: colors.sky,
          backgroundColor: colors.skySoft,
        },
        swatch: {
          width: 28,
          height: 28,
          borderRadius: 14,
          marginRight: 10,
          borderWidth: 2,
          borderColor: '#fff',
        },
        optionLabel: {
          fontSize: 14,
          fontWeight: '700',
          color: colors.textPrimary,
          flex: 1,
        },
        check: {
          fontSize: 14,
          color: colors.sky,
          fontWeight: '800',
        },
      }),
    [colors, spacing, radius],
  );

  const pick = (id: ThemeId) => {
    setThemeId(id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Color theme</Text>
          <Text style={styles.subtitle}>Choose a look for the app</Text>
          <View style={styles.row}>
            {themes.map(t => {
              const active = t.id === themeId;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => pick(t.id)}
                  activeOpacity={0.75}>
                  <View style={[styles.swatch, {backgroundColor: t.preview}]} />
                  <Text style={styles.optionLabel}>{t.label}</Text>
                  {active ? <Text style={styles.check}>✓</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
