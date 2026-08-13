import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {ColorPalette, spacing, radius, brandColors} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {useEntitlements} from '../../services/entitlements/EntitlementProvider';
import {SMS_AUTO_SCAN_ENABLED} from '../../config/featureFlags';
import {DigitalSafetyNative, type AutomationState} from './DigitalSafety.native';
import {checkEmailBreaches} from '../security-center/breachEmailCheck';
import {logDigitalSafetyEvent} from './digitalSafetyEvents';
import {AutomationConsentCard} from './components/AutomationConsentCard';
import {SubscriptionLockState} from './components/SubscriptionLockState';
import {DsScreenState} from './components/DsScreenState';

export function AutomationSettingsScreen({
  onBack,
  embedded = false,
  onUpgrade,
}: {
  onBack?: () => void;
  embedded?: boolean;
  onUpgrade?: () => void;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {canUseFeature} = useEntitlements();
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<AutomationState | null>(null);
  const [email, setEmail] = useState('');

  const clipboardAllowed = canUseFeature('digitalsafe.clipboard_scan');
  const smsAllowed = canUseFeature('digitalsafe.sms_auto');
  const breachAllowed = canUseFeature('digitalsafe.breach_monitor');

  const refresh = useCallback(async () => {
    setBusy(true);
    setLoadError(null);
    try {
      setState(await DigitalSafetyNative.getAutomationState());
    } catch (e: any) {
      const msg = e?.message || String(e);
      setLoadError(msg);
      Alert.alert('Automation', msg);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleClipboard = async (enabled: boolean) => {
    if (enabled && !clipboardAllowed) {
      onUpgrade?.();
      Alert.alert('Basic required', 'Clipboard URL scan is available on Basic and higher plans.');
      return;
    }
    setBusy(true);
    try {
      setState(await DigitalSafetyNative.setClipboardScanEnabled(enabled));
      await logDigitalSafetyEvent(
        enabled ? 'AUTOMATION_CLIPBOARD_ON' : 'AUTOMATION_CLIPBOARD_OFF',
        'completed',
        {source: 'clipboard'},
      );
    } catch (e: any) {
      Alert.alert('Clipboard scan', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleSms = async (enabled: boolean) => {
    if (!SMS_AUTO_SCAN_ENABLED) {
      Alert.alert(
        'Not available yet',
        'Incoming SMS auto-scan stays off until policy review. Use Scam Check to paste messages.',
      );
      return;
    }
    if (enabled && !smsAllowed) {
      onUpgrade?.();
      Alert.alert('Premium required', 'SMS auto-scan is available on Premium, Family, and Enterprise.');
      return;
    }
    setBusy(true);
    try {
      setState(await DigitalSafetyNative.setSmsAutoScanEnabled(enabled));
    } catch (e: any) {
      Alert.alert('SMS auto-scan', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const enroll = async () => {
    if (!breachAllowed) {
      onUpgrade?.();
      Alert.alert('Basic required', 'Scheduled breach monitoring is available on Basic and higher plans.');
      return;
    }
    Alert.alert(
      'Enroll this email?',
      'MRP will re-check this address with XposedOrNot about once a day while the app is open. You can remove it anytime. MRP does not read your mailbox.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Enroll',
          onPress: async () => {
            setBusy(true);
            try {
              const next = await DigitalSafetyNative.enrollBreachEmail(email);
              setState(next);
              setEmail('');
            } catch (e: any) {
              Alert.alert('Enrollment failed', e?.message || String(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const unenroll = (value: string) => {
    Alert.alert('Stop monitoring?', value, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            setState(await DigitalSafetyNative.unenrollBreachEmail(value));
          } catch (e: any) {
            Alert.alert('Could not remove', e?.message || String(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const checkNow = async (value: string) => {
    if (!breachAllowed) {
      onUpgrade?.();
      return;
    }
    setBusy(true);
    try {
      const result = await checkEmailBreaches(value);
      if (result.status === 'invalid' || result.status === 'error') {
        Alert.alert('Breach check', result.message);
        return;
      }
      setState(
        await DigitalSafetyNative.recordBreachCheck(
          result.email,
          result.status,
          result.breaches.length,
        ),
      );
      await logDigitalSafetyEvent(
        result.status === 'found' ? 'BREACH_EMAIL_FOUND' : 'BREACH_EMAIL_CLEAN',
        result.status,
        {source: 'breach_monitor', count: result.breaches.length},
      );
      Alert.alert(
        result.status === 'found' ? 'Known breaches found' : 'No known breaches',
        result.message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.pad}>
      {!embedded && onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Digital Safety</Text>
        </TouchableOpacity>
      ) : null}
      {!embedded ? (
        <>
          <Text style={styles.title}>Automation</Text>
          <Text style={styles.sub}>
            Share-to-MRP Safe Link is on for free. Clipboard and breach watch need Basic+ and explicit
            opt-in.
          </Text>
        </>
      ) : (
        <Text style={styles.sub}>
          Share-to-MRP Safe Link is on for free. Clipboard and breach watch need Basic+ and explicit
          opt-in.
        </Text>
      )}

      <DsScreenState
        colors={colors}
        loading={busy && !state}
        error={loadError && !state ? loadError : null}
        onRetry={refresh}
      />

      {busy && state ? <ActivityIndicator color={brandColors.googleBlue} style={{marginTop: spacing.md}} /> : null}

      <View style={styles.matrixCard}>
        <Text style={styles.matrixTitle}>Safe Link automation matrix</Text>
        <Text style={styles.rowSub}>• Manual paste — Free (default)</Text>
        <Text style={styles.rowSub}>• Share / deep link to MRP — Free (default on)</Text>
        <Text style={styles.rowSub}>• Clipboard URL scan — Basic+, off until you enable</Text>
        <Text style={styles.rowSub}>• SMS auto-scan — Premium+, policy-gated (currently off)</Text>
        <Text style={styles.rowSub}>• Breach email re-check — Basic+, after enrollment</Text>
      </View>

      <AutomationConsentCard
        colors={colors}
        title="Clipboard URL scan"
        description="While MRP is open, detect copied links and open Safe Link. URL-only parse. No clipboard history."
        dataStays="On device only; last URL hash for de-dupe"
        enabled={!!state?.clipboardScanEnabled}
        onToggle={toggleClipboard}
        disabled={busy}
        locked={!clipboardAllowed}
        lockReason="Basic or higher required"
      />

      {SMS_AUTO_SCAN_ENABLED ? (
        <AutomationConsentCard
          colors={colors}
          title="Incoming SMS scam scan"
          description="Local pattern scan of new SMS. Does not store message text or sender."
          dataStays="Local only; no inbox upload"
          enabled={!!state?.smsAutoScanEnabled}
          onToggle={toggleSms}
          disabled={busy || !state?.smsAutoScanAvailable}
          locked={!smsAllowed}
          lockReason="Premium or higher required"
        />
      ) : (
        <View style={styles.card}>
          <Text style={styles.rowTitle}>Incoming SMS scam scan</Text>
          <Text style={styles.rowSub}>
            Off by design until Play policy review. Paste messages in Scam Check instead. MRP does not
            request RECEIVE_SMS for this release.
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.rowTitle}>Breach email monitoring</Text>
        <Text style={styles.rowSub}>
          Enroll addresses you own. MRP re-checks them with XposedOrNot about once a day while the app
          is open. Revocable anytime. MRP does not read your mailbox.
        </Text>
        {!breachAllowed ? (
          <SubscriptionLockState
            colors={colors}
            title="Basic required"
            message="Scheduled breach monitoring unlocks on Basic and higher."
            onUpgrade={onUpgrade}
          />
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <TouchableOpacity style={styles.primary} onPress={enroll} disabled={busy}>
              <Text style={styles.primaryText}>Enroll email</Text>
            </TouchableOpacity>
            {(state?.enrolledEmails ?? []).length === 0 ? (
              <Text style={styles.rowSub}>No enrolled emails yet.</Text>
            ) : null}
            {(state?.enrolledEmails ?? []).map(row => (
              <View key={row.email} style={styles.emailRow}>
                <View style={styles.rowText}>
                  <Text style={styles.email}>{row.email}</Text>
                  <Text style={styles.rowSub}>
                    {row.lastStatus === 'unknown'
                      ? 'Not checked yet'
                      : `${row.lastStatus}${row.lastCount ? ` · ${row.lastCount}` : ''}`}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => checkNow(row.email)}>
                  <Text style={styles.link}>Check</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => unenroll(row.email)}>
                  <Text style={styles.remove}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </View>

      <Text style={styles.footer}>
        Automatic protection where Android allows. Manual scan where privacy or platform limits apply.
        MRP does not scan all links across all apps, and does not read SMS or email inboxes unless you
        opt in to a specific, documented path.
      </Text>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    pad: {padding: spacing.lg, paddingBottom: spacing.xxl},
    backBtn: {marginBottom: spacing.sm},
    backText: {color: brandColors.googleBlue, fontWeight: '700', fontSize: 15},
    title: {fontSize: 24, fontWeight: '800', color: colors.textPrimary},
    sub: {fontSize: 14, color: colors.textMuted, marginBottom: spacing.md},
    matrixCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    matrixTitle: {fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 8},
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    rowText: {flex: 1, paddingRight: spacing.md},
    rowTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
    rowSub: {fontSize: 13, color: colors.textBody, lineHeight: 18, marginTop: 4},
    input: {
      backgroundColor: colors.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      color: colors.textPrimary,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    primary: {
      backgroundColor: brandColors.googleBlue,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    primaryText: {color: '#fff', fontWeight: '800'},
    emailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
      marginTop: spacing.sm,
    },
    email: {fontSize: 14, fontWeight: '700', color: colors.textPrimary},
    link: {color: brandColors.googleBlue, fontWeight: '700', marginRight: spacing.md},
    remove: {color: brandColors.googleRed, fontWeight: '700'},
    footer: {
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: 'italic',
      lineHeight: 18,
      marginTop: spacing.sm,
    },
  });
}
