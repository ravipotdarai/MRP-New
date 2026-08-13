import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  BackHandler,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {ColorPalette, spacing, radius, brandColors} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {SecureVaultScreen} from '../digital-safety/SecureVaultScreen';
import {EmergencyCardScreen} from '../digital-safety/EmergencyCardScreen';
import {DriveSyncScreen} from '../drive/DriveSyncScreen';
import {PaywallModal} from '../subscription/PaywallModal';
import {useEntitlements} from '../../services/entitlements/EntitlementProvider';

type VaultSection = 'menu' | 'secure-vault' | 'emergency-card' | 'drive-sync';

export function VaultTabScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {gate} = useEntitlements();
  const [section, setSection] = useState<VaultSection>('menu');
  const [paywall, setPaywall] = useState(false);

  const goBack = useCallback(() => {
    if (section !== 'menu') {
      setSection('menu');
      return true;
    }
    return false;
  }, [section]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
      return () => sub.remove();
    }, [goBack]),
  );

  const openVault = () => {
    const g = gate('digitalsafe.secure_vault');
    if (!g.ok) {
      setPaywall(true);
      return;
    }
    setSection('secure-vault');
  };

  if (section === 'secure-vault') {
    return (
      <SafeAreaView style={styles.root}>
        <TouchableOpacity onPress={() => setSection('menu')} style={styles.backWrap}>
          <Text style={styles.back}>‹ Vault</Text>
        </TouchableOpacity>
        <SecureVaultScreen embedded onBack={() => setSection('menu')} />
      </SafeAreaView>
    );
  }
  if (section === 'emergency-card') {
    return (
      <SafeAreaView style={styles.root}>
        <TouchableOpacity onPress={() => setSection('menu')} style={styles.backWrap}>
          <Text style={styles.back}>‹ Vault</Text>
        </TouchableOpacity>
        <EmergencyCardScreen embedded onBack={() => setSection('menu')} />
      </SafeAreaView>
    );
  }
  if (section === 'drive-sync') {
    return (
      <SafeAreaView style={styles.root}>
        <TouchableOpacity onPress={() => setSection('menu')} style={styles.backWrap}>
          <Text style={styles.back}>‹ Vault</Text>
        </TouchableOpacity>
        <DriveSyncScreen embedded onBack={() => setSection('menu')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.title}>Vault</Text>
        <Text style={styles.lead}>Encrypted documents, emergency info, and backup</Text>
        <TouchableOpacity style={styles.tile} onPress={openVault}>
          <Text style={styles.tileTitle}>Secure Vault</Text>
          <Text style={styles.tileSub}>PIN-protected documents and notes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tile} onPress={() => setSection('emergency-card')}>
          <Text style={styles.tileTitle}>Emergency Card</Text>
          <Text style={styles.tileSub}>ICE info for emergencies</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tile} onPress={() => setSection('drive-sync')}>
          <Text style={styles.tileTitle}>Drive Sync</Text>
          <Text style={styles.tileSub}>Encrypted backup to Google Drive</Text>
        </TouchableOpacity>
      </ScrollView>
      <PaywallModal
        visible={paywall}
        title="Basic required"
        message="Secure Vault is available on Basic and higher plans."
        onClose={() => setPaywall(false)}
        onSubscribe={() => setPaywall(false)}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    pad: {padding: spacing.lg, paddingBottom: spacing.xxl},
    backWrap: {paddingHorizontal: spacing.lg, paddingTop: spacing.sm},
    back: {color: brandColors.googleBlue, fontWeight: '700', fontSize: 15},
    title: {fontSize: 26, fontWeight: '800', color: colors.textPrimary},
    lead: {fontSize: 14, color: colors.textMuted, marginBottom: spacing.lg},
    tile: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    tileTitle: {fontSize: 17, fontWeight: '800', color: colors.textPrimary},
    tileSub: {fontSize: 13, color: colors.textMuted, marginTop: 4},
  });
}
