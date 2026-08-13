/**
 * First-class Digital Safety tab — Protect / Monitor / Recover / Secure shell.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, StyleSheet, SafeAreaView, TouchableOpacity, BackHandler} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {ColorPalette, spacing} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {
  DigitalSafetyHubScreen,
  type DigitalSafetyDestination,
} from './DigitalSafetyHubScreen';
import {SafeLinkResultScreen} from './SafeLinkResultScreen';
import {QrScannerScreen} from './QrScannerScreen';
import {ScamCheckScreen} from './ScamCheckScreen';
import {EmergencyCardScreen} from './EmergencyCardScreen';
import {CellularSecurityScreen} from './CellularSecurityScreen';
import {NetworkGuardianScreen} from './NetworkGuardianScreen';
import {AutomationSettingsScreen} from './AutomationSettingsScreen';
import {SecurityCenterScreen} from '../security-center/SecurityCenterScreen';
import {SecureVaultScreen} from './SecureVaultScreen';
import {PaywallModal} from '../subscription/PaywallModal';
import {useEntitlements} from '../../services/entitlements/EntitlementProvider';
import type {FeatureKey} from '../../services/entitlements/FeatureGate';
import {DigitalSafetyNative} from './DigitalSafety.native';

type DsSection =
  | 'hub'
  | 'safe-link'
  | 'scam-check'
  | 'qr-scan'
  | 'network-guardian-screen'
  | 'cellular-security'
  | 'automation-settings'
  | 'emergency-card'
  | 'security-center'
  | 'secure-vault';

const DS_FEATURES: ReadonlySet<DsSection> = new Set([
  'safe-link',
  'scam-check',
  'qr-scan',
  'network-guardian-screen',
  'cellular-security',
  'automation-settings',
  'emergency-card',
  'security-center',
  'secure-vault',
]);

type RouteParams = {openSection?: DsSection; safeLinkText?: string};

export function DigitalSafetyTabScreen({route, navigation}: {route?: {params?: RouteParams}; navigation?: any}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {gate} = useEntitlements();
  const [section, setSection] = useState<DsSection>('hub');
  const [safeLinkText, setSafeLinkText] = useState('');
  const [paywall, setPaywall] = useState<{feature: FeatureKey; title: string; message: string} | null>(null);
  const appliedOpenSection = useRef<DsSection | undefined>(undefined);
  const stoppedGuardianVpn = useRef(false);

  useEffect(() => {
    if (stoppedGuardianVpn.current) return;
    stoppedGuardianVpn.current = true;
    void DigitalSafetyNative.setNetworkGuardianEnabled(false).catch(() => undefined);
  }, []);

  const clearRouteParams = useCallback(() => {
    appliedOpenSection.current = undefined;
    navigation?.setParams?.({openSection: undefined, safeLinkText: undefined});
  }, [navigation]);

  // Consume deep-link params once, then clear so tab focus / remount does not reopen Safe Link.
  useEffect(() => {
    const target = route?.params?.openSection;
    const text = route?.params?.safeLinkText?.trim();
    if (!target && !text) return;
    if (target && target === appliedOpenSection.current && !text) return;
    if (target && DS_FEATURES.has(target)) {
      appliedOpenSection.current = target;
      setSection(target);
    } else if (text) {
      appliedOpenSection.current = 'safe-link';
      setSection('safe-link');
    }
    if (text) setSafeLinkText(text);
    navigation?.setParams?.({openSection: undefined, safeLinkText: undefined});
  }, [route?.params?.openSection, route?.params?.safeLinkText, navigation]);

  const goBack = useCallback(() => {
    if (DS_FEATURES.has(section)) {
      setSection('hub');
      setSafeLinkText('');
      clearRouteParams();
      return true;
    }
    return false;
  }, [section, clearRouteParams]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
      return () => sub.remove();
    }, [goBack]),
  );

  const openPaywall = useCallback((feature: FeatureKey, title: string, message: string) => {
    setPaywall({feature, title, message});
  }, []);

  const guardFeature = useCallback(
    (feature: FeatureKey, onOk: () => void, title: string, message: string) => {
      const g = gate(feature);
      if (g.ok) {
        onOk();
        return;
      }
      openPaywall(feature, title, message);
    },
    [gate, openPaywall],
  );

  const handleNav = useCallback(
    (dest: DigitalSafetyDestination) => {
      switch (dest) {
        case 'safe-link':
          setSection('safe-link');
          break;
        case 'qr':
          setSection('qr-scan');
          break;
        case 'scam':
          setSection('scam-check');
          break;
        case 'network-guardian':
          guardFeature(
            'digitalsafe.network_guardian',
            () => setSection('network-guardian-screen'),
            'Premium required',
            'Network Guardian (DNS filtering) is available on Premium, Family, and Enterprise plans.',
          );
          break;
        case 'cellular':
          guardFeature(
            'digitalsafe.cellular_monitor',
            () => setSection('cellular-security'),
            'Basic required',
            'Cellular monitoring is available on Basic and higher plans.',
          );
          break;
        case 'automation':
          setSection('automation-settings');
          break;
        case 'emergency-card':
          setSection('emergency-card');
          break;
        case 'security-center':
          setSection('security-center');
          break;
        case 'lost-mobile':
          guardFeature(
            'digitalsafe.lost_mobile',
            () => setSection('security-center'),
            'Basic required',
            'Lost Mobile recovery tools are available on Basic and higher plans.',
          );
          break;
        case 'sim-recovery':
          navigation?.navigate?.('Hub', {openSection: 'sim-recovery'});
          break;
        case 'drive-sync':
          navigation?.navigate?.('Hub', {openSection: 'drive-sync'});
          break;
        case 'timeline':
          navigation?.navigate?.('Security', {initialTab: 'TIMELINE'});
          break;
        case 'secure-vault':
          guardFeature(
            'digitalsafe.secure_vault',
            () => setSection('secure-vault'),
            'Basic required',
            'Secure Vault is available on Basic and higher plans.',
          );
          break;
        default:
          break;
      }
    },
    [guardFeature, navigation],
  );

  const paywallNode = (
    <PaywallModal
      visible={!!paywall}
      title={paywall?.title ?? ''}
      message={paywall?.message ?? ''}
      onClose={() => setPaywall(null)}
      onSubscribe={() => {
        setPaywall(null);
        navigation?.getParent?.()?.navigate?.('Hub', {openSection: 'subscriptions'});
      }}
    />
  );

  const shell = (title: string, body: React.ReactNode) => (
    <SafeAreaView style={styles.root}>
      <View style={styles.bar}>
        <TouchableOpacity onPress={goBack}>
          <Text style={styles.back}>‹ Digital Safety</Text>
        </TouchableOpacity>
        <Text style={styles.barTitle}>{title}</Text>
      </View>
      {body}
      {paywallNode}
    </SafeAreaView>
  );

  if (section === 'hub') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Digital Safety</Text>
          <Text style={styles.lead}>Protect · Monitor · Recover · Secure</Text>
        </View>
        <DigitalSafetyHubScreen onNavigate={handleNav} />
        {paywallNode}
      </SafeAreaView>
    );
  }

  if (section === 'safe-link') {
    return shell(
      'Safe Link',
      <SafeLinkResultScreen initialText={safeLinkText} embedded onBack={goBack} />,
    );
  }
  if (section === 'network-guardian-screen') {
    return shell(
      'Network Guardian',
      <NetworkGuardianScreen
        embedded
        onBack={goBack}
        onUpgrade={() =>
          openPaywall(
            'digitalsafe.network_guardian',
            'Premium required',
            'Network Guardian (DNS filtering) is available on Premium, Family, and Enterprise plans.',
          )
        }
      />,
    );
  }
  if (section === 'scam-check') {
    return shell('Scam Check', <ScamCheckScreen embedded onBack={goBack} />);
  }
  if (section === 'qr-scan') {
    return shell('QR Protection', <QrScannerScreen embedded onBack={goBack} />);
  }
  if (section === 'cellular-security') {
    return shell(
      'Cellular Security',
      <CellularSecurityScreen
        embedded
        onBack={goBack}
        onUpgrade={() =>
          openPaywall(
            'digitalsafe.cellular_monitor',
            'Basic required',
            'Cellular monitoring is available on Basic and higher plans.',
          )
        }
      />,
    );
  }
  if (section === 'automation-settings') {
    return shell(
      'Automation',
      <AutomationSettingsScreen
        embedded
        onBack={goBack}
        onUpgrade={() =>
          navigation?.getParent?.()?.navigate?.('Hub', {openSection: 'subscriptions'})
        }
      />,
    );
  }
  if (section === 'emergency-card') {
    return shell('Emergency Card', <EmergencyCardScreen embedded onBack={goBack} />);
  }
  if (section === 'security-center') {
    return shell('Security Advisor', <SecurityCenterScreen />);
  }
  if (section === 'secure-vault') {
    return shell(
      'Secure Vault',
      <SecureVaultScreen
        embedded
        onBack={goBack}
        onUpgrade={() =>
          openPaywall(
            'digitalsafe.secure_vault',
            'Basic required',
            'Secure Vault is available on Basic and higher plans.',
          )
        }
      />,
    );
  }

  return null;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    header: {paddingHorizontal: spacing.lg, paddingTop: spacing.md},
    title: {fontSize: 26, fontWeight: '800', color: colors.textPrimary},
    lead: {fontSize: 14, color: colors.textMuted, marginBottom: spacing.sm},
    bar: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    back: {color: colors.sky, fontWeight: '700', fontSize: 15},
    barTitle: {fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginTop: 4},
  });
}
