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

/** Real situations MRP is built for — the product goal in plain language. */
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
    when: 'A risky app shows up',
    then: 'Local App Safety flags high-privilege installs and posture issues — heuristics on-device, not an antivirus cloud.',
    accent: 'violet' as const,
  },
];

const LAYERS = [
  {
    step: '01',
    title: 'Watch',
    body: 'Monitoring runs in the background for unlock, SIM, network, USB, and install events.',
  },
  {
    step: '02',
    title: 'Capture',
    body: 'Selfies and timeline entries are written locally the moment something looks wrong.',
  },
  {
    step: '03',
    title: 'Alert',
    body: 'Optional SIM recovery SMS reaches people you trust — you pick the numbers and consent.',
  },
  {
    step: '04',
    title: 'Review',
    body: 'Home, Timeline, Photos, and App Safety show what happened so you decide what to do next.',
  },
];

/** Practical walkthrough — where to tap in the app. */
const HOW_TO_USE = [
  {
    step: '1',
    title: 'Finish setup once',
    where: 'Security → Monitoring → Grant All Access',
    body: 'Allow camera, location, overlay, device admin, and battery unrestricted so monitoring can run while the phone is locked.',
  },
  {
    step: '2',
    title: 'Turn monitoring on',
    where: 'Security → Monitoring',
    body: 'Flip the master switch. Pick which events capture selfies (wrong unlock, USB, SIM, installs, and so on).',
  },
  {
    step: '3',
    title: 'Add recovery contacts (optional)',
    where: 'Security → Monitoring → SIM Recovery',
    body: 'Enable SIM Change Recovery, consent to the sample SMS, and save people who should get an alert if the SIM changes.',
  },
  {
    step: '4',
    title: 'Check what happened',
    where: 'Home · Security → Timeline / Photos',
    body: 'Home shows live status and the latest event. Timeline is the full log; Photos holds intruder selfies matched to events.',
  },
  {
    step: '5',
    title: 'Understand app activity',
    where: 'App Usage → Dashboard / Timeline / Reports',
    body: 'See screen time, interleaved events, and Battery Impact estimates. Open system Battery Usage for official power stats.',
  },
  {
    step: '6',
    title: 'Run App Safety checks',
    where: 'App Usage → Safety (or Home → App Safety)',
    body: 'Scan security health, review risky apps, and toggle misuse rules. Configure App Battery Usage from here if MRP is restricted.',
  },
];

const TRUST = [
  {
    title: 'Built for protection, not surveillance of you',
    body: 'MRP watches for tampering with your device. It does not read your chats, photos library, or SMS inbox.',
  },
  {
    title: 'Your phone is the vault',
    body: 'Security events stay on-device by default. No MRP account. No ad tracking. No silent upload to our servers.',
  },
  {
    title: 'You choose how deep it goes',
    body: 'Core protection needs camera, location, overlay, and device admin. SIM SMS, accessibility, and usage access are optional add-ons.',
  },
];

export function AboutScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 560,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, rise]);

  const accentColor = (key: 'sky' | 'amber' | 'emerald' | 'violet') => {
    if (key === 'amber') return colors.amber;
    if (key === 'emerald') return colors.emerald;
    if (key === 'violet') return colors.violet;
    return colors.sky;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Animated.View style={{opacity: fade, transform: [{translateY: rise}]}}>
        {/* Mission hero */}
        <LinearGradient
          colors={[colors.surface, colors.surfaceAlt, colors.bg]}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={styles.hero}>
          <Text style={styles.eyebrow}>MOBILE RESILIENCE PLATFORM</Text>
          <Text style={styles.heroTitle}>
            If someone tampers with your phone,{'\n'}
            <Text style={styles.heroTitleAccent}>you should know.</Text>
          </Text>
          <Text style={styles.heroSub}>
            MRP exists for one job: keep you in control when the device leaves your
            hands — wrong unlocks, SIM swaps, suspicious plugs, and risky apps —
            with proof that stays on your phone.
          </Text>
          <View style={styles.heroMeta}>
            <Text style={styles.brandMark}>MRP</Text>
            <Text style={styles.heroMetaDot}>·</Text>
            <Text style={styles.heroMetaText}>Stay Sync · Stay Connected</Text>
            <Text style={styles.heroMetaDot}>·</Text>
            <Text style={styles.heroMetaText}>v{VERSION}</Text>
          </View>
        </LinearGradient>

        {/* Goal strip */}
        <View style={styles.goalStrip}>
          <Text style={styles.goalLabel}>THE GOAL</Text>
          <Text style={styles.goalText}>
            Turn silent phone threats into a clear story you can review — selfie,
            place, time, and what changed — so recovery starts with facts, not guesswork.
          </Text>
        </View>

        {/* Moments */}
        <Text style={styles.sectionLabel}>WHEN IT MATTERS</Text>
        <Text style={styles.sectionIntro}>
          These are the moments MRP is designed for. Each one becomes a timeline
          entry you can open later.
        </Text>
        {MOMENTS.map(m => (
          <View key={m.when} style={styles.momentCard}>
            <View
              style={[styles.momentBar, {backgroundColor: accentColor(m.accent)}]}
            />
            <View style={styles.momentBody}>
              <Text style={styles.momentWhen}>{m.when}</Text>
              <Text style={styles.momentThen}>{m.then}</Text>
            </View>
          </View>
        ))}

        {/* How to use */}
        <Text style={[styles.sectionLabel, {marginTop: spacing.xl}]}>
          HOW TO USE MRP
        </Text>
        <Text style={styles.sectionIntro}>
          Follow these steps in order the first time. After that, Home is your
          daily check-in — this guide stays here whenever you need it.
        </Text>
        <View style={styles.guideCard}>
          {HOW_TO_USE.map((item, i) => (
            <View
              key={item.step}
              style={[styles.guideRow, i === HOW_TO_USE.length - 1 && styles.guideRowLast]}>
              <View style={styles.guideStepBadge}>
                <Text style={styles.guideStepNum}>{item.step}</Text>
              </View>
              <View style={styles.guideCopy}>
                <Text style={styles.guideTitle}>{item.title}</Text>
                <Text style={styles.guideWhere}>{item.where}</Text>
                <Text style={styles.guideBody}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* How it works */}
        <Text style={[styles.sectionLabel, {marginTop: spacing.xl}]}>
          HOW PROTECTION FLOWS
        </Text>
        <Text style={styles.sectionIntro}>
          Watch → Capture → Alert → Review. You stay in charge of every permission
          along the way.
        </Text>
        <View style={styles.flowCard}>
          {LAYERS.map((layer, i) => (
            <View
              key={layer.step}
              style={[styles.flowRow, i === LAYERS.length - 1 && styles.flowRowLast]}>
              <Text style={styles.flowStep}>{layer.step}</Text>
              <View style={styles.flowCopy}>
                <Text style={styles.flowTitle}>{layer.title}</Text>
                <Text style={styles.flowBody}>{layer.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Trust */}
        <Text style={[styles.sectionLabel, {marginTop: spacing.xl}]}>
          WHY YOU CAN TRUST THE APPROACH
        </Text>
        {TRUST.map(t => (
          <View key={t.title} style={styles.trustCard}>
            <Text style={styles.trustTitle}>{t.title}</Text>
            <Text style={styles.trustBody}>{t.body}</Text>
          </View>
        ))}

        {/* Promise */}
        <LinearGradient
          colors={[colors.emeraldSoft, colors.skySoft]}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={styles.promise}>
          <Text style={styles.promiseLabel}>OUR PROMISE</Text>
          <Text style={styles.promiseText}>
            Your security events belong to you. Today they live on this device.
            Tomorrow, optional backup would only go to{' '}
            <Text style={styles.promiseEm}>your</Text> Google Drive — never an MRP
            cloud we can browse. We will not sell or advertise with your data.
          </Text>
        </LinearGradient>

        <Text style={styles.footer}>
          Protect the phone. Keep the proof. Stay in control.
        </Text>
      </Animated.View>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: 56,
    },
    hero: {
      borderRadius: radius.xl,
      padding: spacing.xl,
      paddingTop: spacing.xxl,
      paddingBottom: spacing.xxl,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    eyebrow: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.4,
      color: colors.emerald,
      marginBottom: spacing.md,
    },
    heroTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.textPrimary,
      lineHeight: 34,
      marginBottom: spacing.md,
    },
    heroTitleAccent: {
      color: colors.sky,
    },
    heroSub: {
      fontSize: 15,
      lineHeight: 23,
      color: colors.textBody,
      marginBottom: spacing.lg,
    },
    heroMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
    },
    brandMark: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 2,
      color: colors.textPrimary,
    },
    heroMetaDot: {
      color: colors.textMuted,
      fontSize: 13,
    },
    heroMetaText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    goalStrip: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderLeftWidth: 4,
      borderLeftColor: colors.emerald,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      padding: spacing.md,
      marginBottom: spacing.xl,
    },
    goalLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: colors.emerald,
      marginBottom: 6,
    },
    goalText: {
      fontSize: 15,
      lineHeight: 23,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.1,
      color: colors.textMuted,
      marginBottom: 6,
    },
    sectionIntro: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    momentCard: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      marginBottom: spacing.sm,
      overflow: 'hidden',
    },
    momentBar: {
      width: 4,
    },
    momentBody: {
      flex: 1,
      padding: spacing.md,
    },
    momentWhen: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    momentThen: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textBody,
    },
    flowCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
    },
    flowRow: {
      flexDirection: 'row',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
      gap: 12,
    },
    flowRowLast: {
      borderBottomWidth: 0,
    },
    flowStep: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.sky,
      width: 28,
      paddingTop: 2,
    },
    flowCopy: {
      flex: 1,
    },
    flowTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    flowBody: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.textSecondary,
    },
    guideCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
      marginBottom: spacing.sm,
    },
    guideRow: {
      flexDirection: 'row',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
      gap: 12,
    },
    guideRowLast: {
      borderBottomWidth: 0,
    },
    guideStepBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.skySoft,
      borderWidth: 1,
      borderColor: colors.sky,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    guideStepNum: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.sky,
    },
    guideCopy: {
      flex: 1,
    },
    guideTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    guideWhere: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.emerald,
      marginBottom: 6,
    },
    guideBody: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.textSecondary,
    },
    trustCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    trustTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    trustBody: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textBody,
    },
    promise: {
      marginTop: spacing.lg,
      borderRadius: radius.xl,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    promiseLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: colors.emerald,
      marginBottom: 8,
    },
    promiseText: {
      fontSize: 15,
      lineHeight: 23,
      color: colors.textPrimary,
    },
    promiseEm: {
      fontWeight: '800',
      color: colors.sky,
    },
    footer: {
      marginTop: spacing.xl,
      textAlign: 'center',
      fontSize: 14,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.2,
    },
  });
}
