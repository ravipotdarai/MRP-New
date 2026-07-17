import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';

export function AboutScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.logoBox}>
            <Text style={styles.logo}>🛡️</Text>
          </View>
          <Text style={styles.appName}>MRP Stay Sync.. Stay Connected</Text>
        </View>
      </View>

      {/* What is MRP */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>🎯</Text>
          <Text style={styles.cardTitle}>What is MRP?</Text>
        </View>
        <Text style={styles.cardText}>
          MRP is your personal security companion that keeps complete control of your phone's security.
        </Text>
        <Text style={styles.cardText}>
          Key features: Capture intruder selfies, track GPS location, receive instant alerts, monitor background activity.
        </Text>
      </View>

      {/* Your Privacy */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>🔒</Text>
          <Text style={styles.cardTitle}>Your Privacy</Text>
        </View>
        <Text style={styles.cardList}>✓ All data stored locally on device</Text>
        <Text style={styles.cardList}>✓ No data sent to cloud servers</Text>
        <Text style={styles.cardList}>✓ No third-party tracking or analytics</Text>
        <Text style={styles.cardList}>✓ Data never shared with advertisers</Text>
        <Text style={styles.cardList}>✓ No user accounts needed</Text>
        <Text style={styles.cardList}>✓ No internet connection required</Text>
      </View>

      {/* Permissions */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>📋</Text>
          <Text style={styles.cardTitle}>Required Permissions</Text>
        </View>
        <Text style={styles.permissionRow}>📷 Camera - Captures intruder selfies</Text>
        <Text style={styles.permissionRow}>📍 Location - Records GPS coordinates</Text>
        <Text style={styles.permissionRow}>🖥️ Display Over Other Apps - Shows camera preview</Text>
        <Text style={styles.permissionRow}>🔐 Device Admin - Detects wrong password</Text>
        <Text style={styles.permissionRow}>♿ Accessibility - Monitors screen activity</Text>
        <Text style={styles.permissionRow}>📊 Usage Stats - Tracks open apps</Text>
      </View>

      {/* Why Trust Us */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>✅</Text>
          <Text style={styles.cardTitle}>Why Trust MRP?</Text>
        </View>
        <Text style={styles.cardList}>✓ Transparent - You control every permission</Text>
        <Text style={styles.cardList}>✓ Minimal - Only essential permissions</Text>
        <Text style={styles.cardList}>✓ Local-first - Data never leaves your phone</Text>
        <Text style={styles.cardList}>✓ Open - Check everything in Settings</Text>
        <Text style={styles.cardList}>✓ Secure - Encryption for all local data</Text>
        <Text style={styles.cardList}>✓ Yours - Data belongs only to you</Text>
      </View>

      {/* Data Ownership */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>💎</Text>
          <Text style={styles.cardTitle}>Your Data Belongs Only to You</Text>
        </View>
        <Text style={styles.dataHighlight}>Today: All data stored locally. No cloud, no servers.</Text>
        <Text style={styles.dataHighlight}>Future: Data syncs ONLY to YOUR Google Drive account.</Text>
        <Text style={styles.dataHighlight}>Never: We will never sell or share your data.</Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Your security, your privacy, your peace of mind</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 32,
    paddingBottom: 60,
  },
  header: {
    marginBottom: 48,
    paddingTop: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  logoBox: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  logo: {
    fontSize: 60,
  },
  appName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 32,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 32,
    marginBottom: 32,
    borderLeftWidth: 4,
    borderLeftColor: '#38bdf8',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardIcon: {
    fontSize: 32,
    marginRight: 20,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
  },
  cardText: {
    color: '#cbd5e1',
    fontSize: 16,
    lineHeight: 28,
    marginBottom: 16,
  },
  cardList: {
    color: '#cbd5e1',
    fontSize: 16,
    lineHeight: 28,
    marginBottom: 12,
  },
  permissionRow: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 10,
  },
  dataHighlight: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 26,
    marginBottom: 12,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 50,
    marginTop: 20,
  },
  footerTitle: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
