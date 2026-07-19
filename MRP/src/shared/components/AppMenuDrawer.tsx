import React, {useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import {ColorPalette, spacing, radius} from '../theme';
import {useTheme} from '../ThemeContext';

export type AppMenuTarget =
  | {screen: 'Home'}
  | {screen: 'Security'; tab: 'MONITORING' | 'TIMELINE' | 'PHOTOS' | 'PERMISSIONS'}
  | {screen: 'App Usage'; tab: 'DASHBOARD' | 'TIMELINE' | 'REPORTS'}
  | {screen: 'About'};

type Props = {
  visible: boolean;
  onClose: () => void;
  onNavigate: (target: AppMenuTarget) => void;
};

type MenuRow =
  | {kind: 'item'; label: string; icon?: string; target: AppMenuTarget}
  | {kind: 'section'; label: string; icon?: string; children: {label: string; target: AppMenuTarget}[]};

const MENU: MenuRow[] = [
  {kind: 'item', label: 'Home', icon: '🏠', target: {screen: 'Home'}},
  {
    kind: 'section',
    label: 'Security',
    icon: '🛡️',
    children: [
      {label: 'Monitoring', target: {screen: 'Security', tab: 'MONITORING'}},
      {label: 'Timeline', target: {screen: 'Security', tab: 'TIMELINE'}},
      {label: 'Photos', target: {screen: 'Security', tab: 'PHOTOS'}},
      {label: 'Permissions', target: {screen: 'Security', tab: 'PERMISSIONS'}},
    ],
  },
  {
    kind: 'section',
    label: 'App Usage',
    icon: '📊',
    children: [
      {label: 'Dashboard', target: {screen: 'App Usage', tab: 'DASHBOARD'}},
      {label: 'Timeline', target: {screen: 'App Usage', tab: 'TIMELINE'}},
      {label: 'Reports', target: {screen: 'App Usage', tab: 'REPORTS'}},
    ],
  },
  {kind: 'item', label: 'About', icon: 'ℹ️', target: {screen: 'About'}},
];

/**
 * Full app menu opened from Home ☰.
 */
export function AppMenuDrawer({visible, onClose, onNavigate}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const go = (target: AppMenuTarget) => {
    onClose();
    // Defer navigate so the modal can dismiss first
    setTimeout(() => onNavigate(target), 50);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <View>
              <Text style={styles.brand}>MRP</Text>
              <Text style={styles.brandSub}>Menu</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {MENU.map(row => {
              if (row.kind === 'item') {
                return (
                  <TouchableOpacity
                    key={row.label}
                    style={styles.topItem}
                    onPress={() => go(row.target)}
                    activeOpacity={0.7}>
                    {row.icon ? <Text style={styles.icon}>{row.icon}</Text> : null}
                    <Text style={styles.topLabel}>{row.label}</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <View key={row.label} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    {row.icon ? <Text style={styles.icon}>{row.icon}</Text> : null}
                    <Text style={styles.sectionLabel}>{row.label}</Text>
                  </View>
                  {row.children.map(child => (
                    <TouchableOpacity
                      key={`${row.label}-${child.label}`}
                      style={styles.childItem}
                      onPress={() => go(child.target)}
                      activeOpacity={0.7}>
                      <Text style={styles.childLabel}>{child.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(2, 6, 23, 0.55)',
    },
    drawer: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '78%',
      maxWidth: 320,
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderRightColor: colors.borderSoft,
      paddingTop: spacing.xl,
      elevation: 8,
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: {width: 4, height: 0},
    },
    drawerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    brand: {
      color: colors.textPrimary,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: 1,
    },
    brandSub: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    close: {
      color: colors.textSecondary,
      fontSize: 20,
      fontWeight: '600',
      padding: 4,
    },
    list: {
      paddingVertical: spacing.md,
      paddingBottom: spacing.xxl,
    },
    topItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
    },
    topLabel: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    icon: {
      fontSize: 16,
      marginRight: 10,
    },
    section: {
      marginTop: spacing.sm,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: spacing.lg,
    },
    sectionLabel: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    childItem: {
      paddingVertical: 11,
      paddingLeft: 48,
      paddingRight: spacing.lg,
    },
    childLabel: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
