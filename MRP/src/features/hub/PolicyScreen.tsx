import React, {useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

const SECTIONS: {title: string; body: string[]}[] = [
  {
    title: 'Privacy policy (summary)',
    body: [
      'MRP (Mobile Recovery & Protection) is a personal device-security app. Your security data — timeline events, intruder selfies, geofence state, and location used for those features — stays on your device by default.',
      'If you turn on Drive Sync, an encrypted copy of your vault is stored only in your private Google Drive appData folder and can be unlocked with your PIN on your phone or in MRP Web. MRP does not sell your data and does not keep a readable copy of your vault on MRP servers.',
      'Optional Google sign-in is used for account features and sync policy (Firebase). MRP does not use your Google account to list or read your personal Drive files outside the app-owned folder.',
    ],
  },
  {
    title: 'Google Play Data Safety alignment',
    body: [
      'Location (precise / approximate): collected when you grant location and enable monitoring, geofence, panic, SIM recovery SMS, or emergency / find-my-device. Used for app functionality and security. Not shared with MRP as raw GPS streams; optional encrypted Drive backup only.',
      'Photos: front-camera selfies on security events you configure. Stored on device; Premium+ may sync encrypted copies to your Drive vault.',
      'App activity: optional usage / risk signals for App Usage and Home security posture. On-device unless included in an encrypted vault you enable.',
      'Device or other IDs: Firebase Auth UID when signed in, for account management and sync policy. Crash / diagnostics may use Google services if enabled in a future build.',
      'Not collected by MRP cloud: multi-user Circle live share (disabled in v1), admin download of vault bytes, or broad Drive file listing.',
    ],
  },
  {
    title: 'Permissions & why we ask',
    body: [
      'Location (foreground): show current place, timeline addresses, geofence distance, Panic / SIM recovery SMS location, and Maps links.',
      'Location (background / “all the time”): only after in-app disclosure, for geofence enter/exit and emergency / find-my-device while the screen is off. You can revoke this in Android Settings or turn features off in Hub.',
      'Camera: optional intruder selfies on events you enable (e.g. wrong unlock).',
      'Notifications: monitoring alerts and service status.',
      'SMS (send): Panic and SIM change recovery messages to contacts you choose — not for reading your inbox.',
      'Nearby devices / Bluetooth: detect Bluetooth on/off and related security timeline events.',
      'Usage access (optional): App Usage insights and risk hints.',
      'Display over other apps / Device admin / Battery unrestricted: keep monitoring reliable after OEM kills; you control these in Security → Permissions.',
    ],
  },
  {
    title: 'Background location (Play declaration)',
    body: [
      'MRP uses background location only when you enable geofence monitoring and/or emergency / find-my-device tracking.',
      'Purpose: detect when the device enters or leaves zones you define, and provide delayed locate via encrypted Drive vault when you request find-my-device from the web console.',
      'Location is not sold and is not uploaded to MRP as a continuous public live feed in v1. Encrypted vault sync (if enabled) writes to your Drive app folder only.',
    ],
  },
  {
    title: 'User controls & deletion',
    body: [
      'Turn off monitoring, geofence, emergency tracking, or Drive Sync anytime in the app (Security Setup, Hub → Geofence, Hub → Drive Sync).',
      'Revoke OS permissions in Android Settings → Apps → MRP.',
      'Clear timeline / soft wipe options remove local security history where offered in-app.',
      'Disconnect Google and delete Firebase-linked account data by signing out and requesting account deletion via support if you used cloud account features.',
      'Encrypted Drive vault files remain in your Google Drive appData until you delete them from Google’s Drive storage or wipe via in-app controls.',
    ],
  },
  {
    title: 'Children & Families',
    body: [
      'MRP is intended for adults managing their own devices. It is not directed at children under 13 and is not designed as a parental-control / child-tracking product for Google Play Families policies.',
      'Do not use MRP to monitor another person without their knowledge and lawful consent.',
    ],
  },
  {
    title: 'Security practices',
    body: [
      'Drive vault: AES-GCM with a key derived from your PIN (PBKDF2). Decrypt happens on your device or browser; MRP servers do not hold the plaintext vault.',
      'Firebase holds authentication and sync policy configuration. Raw GPS event feeds intended for multi-user live share are not used in the v1 Drive-only release.',
      'API access requires a valid Firebase ID token and ownership checks. “No one can hack through MRP” is a hardening goal, not an absolute guarantee — stolen PIN or a compromised device remain out of scope.',
    ],
  },
  {
    title: 'Store listing & contact',
    body: [
      'This in-app policy matches the Play Data Safety and privacy claims used for MRP’s store listing (Drive-only locate, Circle live share off in v1).',
      'For privacy questions or deletion requests, use the contact email published on the Google Play store listing for MRP.',
      'Policy version aligns with app version 1.0.0 (Play v1). We will update this screen when collection or sharing practices change.',
    ],
  },
];

export function PolicyScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.lead}>
        Policies for Google Play publishing: privacy, data safety, permissions, and user controls.
        Same commitments as our Play Console declarations.
      </Text>
      {SECTIONS.map(section => (
        <View key={section.title} style={styles.card}>
          <Text style={styles.title}>{section.title}</Text>
          {section.body.map((para, i) => (
            <Text key={i} style={styles.body}>
              {para}
            </Text>
          ))}
        </View>
      ))}
      <Text style={styles.footer}>Last updated: July 2026</Text>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    scroll: {flex: 1, backgroundColor: colors.bg},
    content: {padding: spacing.lg, paddingBottom: spacing.xxl},
    lead: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textBody,
      marginBottom: spacing.lg,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    body: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.textBody,
      marginBottom: spacing.sm,
    },
    footer: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
  });
}
