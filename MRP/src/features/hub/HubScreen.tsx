import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  BackHandler,
  Image,
  TouchableOpacity,
  type ImageSourcePropType,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {AboutScreen} from '../../screens/AboutScreen';
import {SimRecoveryPanel} from '../sim-recovery/SimRecoveryPanel';
import {AccountScreen} from './AccountScreen';
import {SubscriptionScreen} from '../subscription/SubscriptionScreen';
import {PaywallModal} from '../subscription/PaywallModal';
import {CircleScreen} from '../circle/CircleScreen';
import {
  peekPendingCircleInvite,
  subscribeCircleInvite,
} from '../circle/circleInvitePending';
import {DriveSyncScreen} from '../drive/DriveSyncScreen';
import {GeofenceScreen} from '../geofence/GeofenceScreen';
import {HubMenuCard} from './HubMenuCard';
import {PromoLinksScreen} from './PromoLinksScreen';
import {PolicyScreen} from './PolicyScreen';
import {CIRCLE_ENABLED} from '../../config/featureFlags';
import Animated, {FadeIn} from 'react-native-reanimated';
import {SecurityCenterScreen} from '../security-center/SecurityCenterScreen';
import {EmergencyMonitoringScreen} from '../journey/EmergencyMonitoringScreen';
import {
  DigitalSafetyHubScreen,
  type DigitalSafetyDestination,
} from '../digital-safety/DigitalSafetyHubScreen';
import {SafeLinkResultScreen} from '../digital-safety/SafeLinkResultScreen';
import {QrScannerScreen} from '../digital-safety/QrScannerScreen';
import {ScamCheckScreen} from '../digital-safety/ScamCheckScreen';
import {EmergencyCardScreen} from '../digital-safety/EmergencyCardScreen';
import {SecureVaultScreen} from '../digital-safety/SecureVaultScreen';
import {CellularSecurityScreen} from '../digital-safety/CellularSecurityScreen';
import {NetworkGuardianScreen} from '../digital-safety/NetworkGuardianScreen';
import {AutomationSettingsScreen} from '../digital-safety/AutomationSettingsScreen';
import {setSecurityCenterTab} from '../security-center/securityCenterNav';
import {useEntitlements} from '../../services/entitlements/EntitlementProvider';
import type {FeatureKey} from '../../services/entitlements/FeatureGate';
import {brandImages, brandCopy} from '../../assets/brand';

type HubSection =
  | 'menu'
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
  | 'safe-link'
  | 'scam-check'
  | 'qr-scan'
  | 'network-guardian-screen'
  | 'cellular-security'
  | 'automation-settings'
  | 'emergency-card'
  | 'secure-vault'
  | 'security-center';

/** Screens that always return to Digital Safety hub on back. */
const DS_FEATURE_SECTIONS: ReadonlySet<HubSection> = new Set([
  'safe-link',
  'scam-check',
  'qr-scan',
  'network-guardian-screen',
  'cellular-security',
  'automation-settings',
  'emergency-card',
  'secure-vault',
]);

type HubRouteParams = {openSection?: HubSection; safeLinkText?: string};

type MenuItem = {
  id: HubSection;
  title: string;
  subtitle: string;
  icon?: string;
  iconSource?: ImageSourcePropType;
  badge?: string;
};

/** Brand-kit 8 feature tiles → Hub / Security destinations */
type FeatureTile = {
  id: string;
  title: string;
  iconSource: ImageSourcePropType;
  action: () => void;
};

/** More services — exclude Safety (own tab) and Key features grid items. */
const MENU_ITEMS: MenuItem[] = [
  {
    id: 'account',
    title: 'Account',
    subtitle: 'Google sign-in & switch account',
    icon: '👤',
  },
  ...(CIRCLE_ENABLED
    ? ([
        {
          id: 'circle',
          title: 'Circle',
          subtitle: 'Live Share — Enterprise',
          icon: '📍',
          badge: 'Enterprise',
        },
      ] as MenuItem[])
    : []),
  {
    id: 'subscriptions',
    title: 'Subscriptions',
    subtitle: 'Plans & billing',
    icon: '⭐',
  },
  {
    id: 'promotions',
    title: 'Promotions',
    subtitle: 'Offers & rewards',
    icon: '🎁',
  },
  {
    id: 'affiliates',
    title: 'Affiliates',
    subtitle: 'Share & earn',
    icon: '🔗',
  },
  {
    id: 'policy',
    title: 'Policy',
    subtitle: 'Privacy, Play & permissions',
    icon: '📜',
  },
  {
    id: 'about',
    title: 'About MRP',
    subtitle: 'Guide, trust & version',
    icon: 'ℹ️',
  },
];

function HubSectionShell({
  title,
  styles,
  onBack,
  children,
}: {
  title: string;
  styles: ReturnType<typeof createStyles>;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <HubTitleBar title={title} styles={styles} onBack={onBack} />
      <Animated.View style={styles.sectionBody} entering={FadeIn.duration(220)}>
        {children}
      </Animated.View>
    </SafeAreaView>
  );
}

type HubNav = {
  setParams?: (params: {openSection?: HubSection | undefined}) => void;
  navigate?: (screen: string, params?: object) => void;
};

function HubTitleBar({
  title,
  styles,
  onBack,
}: {
  title: string;
  styles: ReturnType<typeof createStyles>;
  onBack?: () => void;
}) {
  return (
    <View style={styles.subHeader}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.subTitle}>{title}</Text>
    </View>
  );
}

function PlaceholderBody({
  title,
  body,
  styles,
  colors,
}: {
  title: string;
  body: string;
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
}) {
  return (
    <View style={styles.placeholderCard}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={[styles.placeholderBody, {color: colors.textBody}]}>{body}</Text>
    </View>
  );
}

export function HubScreen({
  navigation,
  route,
}: {
  navigation?: HubNav;
  route?: {params?: HubRouteParams};
}) {
  const {colors} = useTheme();
  const {canUseFeature} = useEntitlements();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [section, setSection] = useState<HubSection>('menu');
  const [safeLinkText, setSafeLinkText] = useState('');
  const [paywall, setPaywall] = useState<{title: string; message: string} | null>(null);
  /** When true, back from security-center / sim-recovery / drive-sync returns to Digital Safety. */
  const [fromDigitalSafety, setFromDigitalSafety] = useState(false);
  /** Last route param we applied — stops focus/effect from fighting local menu taps. */
  const appliedOpenSection = useRef<HubSection | undefined | null>(null);

  const goMenu = useCallback(() => {
    setSection('menu');
    setSafeLinkText('');
    setFromDigitalSafety(false);
    appliedOpenSection.current = undefined;
    navigation?.setParams?.({openSection: undefined, safeLinkText: undefined});
  }, [navigation]);

  const openSection = useCallback(
    (id: HubSection, opts?: {fromDigitalSafety?: boolean}) => {
      setFromDigitalSafety(!!opts?.fromDigitalSafety);
      setSection(id);
      appliedOpenSection.current = id;
      // Keep route params in sync so focus effect won't snap back to a stale section.
      navigation?.setParams?.({openSection: id === 'menu' ? undefined : id});
    },
    [navigation],
  );

  const openLockedFeature = useCallback((title: string, message: string) => {
    setPaywall({title, message});
  }, []);

  const guardFeature = useCallback(
    (feature: FeatureKey, onAllowed: () => void, title: string, message: string) => {
      if (!canUseFeature(feature)) {
        openLockedFeature(title, message);
        return;
      }
      onAllowed();
    },
    [canUseFeature, openLockedFeature],
  );

  /** Correct back: feature → Digital Safety → Hub menu. */
  const goBack = useCallback(() => {
    if (DS_FEATURE_SECTIONS.has(section)) {
      setSafeLinkText('');
      setFromDigitalSafety(false);
      setSection('digital-safety');
      appliedOpenSection.current = 'digital-safety';
      navigation?.setParams?.({openSection: 'digital-safety'});
      return;
    }
    if (
      fromDigitalSafety &&
      (section === 'security-center' ||
        section === 'sim-recovery' ||
        section === 'drive-sync')
    ) {
      setFromDigitalSafety(false);
      setSection('digital-safety');
      appliedOpenSection.current = 'digital-safety';
      navigation?.setParams?.({openSection: 'digital-safety'});
      return;
    }
    goMenu();
  }, [section, fromDigitalSafety, goMenu, navigation]);

  // Apply deep-link / drawer openSection only when the param itself changes.
  useEffect(() => {
    const target = route?.params?.openSection;
    if (target === 'digital-safety') {
      navigation?.navigate?.('Digital Safety');
      navigation?.setParams?.({openSection: undefined});
      appliedOpenSection.current = undefined;
      return;
    }
    if (target === appliedOpenSection.current) {
      return;
    }
    appliedOpenSection.current = target;
    if (target && target !== 'menu') {
      setFromDigitalSafety(false);
      setSection(target);
    }
  }, [route?.params?.openSection, navigation]);

  useEffect(() => {
    const text = route?.params?.safeLinkText?.trim();
    if (!text) return;
    setSafeLinkText(text);
    setFromDigitalSafety(true);
    setSection('safe-link');
    appliedOpenSection.current = 'safe-link';
    navigation?.setParams?.({safeLinkText: undefined});
  }, [navigation, route?.params?.safeLinkText]);

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        if (section === 'menu') return false;
        goBack();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
      return () => sub.remove();
    }, [section, goBack]),
  );

  useEffect(() => {
    if (!CIRCLE_ENABLED) {
      return;
    }
    if (peekPendingCircleInvite()) {
      openSection('circle');
    }
    return subscribeCircleInvite(() => {
      openSection('circle');
    });
  }, [openSection]);

  useEffect(() => {
    if (!CIRCLE_ENABLED && section === 'circle') {
      goMenu();
    }
  }, [section, goMenu]);

  const handleDigitalSafetyNav = useCallback(
    (dest: DigitalSafetyDestination) => {
      switch (dest) {
        case 'safe-link':
          setSafeLinkText('');
          openSection('safe-link', {fromDigitalSafety: true});
          break;
        case 'qr':
          openSection('qr-scan', {fromDigitalSafety: true});
          break;
        case 'scam':
          openSection('scam-check', {fromDigitalSafety: true});
          break;
        case 'security-center':
          setSecurityCenterTab('ADVISOR');
          openSection('security-center', {fromDigitalSafety: true});
          break;
        case 'lost-mobile':
          setSecurityCenterTab('FRAUD');
          openSection('security-center', {fromDigitalSafety: true});
          break;
        case 'sim-recovery':
          openSection('sim-recovery', {fromDigitalSafety: true});
          break;
        case 'drive-sync':
          openSection('drive-sync', {fromDigitalSafety: true});
          break;
        case 'emergency-card':
          openSection('emergency-card', {fromDigitalSafety: true});
          break;
        case 'secure-vault':
          guardFeature(
            'digitalsafe.secure_vault',
            () => openSection('secure-vault', {fromDigitalSafety: true}),
            'Premium required',
            'Secure Vault is available on Premium, Family, and Enterprise plans.',
          );
          break;
        case 'timeline':
          navigation?.navigate?.('Security', {initialTab: 'TIMELINE'});
          break;
        case 'network-guardian':
          guardFeature(
            'digitalsafe.network_guardian',
            () => openSection('network-guardian-screen', {fromDigitalSafety: true}),
            'Premium required',
            'Network Guardian is available on Premium, Family, and Enterprise plans.',
          );
          break;
        case 'cellular':
          guardFeature(
            'digitalsafe.cellular_monitor',
            () => openSection('cellular-security', {fromDigitalSafety: true}),
            'Basic required',
            'Cellular monitoring is available on Basic and higher plans.',
          );
          break;
        case 'automation':
          openSection('automation-settings', {fromDigitalSafety: true});
          break;
        default:
          break;
      }
    },
    [guardFeature, navigation, openLockedFeature, openSection],
  );

  if (section === 'digital-safety') {
    navigation?.navigate?.('Digital Safety');
    goMenu();
    return null;
  }

  if (section === 'safe-link') {
    return (
      <HubSectionShell title="Safe Link" styles={styles} onBack={goBack}>
        <SafeLinkResultScreen
          initialText={safeLinkText}
          embedded
          onBack={goBack}
        />
      </HubSectionShell>
    );
  }

  if (section === 'network-guardian-screen') {
    return (
      <HubSectionShell title="Network Guardian" styles={styles} onBack={goBack}>
        <NetworkGuardianScreen embedded onBack={goBack} />
      </HubSectionShell>
    );
  }

  if (section === 'scam-check') {
    return (
      <HubSectionShell title="Scam Check" styles={styles} onBack={goBack}>
        <ScamCheckScreen embedded onBack={goBack} />
      </HubSectionShell>
    );
  }

  if (section === 'qr-scan') {
    return (
      <HubSectionShell title="QR Protection" styles={styles} onBack={goBack}>
        <QrScannerScreen embedded onBack={goBack} />
      </HubSectionShell>
    );
  }

  if (section === 'cellular-security') {
    return (
      <HubSectionShell title="Cellular Security" styles={styles} onBack={goBack}>
        <CellularSecurityScreen embedded onBack={goBack} />
      </HubSectionShell>
    );
  }

  if (section === 'automation-settings') {
    return (
      <HubSectionShell title="Automation" styles={styles} onBack={goBack}>
        <AutomationSettingsScreen embedded onBack={goBack} />
      </HubSectionShell>
    );
  }

  if (section === 'emergency-card') {
    return (
      <HubSectionShell title="Emergency Card" styles={styles} onBack={goBack}>
        <EmergencyCardScreen embedded onBack={goBack} />
      </HubSectionShell>
    );
  }

  if (section === 'secure-vault') {
    return (
      <HubSectionShell title="Secure Vault" styles={styles} onBack={goBack}>
        <SecureVaultScreen embedded onBack={goBack} />
      </HubSectionShell>
    );
  }

  if (section === 'security-center') {
    return (
      <HubSectionShell
        title={fromDigitalSafety ? 'Digital Safety · Tools' : 'Security Center'}
        styles={styles}
        onBack={goBack}>
        <SecurityCenterScreen onLostMobileLocate={() => openSection('drive-sync')} />
      </HubSectionShell>
    );
  }

  if (section === 'about') {
    return (
      <HubSectionShell title="About MRP" styles={styles} onBack={goBack}>
        <AboutScreen />
      </HubSectionShell>
    );
  }

  if (section === 'policy') {
    return (
      <HubSectionShell title="Policy" styles={styles} onBack={goBack}>
        <PolicyScreen />
      </HubSectionShell>
    );
  }

  if (section === 'account') {
    return (
      <HubSectionShell title="Account" styles={styles} onBack={goBack}>
        <AccountScreen onBack={goMenu} />
      </HubSectionShell>
    );
  }

  if (section === 'sim-recovery') {
    return (
      <HubSectionShell title="SIM Recovery" styles={styles} onBack={goBack}>
        <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
          <SimRecoveryPanel onUpgrade={() => openSection('subscriptions')} />
        </ScrollView>
      </HubSectionShell>
    );
  }

  if (section === 'subscriptions') {
    return (
      <HubSectionShell title="Subscriptions" styles={styles} onBack={goBack}>
        <SubscriptionScreen onBack={goMenu} />
      </HubSectionShell>
    );
  }

  if (section === 'circle') {
    if (!CIRCLE_ENABLED) {
      return null;
    }
    return (
      <HubSectionShell title="Circle" styles={styles} onBack={goBack}>
        <CircleScreen onUpgrade={() => openSection('subscriptions')} />
      </HubSectionShell>
    );
  }

  if (section === 'drive-sync') {
    return (
      <HubSectionShell title="Drive Sync" styles={styles} onBack={goBack}>
        <DriveSyncScreen
          onUpgrade={() => openSection('subscriptions')}
          onBack={fromDigitalSafety ? goBack : goMenu}
        />
      </HubSectionShell>
    );
  }

  if (section === 'geofence') {
    return (
      <HubSectionShell title="Geofence" styles={styles} onBack={goBack}>
        <GeofenceScreen onUpgrade={() => openSection('subscriptions')} />
      </HubSectionShell>
    );
  }

  if (section === 'emergency-monitoring') {
    return (
      <HubSectionShell title="Travel" styles={styles} onBack={goBack}>
        <EmergencyMonitoringScreen onUpgrade={() => openSection('subscriptions')} />
      </HubSectionShell>
    );
  }

  if (section === 'promotions' || section === 'affiliates') {
    return (
      <HubSectionShell
        title={section === 'promotions' ? 'Promotions' : 'Affiliates'}
        styles={styles}
        onBack={goBack}>
        <PromoLinksScreen kind={section} />
      </HubSectionShell>
    );
  }

  if (section !== 'menu') {
    const item = MENU_ITEMS.find(m => m.id === section);
    return (
      <SafeAreaView style={styles.safe}>
        <HubTitleBar title={item?.title ?? 'Hub'} styles={styles} onBack={goBack} />
        <ScrollView contentContainerStyle={styles.scrollPad}>
          <PlaceholderBody
            title={item?.title ?? 'Hub'}
            body="This section is not available yet."
            styles={styles}
            colors={colors}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.menuScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.brandHero}>
          <Image source={brandImages.logoMark} style={styles.brandLogo} resizeMode="contain" />
          <Text style={styles.brandName}>{brandCopy.name}</Text>
          <Text style={styles.brandFull}>{brandCopy.fullName}</Text>
          <Text style={styles.brandTagline}>{brandCopy.tagline}</Text>
          <Text style={styles.brandPillars}>{brandCopy.pillars}</Text>
        </View>

        <Text style={styles.sectionLabel}>Key features</Text>
        <View style={styles.featureGrid}>
          {(
            [
              {
                id: 'f-protect',
                title: 'Device Protection',
                iconSource: brandImages.features.deviceProtection,
                action: () => navigation?.navigate?.('Digital Safety'),
              },
              {
                id: 'f-live',
                title: 'Travel',
                iconSource: brandImages.features.liveLocation,
                action: () => openSection('emergency-monitoring'),
              },
              {
                id: 'f-drive',
                title: 'Drive Backup',
                iconSource: brandImages.features.driveBackup,
                action: () => openSection('drive-sync'),
              },
              {
                id: 'f-sim',
                title: 'SIM Recovery',
                iconSource: brandImages.features.simAlert,
                action: () => openSection('sim-recovery'),
              },
              {
                id: 'f-selfie',
                title: 'Unlock Selfie',
                iconSource: brandImages.features.unlockSelfie,
                action: () => navigation?.navigate?.('Security', {initialTab: 'PHOTOS'}),
              },
              {
                id: 'f-geo',
                title: 'Geofencing',
                iconSource: brandImages.features.geofencing,
                action: () => openSection('geofence'),
              },
              {
                id: 'f-lock',
                title: 'Remote Lock',
                iconSource: brandImages.features.remoteLock,
                action: () => {
                  setSecurityCenterTab('FRAUD');
                  openSection('security-center');
                },
              },
              {
                id: 'f-timeline',
                title: 'Activity',
                iconSource: brandImages.features.activityTimeline,
                action: () => navigation?.navigate?.('Security', {initialTab: 'TIMELINE'}),
              },
            ] as FeatureTile[]
          ).map((tile, index) => (
            <HubMenuCard
              key={tile.id}
              index={index}
              title={tile.title}
              iconSource={tile.iconSource}
              colors={colors}
              variant="tile"
              onPress={tile.action}
            />
          ))}
        </View>

        <Text style={[styles.sectionLabel, {marginTop: spacing.lg}]}>More services</Text>
        {MENU_ITEMS.map((item, index) => (
          <HubMenuCard
            key={item.id}
            index={index}
            title={item.title}
            subtitle={item.subtitle}
            icon={item.icon}
            iconSource={item.iconSource}
            badge={item.badge}
            colors={colors}
            onPress={() => {
              openSection(item.id);
            }}
          />
        ))}
        <Text style={styles.driveFooter}>{brandCopy.driveFooter}</Text>
      </ScrollView>
      <PaywallModal
        visible={!!paywall}
        title={paywall?.title}
        message={paywall?.message || ''}
        onClose={() => setPaywall(null)}
        onUpgrade={() => {
          setPaywall(null);
          openSection('subscriptions');
        }}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    safe: {flex: 1, backgroundColor: colors.bg},
    menuScroll: {padding: spacing.lg, paddingBottom: spacing.xxl},
    scrollPad: {padding: spacing.lg, paddingBottom: spacing.xxl},
    brandHero: {
      alignItems: 'center',
      marginBottom: spacing.xl,
      paddingTop: spacing.sm,
    },
    brandLogo: {width: 120, height: 96, marginBottom: spacing.sm},
    brandName: {
      fontSize: 36,
      fontWeight: '900',
      color: colors.textPrimary,
      letterSpacing: 1,
    },
    brandFull: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
      letterSpacing: 1.2,
      marginTop: 2,
    },
    brandTagline: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.sky,
      marginTop: spacing.sm,
      textAlign: 'center',
    },
    brandPillars: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 4,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 1,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
    },
    featureGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -4,
      marginBottom: spacing.md,
    },
    driveFooter: {
      textAlign: 'center',
      fontSize: 12,
      color: colors.textMuted,
      marginTop: spacing.lg,
      fontWeight: '600',
    },
    subHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
      backgroundColor: colors.surface,
      gap: spacing.sm,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
    },
    backText: {fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginTop: -2},
    subTitle: {flex: 1, fontSize: 17, fontWeight: '800', color: colors.textPrimary},
    sectionBody: {flex: 1},
    placeholderCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    placeholderTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    placeholderBody: {fontSize: 15, lineHeight: 22},
  });
}
