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
import {setSecurityCenterTab} from '../security-center/securityCenterNav';
import {brandImages, brandCopy} from '../../assets/brand';

export type DigitalSafetyDestination =
  | 'safe-link'
  | 'network-guardian'
  | 'scam'
  | 'qr'
  | 'cellular'
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
};

/** Unique DS tools only — Hub key features cover Drive / SIM / Live Location. */
const ITEMS: HubItem[] = [
  {
    id: 'safe-link',
    title: 'Safe Link',
    subtitle: 'Check URLs before you open',
    icon: '🔗',
    section: 'PROTECT',
  },
  {
    id: 'qr',
    title: 'QR Protection',
    subtitle: 'Scan & preview destinations',
    iconSource: brandImages.features.unlockSelfie,
    section: 'PROTECT',
  },
  {
    id: 'scam',
    title: 'Scam Check',
    subtitle: 'Paste suspicious messages (Tools)',
    icon: '⚠️',
    section: 'PROTECT',
  },
  {
    id: 'security-center',
    title: 'Security Advisor',
    subtitle: 'Device posture & app risk',
    iconSource: brandImages.features.deviceProtection,
    section: 'MONITOR',
  },
  {
    id: 'timeline',
    title: 'Security Timeline',
    subtitle: 'All protection events',
    iconSource: brandImages.features.activityTimeline,
    section: 'MONITOR',
  },
  {
    id: 'emergency-card',
    title: 'Emergency Card',
    subtitle: 'ICE info for emergencies',
    icon: '🆘',
    section: 'RECOVER',
  },
  {
    id: 'lost-mobile',
    title: 'Lost Mobile',
    subtitle: 'Locate, lock & recovery tools',
    iconSource: brandImages.features.remoteLock,
    section: 'RECOVER',
  },
  {
    id: 'secure-vault',
    title: 'Secure Vault',
    subtitle: 'Encrypted documents & notes',
    icon: '🔐',
    section: 'SECURE',
  },
];

const SECTIONS = ['PROTECT', 'MONITOR', 'RECOVER', 'SECURE'] as const;

const FOOTER_COPY =
  'Checks links you paste or share to MRP. Does not scan links opened in other apps unless you share them.';

export function DigitalSafetyHubScreen({
  onNavigate,
}: {
  onNavigate: (dest: DigitalSafetyDestination) => void;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handlePress = (item: HubItem) => {
    if (item.id === 'scam') {
      setSecurityCenterTab('TOOLS');
    }
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
              {sectionItems.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.card}
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
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
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
