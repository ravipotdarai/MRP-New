import React, {useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  type ImageSourcePropType,
} from 'react-native';
import {ColorPalette, spacing, radius, brandColors} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {brandImages, brandCopy} from '../../assets/brand';
import {useEntitlements} from '../../services/entitlements/EntitlementProvider';
import {
  minPlanLabelForCapability,
  type DigitalSafetyCapability,
} from '../../services/entitlements/DigitalSafetyCapabilityMatrix';

export type DigitalSafetyDestination =
  | 'safe-link'
  | 'network-guardian'
  | 'scam'
  | 'qr'
  | 'cellular'
  | 'automation'
  | 'timeline'
  | 'emergency-card'
  | 'sim-recovery'
  | 'lost-mobile'
  | 'secure-vault'
  | 'drive-sync'
  | 'security-center';

type HubItem = {
  id: DigitalSafetyDestination;
  title: string;
  subtitle: string;
  icon?: string;
  iconSource?: ImageSourcePropType;
  section: 'PROTECT' | 'MONITOR' | 'RECOVER' | 'SECURE';
  /** Capability that must be unlocked to open (omit = free / always). */
  capability?: DigitalSafetyCapability;
};

/** Unique DS tools only — Drive Sync and SIM Recovery live under Hub. */
const ITEMS: HubItem[] = [
  {
    id: 'safe-link',
    title: 'Safe Link',
    subtitle: 'Check URLs you paste or share to MRP',
    icon: '🔗',
    section: 'PROTECT',
  },
  {
    id: 'network-guardian',
    title: 'Network Guardian',
    subtitle: 'Ad, tracker, and threat category lists',
    icon: '🛡️',
    section: 'PROTECT',
    capability: 'networkGuardian',
  },
  {
    id: 'qr',
    title: 'QR Protection',
    subtitle: 'Scan & preview destinations before opening',
    iconSource: brandImages.features.unlockSelfie,
    section: 'PROTECT',
  },
  {
    id: 'scam',
    title: 'Scam Check',
    subtitle: 'Paste suspicious messages — MRP does not read your inbox',
    icon: '⚠️',
    section: 'PROTECT',
  },
  {
    id: 'cellular',
    title: 'Cellular Security',
    subtitle: 'SIM and carrier anomaly signals (not fake-tower proof)',
    icon: '📶',
    section: 'PROTECT',
    capability: 'cellularMonitor',
  },
  {
    id: 'automation',
    title: 'Automation',
    subtitle: 'Clipboard opt-in, breach watch, and policy-safe scans',
    icon: '⚙️',
    section: 'MONITOR',
  },
  {
    id: 'security-center',
    title: 'Security Advisor',
    subtitle: 'Device posture & app risk heuristics',
    iconSource: brandImages.features.deviceProtection,
    section: 'MONITOR',
  },
  {
    id: 'timeline',
    title: 'Activity',
    subtitle: 'Protection and monitoring events',
    iconSource: brandImages.features.activityTimeline,
    section: 'MONITOR',
  },
  {
    id: 'emergency-card',
    title: 'Emergency Card',
    subtitle: 'ICE info on-device + Android Emergency Info link',
    icon: '🆘',
    section: 'RECOVER',
  },
  {
    id: 'lost-mobile',
    title: 'Lost Mobile',
    subtitle: 'Locate, lock & recovery tools',
    iconSource: brandImages.features.remoteLock,
    section: 'RECOVER',
    capability: 'lostMobile',
  },
  {
    id: 'secure-vault',
    title: 'Secure Vault',
    subtitle: 'Encrypted documents & notes on this device',
    icon: '🔐',
    section: 'SECURE',
    capability: 'secureVault',
  },
];

const SECTIONS = ['PROTECT', 'MONITOR', 'RECOVER', 'SECURE'] as const;

const FOOTER_COPY =
  'Checks links you paste or share to MRP. Does not scan links opened in other apps unless you share them. Network Guardian uses DNS filtering only — not HTTPS content inspection.';

export function DigitalSafetyHubScreen({
  onNavigate,
}: {
  onNavigate: (dest: DigitalSafetyDestination) => void;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {canUseDsCapability} = useEntitlements();

  const handlePress = (item: HubItem) => {
    onNavigate(item.id);
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image source={brandImages.logoMark} style={styles.heroLogo} resizeMode="contain" />
          <Text style={styles.heroTagline}>{brandCopy.tagline}</Text>
          <Text style={styles.heroSub}>{brandCopy.pillars} · Secure</Text>
        </View>

        {SECTIONS.map(section => {
          const sectionItems = ITEMS.filter(i => i.section === section);
          if (sectionItems.length === 0) return null;
          return (
            <View key={section} style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>{section}</Text>
              {sectionItems.map(item => {
                const locked =
                  !!item.capability && !canUseDsCapability(item.capability);
                const plan = item.capability
                  ? minPlanLabelForCapability(item.capability)
                  : null;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.card, locked && styles.cardLocked]}
                    activeOpacity={0.85}
                    onPress={() => handlePress(item)}>
                    <View style={styles.iconWrap}>
                      {item.iconSource ? (
                        <Image source={item.iconSource} style={styles.iconImg} />
                      ) : (
                        <Text style={styles.icon}>{item.icon}</Text>
                      )}
                    </View>
                    <View style={styles.cardText}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardSub}>{item.subtitle}</Text>
                      {locked && plan ? (
                        <Text style={styles.lockBadge}>{plan} plan</Text>
                      ) : null}
                    </View>
                    <Text style={styles.chevron}>{locked ? '🔒' : '›'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}

        <Text style={styles.footer}>{FOOTER_COPY}</Text>
        <Text style={styles.driveFooter}>{brandCopy.driveFooter}</Text>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    scroll: {padding: spacing.lg, paddingBottom: spacing.xxl},
    hero: {alignItems: 'center', marginBottom: spacing.lg},
    heroLogo: {width: 72, height: 58, marginBottom: spacing.sm},
    heroTagline: {
      fontSize: 16,
      fontWeight: '700',
      color: brandColors.googleBlue,
      textAlign: 'center',
    },
    heroSub: {fontSize: 13, color: colors.textMuted, marginTop: 4},
    sectionBlock: {marginBottom: spacing.lg},
    sectionLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 1,
      marginBottom: spacing.sm,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    cardLocked: {opacity: 0.92, borderColor: colors.amber},
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: brandColors.iconBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
      overflow: 'hidden',
    },
    iconImg: {width: 44, height: 44},
    icon: {fontSize: 22},
    cardText: {flex: 1},
    cardTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
    cardSub: {fontSize: 13, color: colors.textMuted, marginTop: 2},
    lockBadge: {
      marginTop: 4,
      fontSize: 11,
      fontWeight: '800',
      color: colors.amber,
    },
    chevron: {fontSize: 22, color: colors.textMuted, marginLeft: 8},
    footer: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
      marginTop: spacing.md,
      fontStyle: 'italic',
    },
    driveFooter: {
      textAlign: 'center',
      fontSize: 12,
      color: colors.textMuted,
      marginTop: spacing.md,
      fontWeight: '600',
    },
  });
}
