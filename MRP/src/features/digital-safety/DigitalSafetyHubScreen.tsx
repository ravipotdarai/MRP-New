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
import {QR_PROTECTION_ENABLED} from '../../config/featureFlags';

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
  section: SectionId;
  /** Capability that must be unlocked to open (omit = free / always). */
  capability?: DigitalSafetyCapability;
};

type SectionId = 'CHECK' | 'NETWORK' | 'HEALTH' | 'LOST';

type SectionMeta = {
  id: SectionId;
  label: string;
  purpose: string;
};

/** Unique DS tools only — Drive Sync and SIM Recovery live under Hub. */
const ITEMS: HubItem[] = [
  {
    id: 'safe-link',
    title: 'Safe Link',
    subtitle: 'Paste a URL — see if it looks risky before you open it',
    icon: '🔗',
    section: 'CHECK',
  },
  {
    id: 'scam',
    title: 'Scam Check',
    subtitle: 'Paste a suspicious SMS or message (MRP does not read your inbox)',
    icon: '⚠️',
    section: 'CHECK',
  },
  {
    id: 'qr',
    title: 'QR Protection',
    subtitle: 'Preview where a QR goes before your browser opens it',
    iconSource: brandImages.features.unlockSelfie,
    section: 'CHECK',
  },
  {
    id: 'network-guardian',
    title: 'Network Guardian',
    subtitle: 'Block ad / tracker / threat domain categories (DNS only)',
    icon: '🛡️',
    section: 'NETWORK',
    capability: 'networkGuardian',
  },
  {
    id: 'cellular',
    title: 'Cellular Security',
    subtitle: 'Watch for odd SIM / carrier signals (not fake-tower proof)',
    icon: '📶',
    section: 'NETWORK',
    capability: 'cellularMonitor',
  },
  {
    id: 'security-center',
    title: 'Security Advisor',
    subtitle: 'Device posture score and risky-app heuristics',
    iconSource: brandImages.features.deviceProtection,
    section: 'HEALTH',
  },
  {
    id: 'timeline',
    title: 'Activity',
    subtitle: 'Safety events from scans and tools on this phone',
    iconSource: brandImages.features.activityTimeline,
    section: 'HEALTH',
  },
  {
    id: 'automation',
    title: 'Automation',
    subtitle: 'Clipboard opt-in, breach watch, and policy-safe scans',
    icon: '⚙️',
    section: 'HEALTH',
  },
  {
    id: 'emergency-card',
    title: 'Emergency Card',
    subtitle: 'ICE info on this phone + Android Emergency Info',
    icon: '🆘',
    section: 'LOST',
  },
  {
    id: 'lost-mobile',
    title: 'Lost Mobile',
    subtitle: 'Locate / lock tips and cybercrime report links',
    iconSource: brandImages.features.remoteLock,
    section: 'LOST',
    capability: 'lostMobile',
  },
  {
    id: 'secure-vault',
    title: 'Secure Vault',
    subtitle: 'Encrypted notes & docs stored on this device',
    icon: '🔐',
    section: 'LOST',
    capability: 'secureVault',
  },
];

const SECTIONS: SectionMeta[] = [
  {
    id: 'CHECK',
    label: 'Check before you trust',
    purpose: 'Links, SMS text, and QR codes you paste or scan here',
  },
  {
    id: 'NETWORK',
    label: 'Network & SIM',
    purpose: 'Optional filters and carrier anomaly signals',
  },
  {
    id: 'HEALTH',
    label: 'Phone health',
    purpose: 'Posture, risky apps, and automation settings',
  },
  {
    id: 'LOST',
    label: 'If the phone is lost',
    purpose: 'ICE card, recovery links, and on-device vault',
  },
];

const FOOTER_COPY =
  'Safety checks what you paste or share into MRP. It does not scan links you open in other apps unless you share them here. Monitoring (locks, USB, SIM events) is under the Security tab.';

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
          <Text style={styles.heroTitle}>Safety</Text>
          <Text style={styles.heroTagline}>{brandCopy.tagline}</Text>
          <Text style={styles.heroSub}>
            Scam checks and recovery tools — not the same as Security monitoring
          </Text>
        </View>

        {SECTIONS.map(section => {
          const sectionItems = ITEMS.filter(
            i =>
              i.section === section.id &&
              (i.id !== 'qr' || QR_PROTECTION_ENABLED),
          );
          if (sectionItems.length === 0) return null;
          return (
            <View key={section.id} style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>{section.label}</Text>
              <Text style={styles.sectionPurpose}>{section.purpose}</Text>
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
    hero: {alignItems: 'center', alignSelf: 'center', width: '100%', marginBottom: spacing.lg},
    heroLogo: {width: 96, height: 78, marginBottom: spacing.sm},
    heroTitle: {
      fontSize: 22,
      fontWeight: '900',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    heroTagline: {
      fontSize: 16,
      fontWeight: '700',
      color: brandColors.googleBlue,
      textAlign: 'center',
    },
    heroSub: {
      marginTop: spacing.sm,
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: spacing.sm,
    },
    sectionBlock: {marginBottom: spacing.lg},
    sectionLabel: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    sectionPurpose: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      marginBottom: spacing.sm,
      lineHeight: 16,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    cardLocked: {opacity: 0.85},
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: brandColors.iconBg || colors.skySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
      overflow: 'hidden',
    },
    icon: {fontSize: 22},
    iconImg: {width: 48, height: 48, borderRadius: 14},
    cardText: {flex: 1},
    cardTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
    cardSub: {fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18},
    lockBadge: {
      marginTop: 4,
      fontSize: 11,
      fontWeight: '800',
      color: brandColors.googleBlue,
    },
    chevron: {fontSize: 22, color: colors.textMuted, marginLeft: spacing.sm},
    footer: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
      marginTop: spacing.sm,
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
