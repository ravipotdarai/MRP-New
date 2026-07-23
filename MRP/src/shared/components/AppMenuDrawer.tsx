import React, {useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
  SafeAreaView,
} from 'react-native';
import {ColorPalette, spacing} from '../theme';
import {useTheme} from '../ThemeContext';

export type AppMenuTarget =
  | {screen: 'Home'}
  | {screen: 'Security'; tab: 'MONITORING' | 'TIMELINE' | 'PHOTOS' | 'PERMISSIONS'}
  | {screen: 'App Usage'; tab: 'DASHBOARD' | 'TIMELINE' | 'REPORTS' | 'SAFETY'}
  | {screen: 'Hub'; section?: 'circle' | 'sim-recovery' | 'subscriptions' | 'promotions' | 'affiliates' | 'about'};

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
      {label: 'App Safety', target: {screen: 'App Usage', tab: 'SAFETY'}},
    ],
  },
  {kind: 'item', label: 'Hub', icon: '⚙️', target: {screen: 'Hub'}},
];

/**
 * Full app menu opened from Home ☰.
 */
export function AppMenuDrawer({visible, onClose, onNavigate}: Props) {
  const {colors, themeId} = useTheme();
  const styles = useMemo(() => createStyles(colors, themeId === 'light'), [colors, themeId]);

  const go = (target: AppMenuTarget) => {
    onClose();
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
        <SafeAreaView style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <View>
              <Text style={styles.brand}>MRP</Text>
              <Text style={styles.brandSub}>Navigation</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12}>
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
                    <View style={styles.iconWrap}>
                      {row.icon ? <Text style={styles.icon}>{row.icon}</Text> : null}
                    </View>
                    <Text style={styles.topLabel}>{row.label}</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <View key={row.label} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.iconWrap}>
                      {row.icon ? <Text style={styles.icon}>{row.icon}</Text> : null}
                    </View>
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
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette, isLight: boolean) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isLight ? 'rgba(15, 23, 42, 0.45)' : 'rgba(2, 6, 23, 0.62)',
    },
    drawer: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '80%',
      maxWidth: 320,
      backgroundColor: colors.bg,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      elevation: 10,
      shadowColor: '#000',
      shadowOpacity: isLight ? 0.18 : 0.4,
      shadowRadius: 14,
      shadowOffset: {width: 4, height: 0},
    },
    drawerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
      backgroundColor: colors.surface,
    },
    brand: {
      color: colors.textPrimary,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: 1,
    },
    brandSub: {
      color: colors.sky,
      fontSize: 12,
      marginTop: 2,
      fontWeight: '600',
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.skySoft,
      borderWidth: 1,
      borderColor: colors.sky,
      alignItems: 'center',
      justifyContent: 'center',
    },
    close: {
      color: colors.sky,
      fontSize: 16,
      fontWeight: '700',
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
      marginHorizontal: spacing.sm,
      marginBottom: 4,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    topLabel: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: colors.skySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    icon: {
      fontSize: 15,
    },
    section: {
      marginTop: spacing.md,
      marginHorizontal: spacing.sm,
      marginBottom: spacing.sm,
      paddingBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
      backgroundColor: colors.surfaceAlt,
    },
    sectionLabel: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    childItem: {
      paddingVertical: 13,
      paddingLeft: 54,
      paddingRight: spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    childLabel: {
      color: colors.textBody,
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
