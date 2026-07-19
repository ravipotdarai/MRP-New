import React, {useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {ColorPalette} from '../shared/theme';
import {useTheme} from '../shared/ThemeContext';

export function AboutScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Header with Gradient */}
      <LinearGradient
        colors={[colors.bg, colors.surface, colors.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}>
        <View style={styles.headerContent}>
          <View style={styles.logoBox}>
            <Text style={styles.logo}>🛡️</Text>
          </View>
          <Text style={styles.appName}>MRP Stay Sync</Text>
          <Text style={styles.appTagline}>Your Security, Your Control</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
        </View>
      </LinearGradient>

      {/* Quick Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>100%</Text>
          <Text style={styles.statLabel}>Local Storage</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>0s</Text>
          <Text style={styles.statLabel}>Latency</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>Offline</Text>
          <Text style={styles.statLabel}>First Class</Text>
        </View>
      </View>

      {/* What is MRP */}
      <View style={styles.card}>
        <LinearGradient
          colors={[colors.sky, colors.skyDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardHeaderGradient}>
          <Text style={styles.cardIcon}>🎯</Text>
          <Text style={styles.cardTitle}>What is MRP?</Text>
        </LinearGradient>
        <Text style={styles.cardText}>
          MRP is your personal security companion that gives you complete control over your phone's security.
        </Text>
        <View style={styles.featureGrid}>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>📸</Text>
            <Text style={styles.featureText}>Intruder Selfies</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>📍</Text>
            <Text style={styles.featureText}>GPS Tracking</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>⚡</Text>
            <Text style={styles.featureText}>Instant Alerts</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>📊</Text>
            <Text style={styles.featureText}>Activity Monitor</Text>
          </View>
        </View>
      </View>

      {/* Your Privacy */}
      <View style={styles.card}>
        <LinearGradient
          colors={[colors.emerald, colors.emeraldDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardHeaderGradient}>
          <Text style={styles.cardIcon}>🔒</Text>
          <Text style={styles.cardTitle}>Your Privacy</Text>
        </LinearGradient>
        <Text style={styles.cardText}>Your data security is our priority:</Text>
        <View style={styles.privacyList}>
          <View style={styles.privacyItem}>
            <View style={styles.privacyBullet} />
            <Text style={styles.privacyText}>All data stored locally on device</Text>
          </View>
          <View style={styles.privacyItem}>
            <View style={styles.privacyBullet} />
            <Text style={styles.privacyText}>No data sent to cloud servers</Text>
          </View>
          <View style={styles.privacyItem}>
            <View style={styles.privacyBullet} />
            <Text style={styles.privacyText}>No third-party tracking or analytics</Text>
          </View>
          <View style={styles.privacyItem}>
            <View style={styles.privacyBullet} />
            <Text style={styles.privacyText}>Data never shared with advertisers</Text>
          </View>
          <View style={styles.privacyItem}>
            <View style={styles.privacyBullet} />
            <Text style={styles.privacyText}>No user accounts needed</Text>
          </View>
          <View style={styles.privacyItem}>
            <View style={styles.privacyBullet} />
            <Text style={styles.privacyText}>No internet connection required</Text>
          </View>
        </View>
      </View>

      {/* Permissions */}
      <View style={styles.card}>
        <LinearGradient
          colors={[colors.violet, colors.violet]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardHeaderGradient}>
          <Text style={styles.cardIcon}>📋</Text>
          <Text style={styles.cardTitle}>Required Permissions</Text>
        </LinearGradient>
        <View style={styles.permissionList}>
          {permissionData.map((perm) => (
            <View key={perm.name} style={styles.permissionItem}>
              <Text style={styles.permissionIcon}>{perm.icon}</Text>
              <View style={styles.permissionInfo}>
                <Text style={styles.permissionName}>{perm.name}</Text>
                <Text style={styles.permissionDesc}>{perm.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Why Trust MRP */}
      <View style={styles.card}>
        <LinearGradient
          colors={[colors.amber, colors.amber]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardHeaderGradient}>
          <Text style={styles.cardIcon}>✅</Text>
          <Text style={styles.cardTitle}>Why Trust MRP?</Text>
        </LinearGradient>
        <View style={styles.trustList}>
          {trustData.map((item, index) => (
            <View key={index} style={styles.trustItem}>
              <Text style={styles.trustIcon}>{item.icon}</Text>
              <Text style={styles.trustText}>{item.text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Data Ownership */}
      <View style={styles.card}>
        <LinearGradient
          colors={[colors.pink, colors.pink]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardHeaderGradient}>
          <Text style={styles.cardIcon}>💎</Text>
          <Text style={styles.cardTitle}>Your Data Belongs Only to You</Text>
        </LinearGradient>
        <View style={styles.dataTimeline}>
          <View style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Today</Text>
              <Text style={styles.timelineText}>All data stored locally. No cloud, no servers.</Text>
            </View>
          </View>
          <View style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Future</Text>
              <Text style={styles.timelineText}>Data syncs ONLY to YOUR Google Drive account.</Text>
            </View>
          </View>
          <View style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Never</Text>
              <Text style={styles.timelineText}>We will never sell or share your data.</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Your security, your privacy, your peace of mind</Text>
        <Text style={styles.footerText}>Made with 💚 for your protection</Text>
      </View>
    </ScrollView>
  );
}

const permissionData = [
  { name: 'Camera Access', desc: 'Captures intruder selfies', icon: '📷' },
  { name: 'Location Access', desc: 'Records GPS coordinates', icon: '📍' },
  { name: 'Display Over Other Apps', desc: 'Shows camera preview', icon: '🖥️' },
  { name: 'Device Admin', desc: 'Detects wrong password', icon: '🔐' },
  { name: 'Accessibility Service', desc: 'Monitors screen activity', icon: '♿' },
  { name: 'Usage Stats', desc: 'Tracks open apps', icon: '📊' },
];

const trustData = [
  { icon: '👁️', text: 'Transparent - You control every permission' },
  { icon: '🔧', text: 'Minimal - Only essential permissions' },
  { icon: '🏠', text: 'Local-first - Data never leaves your phone' },
  { icon: '📖', text: 'Open - Check everything in Settings' },
  { icon: '🔒', text: 'Secure - Encryption for all local data' },
  { icon: '👤', text: 'Yours - Data belongs only to you' },
];

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 80,
    },
    headerGradient: {
      borderRadius: 24,
      padding: 32,
      alignItems: 'center',
      marginBottom: 24,
    },
    headerContent: {
      alignItems: 'center',
    },
    logoBox: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.emerald,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
      shadowColor: colors.emerald,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
      elevation: 10,
    },
    logo: {
      fontSize: 50,
    },
    appName: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 8,
    },
    appTagline: {
      fontSize: 14,
      color: colors.sky,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: 12,
    },
    version: {
      fontSize: 12,
      color: colors.textMuted,
      backgroundColor: colors.borderSoft,
      paddingHorizontal: 16,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statsGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    statCard: {
      flex: 1,
      marginHorizontal: 8,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.skySoft,
    },
    statValue: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.sky,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '600',
      textTransform: 'uppercase',
      textAlign: 'center',
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 24,
      marginBottom: 24,
      overflow: 'hidden',
    },
    cardHeaderGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 20,
      marginBottom: 20,
    },
    cardIcon: {
      fontSize: 28,
      marginRight: 12,
    },
    cardTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '700',
      flex: 1,
    },
    cardText: {
      color: colors.textBody,
      fontSize: 15,
      lineHeight: 26,
      marginBottom: 16,
    },
    featureGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 8,
    },
    featureItem: {
      flex: 1,
      minWidth: '48%',
      backgroundColor: colors.borderSubtle,
      borderRadius: 12,
      padding: 12,
      alignItems: 'center',
    },
    featureIcon: {
      fontSize: 24,
      marginBottom: 8,
    },
    featureText: {
      color: colors.textBody,
      fontSize: 13,
      fontWeight: '500',
      textAlign: 'center',
    },
    privacyList: {
      gap: 16,
    },
    privacyItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    privacyBullet: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.emerald,
      marginTop: 8,
      marginRight: 12,
      flexShrink: 0,
    },
    privacyText: {
      color: colors.textBody,
      fontSize: 15,
      lineHeight: 24,
      flex: 1,
    },
    permissionList: {
      gap: 12,
    },
    permissionItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.borderSubtle,
      borderRadius: 12,
      padding: 12,
    },
    permissionIcon: {
      fontSize: 24,
      marginRight: 12,
    },
    permissionInfo: {
      flex: 1,
    },
    permissionName: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 2,
    },
    permissionDesc: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 20,
    },
    trustList: {
      gap: 16,
    },
    trustItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    trustIcon: {
      fontSize: 20,
      marginRight: 12,
    },
    trustText: {
      color: colors.textBody,
      fontSize: 15,
      lineHeight: 22,
    },
    dataTimeline: {
      gap: 16,
    },
    timelineItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    timelineDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.pink,
      marginTop: 6,
      marginRight: 12,
      flexShrink: 0,
    },
    timelineContent: {
      flex: 1,
    },
    timelineTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 4,
    },
    timelineText: {
      color: colors.textBody,
      fontSize: 14,
      lineHeight: 22,
    },
    footer: {
      alignItems: 'center',
      paddingTop: 40,
      paddingBottom: 40,
      marginTop: 20,
    },
    footerTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 8,
    },
    footerText: {
      color: colors.textMuted,
      fontSize: 14,
      textAlign: 'center',
    },
  });
}
