import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInLeft,
  SlideInLeft,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {ColorPalette, spacing, radius} from '../theme';
import {useTheme} from '../ThemeContext';
import {CIRCLE_ENABLED} from '../../config/featureFlags';

export type AppMenuTarget =
  | {screen: 'Home'}
  | {screen: 'Digital Safety'; openSection?: string}
  | {screen: 'Security'; tab: 'MONITORING' | 'TIMELINE' | 'PHOTOS' | 'PERMISSIONS'}
  | {screen: 'App Usage'; tab: 'DASHBOARD' | 'TIMELINE' | 'REPORTS' | 'SAFETY'}
  | {
      screen: 'Hub';
      section?:
        | 'account'
        | 'circle'
        | 'geofence'
        | 'emergency-monitoring'
        | 'drive-sync'
        | 'sim-recovery'
        | 'subscriptions'
        | 'promotions'
        | 'affiliates'
        | 'policy'
        | 'about'
        | 'digital-safety'
        | 'security-center';
      securityCenterTab?: 'ADVISOR' | 'ANALYZER' | 'FRAUD' | 'TOOLS';
    };

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
      {label: 'Setup', target: {screen: 'Security', tab: 'MONITORING'}},
      {label: 'Timeline', target: {screen: 'Security', tab: 'TIMELINE'}},
      {label: 'Photos', target: {screen: 'Security', tab: 'PHOTOS'}},
      {label: 'Permissions', target: {screen: 'Security', tab: 'PERMISSIONS'}},
    ],
  },
  {
    kind: 'section',
    label: 'Digital Safety',
    icon: '🧭',
    children: [
      {
        label: 'Overview',
        target: {screen: 'Digital Safety'},
      },
      {
        label: 'Advisor',
        target: {screen: 'Digital Safety', openSection: 'security-center'},
      },
      {
        label: 'Threat Analyzer',
        target: {screen: 'Hub', section: 'security-center', securityCenterTab: 'ANALYZER'},
      },
      {
        label: 'Report Fraud',
        target: {screen: 'Hub', section: 'security-center', securityCenterTab: 'FRAUD'},
      },
      {
        label: 'Tools (URL / OTP / USSD)',
        target: {screen: 'Digital Safety', openSection: 'security-center'},
      },
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
  {
    kind: 'section',
    label: 'Hub',
    icon: '⚙️',
    children: [
      {label: 'Account', target: {screen: 'Hub', section: 'account'}},
      {label: 'Geofence', target: {screen: 'Hub', section: 'geofence'}},
      {label: 'Emergency monitoring', target: {screen: 'Hub', section: 'emergency-monitoring'}},
      ...(CIRCLE_ENABLED
        ? ([
            {label: 'Circle', target: {screen: 'Hub', section: 'circle'}},
          ] as {label: string; target: AppMenuTarget}[])
        : []),
      {label: 'Drive Sync', target: {screen: 'Hub', section: 'drive-sync'}},
      {label: 'SIM Recovery', target: {screen: 'Hub', section: 'sim-recovery'}},
      {label: 'Subscriptions', target: {screen: 'Hub', section: 'subscriptions'}},
      {label: 'Promotions', target: {screen: 'Hub', section: 'promotions'}},
      {label: 'Affiliates', target: {screen: 'Hub', section: 'affiliates'}},
      {label: 'Policy', target: {screen: 'Hub', section: 'policy'}},
      {label: 'About MRP', target: {screen: 'Hub', section: 'about'}},
    ],
  },
];

const DRAWER_W = Math.min(Dimensions.get('window').width * 0.84, 336);

function PressableRow({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: object | object[];
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
  }));

  return (
    <Pressable
      onPressIn={() => {
        scale.value = withSpring(0.98, {damping: 20, stiffness: 340});
      }}
      onPressOut={() => {
        scale.value = withSpring(1, {damping: 16, stiffness: 300});
      }}
      onPress={onPress}>
      <Animated.View style={[style, animStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

function CollapsibleSection({
  label,
  icon,
  children,
  styles,
  defaultOpen,
  onNavigate,
  onClose,
}: {
  label: string;
  icon?: string;
  children: {label: string; target: AppMenuTarget}[];
  styles: ReturnType<typeof createStyles>;
  defaultOpen?: boolean;
  onNavigate: (target: AppMenuTarget) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const chevron = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    chevron.value = withTiming(open ? 1 : 0, {duration: 200});
  }, [open, chevron]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{rotate: `${chevron.value * 90}deg`}],
  }));

  const go = (target: AppMenuTarget) => {
    onClose();
    setTimeout(() => onNavigate(target), 80);
  };

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.sectionHeader}
        onPress={() => setOpen(v => !v)}
        accessibilityRole="button"
        accessibilityState={{expanded: open}}>
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.iconWrap, styles.sectionIconWrap]}>
            {icon ? <Text style={styles.icon}>{icon}</Text> : null}
          </View>
          <Text style={styles.sectionLabel}>{label}</Text>
        </View>
        <Animated.Text style={[styles.sectionToggle, chevronStyle]}>›</Animated.Text>
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)}>
          {children.map((child, i) => (
            <PressableRow
              key={`${label}-${child.label}`}
              style={[
                styles.childItem,
                i === children.length - 1 && styles.childItemLast,
              ]}
              onPress={() => go(child.target)}>
              <View style={styles.childDot} />
              <Text style={styles.childLabel}>{child.label}</Text>
              <Text style={styles.childChevron}>›</Text>
            </PressableRow>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * Full app menu opened from Home ☰ — standard slide-in drawer with collapsible groups.
 */
export function AppMenuDrawer({visible, onClose, onNavigate}: Props) {
  const {colors, themeId} = useTheme();
  const isLight = themeId === 'light';
  const styles = useMemo(() => createStyles(colors, isLight), [colors, isLight]);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    backdrop.value = withTiming(visible ? 1 : 0, {
      duration: visible ? 240 : 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [visible, backdrop]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
  }));

  const go = (target: AppMenuTarget) => {
    onClose();
    setTimeout(() => onNavigate(target), 80);
  };

  let stagger = 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {visible ? (
          <Animated.View
            entering={SlideInLeft.duration(300).springify().damping(22)}
            style={styles.drawerWrap}>
            <SafeAreaView style={styles.drawer}>
              <View style={styles.drawerTopSpacer} />

              <Animated.View entering={FadeIn.delay(50).duration(220)} style={styles.drawerHeader}>
                <View style={styles.brandBlock}>
                  <View style={styles.brandMark}>
                    <Text style={styles.brandMarkText}>M</Text>
                  </View>
                  <View>
                    <Text style={styles.brand}>MRP</Text>
                    <Text style={styles.brandSub}>Menu</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12}>
                  <Text style={styles.close}>✕</Text>
                </TouchableOpacity>
              </Animated.View>

              <ScrollView
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}>
                {MENU.map(row => {
                  if (row.kind === 'item') {
                    const delay = Math.min(stagger++, 8) * 40;
                    return (
                      <Animated.View
                        key={row.label}
                        entering={FadeInLeft.delay(delay).duration(260).springify()}>
                        <PressableRow style={styles.topItem} onPress={() => go(row.target)}>
                          <View style={styles.iconWrap}>
                            {row.icon ? <Text style={styles.icon}>{row.icon}</Text> : null}
                          </View>
                          <Text style={styles.topLabel}>{row.label}</Text>
                          <Text style={styles.rowChevron}>›</Text>
                        </PressableRow>
                      </Animated.View>
                    );
                  }

                  const sectionDelay = Math.min(stagger++, 8) * 40;
                  return (
                    <Animated.View
                      key={row.label}
                      entering={FadeInLeft.delay(sectionDelay).duration(280).springify()}>
                      <CollapsibleSection
                        label={row.label}
                        icon={row.icon}
                        children={row.children}
                        styles={styles}
                        defaultOpen={row.label === 'Security'}
                        onNavigate={onNavigate}
                        onClose={onClose}
                      />
                    </Animated.View>
                  );
                })}
              </ScrollView>
            </SafeAreaView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette, isLight: boolean) {
  return StyleSheet.create({
    root: {flex: 1},
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isLight ? 'rgba(15, 23, 42, 0.38)' : 'rgba(2, 6, 23, 0.72)',
    },
    drawerWrap: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: DRAWER_W,
    },
    drawer: {
      flex: 1,
      backgroundColor: colors.bg,
      borderRightWidth: 1,
      borderRightColor: colors.borderSoft,
      elevation: 20,
      shadowColor: '#000',
      shadowOpacity: isLight ? 0.14 : 0.5,
      shadowRadius: 24,
      shadowOffset: {width: 8, height: 0},
    },
    drawerTopSpacer: {
      height: spacing.sm,
    },
    drawerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    brandBlock: {flexDirection: 'row', alignItems: 'center', gap: 12},
    brandMark: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.sky,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brandMarkText: {color: '#fff', fontWeight: '900', fontSize: 17},
    brand: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: '900',
      letterSpacing: 0.5,
    },
    brandSub: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
      fontWeight: '600',
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    close: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: '700',
    },
    list: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xxl,
    },
    topItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    topLabel: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700',
      flex: 1,
    },
    rowChevron: {
      fontSize: 20,
      color: colors.textMuted,
      fontWeight: '500',
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.skySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    sectionIconWrap: {
      backgroundColor: colors.violet + '18',
    },
    icon: {fontSize: 17},
    section: {
      marginBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 13,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
    },
    sectionHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    sectionLabel: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    sectionToggle: {
      fontSize: 22,
      color: colors.textMuted,
      fontWeight: '600',
      marginLeft: 8,
    },
    childItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingLeft: spacing.lg + 4,
      paddingRight: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
      backgroundColor: colors.surfaceAlt,
    },
    childItemLast: {
      borderBottomLeftRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
    },
    childDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.sky,
      marginRight: 12,
    },
    childLabel: {
      color: colors.textBody,
      fontSize: 15,
      fontWeight: '600',
      flex: 1,
    },
    childChevron: {
      fontSize: 18,
      color: colors.textMuted,
      marginLeft: 8,
    },
  });
}
