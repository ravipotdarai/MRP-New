import React, {useEffect, useMemo, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {ColorPalette, spacing, radius} from '../shared/theme';
import {useTheme} from '../shared/ThemeContext';

const VERSION = '1.0.0';

const MOMENTS = [
  {
    when: 'Wrong PIN at the lock screen',
    then: 'MRP can capture a selfie and log where it happened — evidence on your phone, not a cloud dashboard.',
    accent: 'sky' as const,
  },
  {
    when: 'Someone swaps or removes the SIM',
    then: 'Recovery contacts you chose can get an SMS with location — even when Wi‑Fi is gone.',
    accent: 'amber' as const,
  },
  {
    when: 'USB plugged in while locked',
    then: 'A silent security event (and optional selfie) so you know if the phone was connected elsewhere.',
    accent: 'emerald' as const,
  },
  {
    when: 'Wi‑Fi / Bluetooth / geofence change',
    then: 'Timeline records radio and zone enter/exit events; optional Drive vault sync keeps a private backup.',
    accent: 'violet' as const,
  },
];

const LAYERS = [
  {
    step: '01',
    title: 'Watch',
    body: 'Setup arms monitoring for unlock, SIM, network, USB, installs, Wi‑Fi, Bluetooth, and geofence.',
  },
  {
    step: '02',
    title: 'Capture',
    body: 'Selfies and timeline entries stay on-device. Misuse rules can add Timeline alerts.',
  },
  {
    step: '03',
    title: 'Sync (optional)',
    body: 'Hub → Drive Sync encrypts a vault to your Google Drive appData folder. Firebase holds sync policy only.',
  },
  {
    step: '04',
    title: 'Review',
    body: 'Home, Timeline, Photos, App Usage, and web (MRP Web) help you decide what to do next.',
  },
];

const HOW_TO_USE = [
  {
    step: '1',
    title: 'Finish setup once',
    where: 'Security → Setup → Grant All Access',
    body: 'Allow camera, location, notifications, Nearby devices (Bluetooth), overlay, device admin, and battery unrestricted.',
  },
  {
    step: '2',
    title: 'Arm monitoring',
    where: 'Security → Setup',
    body: 'Flip the master switch. Choose which events capture selfies. Configure misuse rules on the same screen.',
  },
  {
    step: '3',
    title: 'Permissions detail',
    where: 'Security → Permissions',
    body: 'See every permission with grant paths (including Bluetooth Nearby devices and notifications).',
  },
  {
    step: '4',
    title: 'Zones & sync policy',
    where: 'Hub → Geofence · Hub → Drive Sync',
    body: 'Geofence defines zones. Drive Sync backs up the vault and holds Firebase sync policy (wifi/mobile/emergency).',
  },
  {
    step: '5',
    title: 'Circle & SIM (premium / enterprise)',
    where: 'Hub → Circle · Hub → SIM Recovery',
    body: 'Live share with consent, or SMS recovery contacts if the SIM changes.',
  },
  {
    step: '6',
    title: 'Review activity',
    where: 'Home · Security → Timeline / Photos · App Usage',
    body: 'Home status + banners; Timeline/Photos for evidence; App Usage for screen-time share and App Safety posture.',
  },
  {
    step: '7',
    title: 'Web console',
    where: 'https://mobileresilienceplatform.web.app',
    body: 'Sign in with Google, decrypt your Drive vault with PIN, and edit sync policy remotely.',
  },
];

const TRUST = [
  {
    title: 'Built for protection, not surveillance of you',
    body: 'MRP watches for tampering with your device. It does not read your chats, photo library, or SMS inbox.',
  },
  {
    title: 'Your phone + your Drive are the vault',
    body: 'Events stay on-device by default. Optional encrypted Drive appData backup. No vault bytes in Firebase.',
  },
  {
    title: 'You choose how deep it goes',
    body: 'Core needs camera, location, overlay, and device admin. SMS, accessibility, usage access, and Nearby devices are optional add-ons.',
  },
];

export function AboutScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, slide]);

  const accent = (key: 'sky' | 'amber' | 'emerald' | 'violet') => {
    if (key === 'amber') return colors.amber;
    if (key === 'emerald') return colors.emerald;
    if (key === 'violet') return colors.violet;
    return colors.sky;
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Animated.View style={{opacity: fade, transform: [{translateY: slide}]}}>
        <LinearGradient
          colors={[colors.skySoft, colors.surface]}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={styles.hero}>
          <Text style={styles.kicker}>ABOUT</Text>
          <Text style={styles.brand}>MRP</Text>
          <Text style={styles.tagline}>Mobile Resilience Platform</Text>
          <Text style={styles.version}>v{VERSION}</Text>
          <Text style={styles.heroBody}>
            On-device security monitoring with optional encrypted Drive backup, geofence, Circle live
            share, and a private web console — without putting your vault in Firebase.
          </Text>
        </LinearGradient>

        <Text style={styles.sectionLabel}>BUILT FOR MOMENTS LIKE</Text>
        {MOMENTS.map(m => (
          <View key={m.when} style={styles.momentCard}>
            <View style={[styles.momentBar, {backgroundColor: accent(m.accent)}]} />
            <View style={styles.momentBody}>
              <Text style={styles.momentWhen}>{m.when}</Text>
              <Text style={styles.momentThen}>{m.then}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
        {LAYERS.map(layer => (
          <View key={layer.step} style={styles.layerRow}>
            <Text style={styles.layerStep}>{layer.step}</Text>
            <View style={{flex: 1}}>
              <Text style={styles.layerTitle}>{layer.title}</Text>
              <Text style={styles.layerBody}>{layer.body}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionLabel}>HOW TO USE</Text>
        {HOW_TO_USE.map(item => (
          <View key={item.step} style={styles.howCard}>
            <Text style={styles.howStep}>{item.step}</Text>
            <View style={{flex: 1}}>
              <Text style={styles.howTitle}>{item.title}</Text>
              <Text style={styles.howWhere}>{item.where}</Text>
              <Text style={styles.howBody}>{item.body}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionLabel}>TRUST</Text>
        {TRUST.map(t => (
          <View key={t.title} style={styles.trustCard}>
            <Text style={styles.trustTitle}>{t.title}</Text>
            <Text style={styles.trustBody}>{t.body}</Text>
          </View>
        ))}
      </Animated.View>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    content: {padding: spacing.lg, paddingBottom: spacing.xxl * 2},
    hero: {
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    kicker: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: colors.textMuted,
    },
    brand: {
      fontSize: 36,
      fontWeight: '800',
      color: colors.textPrimary,
      marginTop: 4,
    },
    tagline: {fontSize: 15, color: colors.textSecondary, marginTop: 2},
    version: {fontSize: 12, color: colors.textMuted, marginTop: 6},
    heroBody: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textBody,
      marginTop: spacing.md,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
      color: colors.textMuted,
      marginBottom: spacing.sm,
      marginTop: spacing.md,
    },
    momentCard: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      marginBottom: spacing.sm,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    momentBar: {width: 4},
    momentBody: {flex: 1, padding: spacing.md},
    momentWhen: {fontSize: 14, fontWeight: '800', color: colors.textPrimary},
    momentThen: {fontSize: 13, color: colors.textBody, marginTop: 4, lineHeight: 19},
    layerRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.md,
      alignItems: 'flex-start',
    },
    layerStep: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.sky,
      width: 28,
    },
    layerTitle: {fontSize: 15, fontWeight: '800', color: colors.textPrimary},
    layerBody: {fontSize: 13, color: colors.textBody, marginTop: 2, lineHeight: 19},
    howCard: {
      flexDirection: 'row',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    howStep: {
      width: 24,
      height: 24,
      borderRadius: 12,
      textAlign: 'center',
      lineHeight: 24,
      fontWeight: '800',
      color: colors.bg,
      backgroundColor: colors.sky,
      overflow: 'hidden',
      fontSize: 12,
    },
    howTitle: {fontSize: 15, fontWeight: '800', color: colors.textPrimary},
    howWhere: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.sky,
      marginTop: 2,
    },
    howBody: {fontSize: 13, color: colors.textBody, marginTop: 4, lineHeight: 19},
    trustCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    trustTitle: {fontSize: 14, fontWeight: '800', color: colors.textPrimary},
    trustBody: {fontSize: 13, color: colors.textBody, marginTop: 4, lineHeight: 19},
  });
}
