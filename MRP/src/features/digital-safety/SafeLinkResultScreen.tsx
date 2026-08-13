import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import {ColorPalette, spacing, radius, brandColors} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {DigitalSafetyNative, type UrlRiskNativeResult} from './DigitalSafety.native';
import {logUrlScanEvent} from './digitalSafetyEvents';
import type {RiskBand} from './risk/types';
import {RiskResultCard} from './components/RiskResultCard';
import {ProtectionActionBar} from './components/ProtectionActionBar';

const FOOTER =
  'Checks links you paste or share to MRP. Does not scan links opened in other apps unless you share them.';

export function SafeLinkResultScreen({
  initialText = '',
  onBack,
  embedded = false,
}: {
  initialText?: string;
  onBack?: () => void;
  embedded?: boolean;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [input, setInput] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UrlRiskNativeResult | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [allowHost, setAllowHost] = useState('');

  const refreshAllowlist = useCallback(async () => {
    try {
      setAllowlist(await DigitalSafetyNative.getSafeLinkAllowlist());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshAllowlist();
  }, [refreshAllowlist]);

  const runScan = useCallback(
    async (text: string, resolveRedirects = true) => {
      const raw = text.trim();
      if (!raw) {
        Alert.alert('Paste a link', 'Enter or share a URL to check.');
        return;
      }
      setBusy(true);
      try {
        const r = await DigitalSafetyNative.evaluateUrlRisk(raw, resolveRedirects);
        setResult(r);
        setShowWhy(false);
        if (r.band !== 'INVALID') {
          void logUrlScanEvent(
            r.score,
            r.band as RiskBand,
            r.reasonCodes || [],
            r.domainHash,
            r.host,
          );
        }
      } catch (e: any) {
        Alert.alert('Scan failed', e?.message || String(e));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (initialText.trim()) {
      void runScan(initialText, true);
    }
  }, [initialText, runScan]);

  const openUrl = (url: string) => {
    if (/^upi:\/\//i.test(url) || /^intent:\/\//i.test(url)) {
      Alert.alert(
        'Confirm open',
        'This looks like a payment or app intent. Only continue if you trust the destination.',
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Open', onPress: () => Linking.openURL(url).catch(() => {})},
        ],
      );
      return;
    }
    Linking.openURL(url).catch(() => Alert.alert('Could not open', url));
  };

  const addAllow = async () => {
    if (!allowHost.trim()) return;
    setBusy(true);
    try {
      setAllowlist(await DigitalSafetyNative.addSafeLinkAllowlist(allowHost.trim()));
      setAllowHost('');
    } catch (e: any) {
      Alert.alert('Allowlist', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const isCritical = result?.band === 'CRITICAL' || result?.band === 'HIGH_RISK';
  const isWarn =
    result?.band === 'SUSPICIOUS' || result?.band === 'LOW_RISK' || isCritical;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.pad}>
      {!embedded && onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Digital Safety</Text>
        </TouchableOpacity>
      ) : null}
      {!embedded ? (
        <>
          <Text style={styles.title}>Safe Link</Text>
          <Text style={styles.sub}>Check before you open</Text>
        </>
      ) : (
        <Text style={styles.sub}>Check before you open</Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="Paste URL or shared text"
        placeholderTextColor={colors.textMuted}
        value={input}
        onChangeText={setInput}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />
      <TouchableOpacity
        style={styles.primary}
        disabled={busy}
        onPress={() => runScan(input, true)}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>Scan link</Text>
        )}
      </TouchableOpacity>

      {result ? (
        <RiskResultCard
          colors={colors}
          band={result.band}
          score={result.score}
          title={result.host}
          subtitle={result.normalized}
          reasons={result.reasons}
          showReasons={showWhy}
          onToggleReasons={() => setShowWhy(s => !s)}
          footer={
            (result.redirectHops?.length ?? 0) > 0
              ? `Redirects: ${result.redirectHops!.length} hop(s)`
              : undefined
          }>
          {result.normalized && result.band !== 'INVALID' ? (
            <ProtectionActionBar
              colors={colors}
              actions={
                isCritical
                  ? [
                      {label: 'Go back (safer)', onPress: () => onBack?.(), variant: 'safe'},
                      {
                        label: 'Open anyway',
                        onPress: () => openUrl(result.normalized!),
                        variant: 'danger',
                      },
                    ]
                  : isWarn
                    ? [
                        {label: 'Back', onPress: () => onBack?.(), variant: 'secondary'},
                        {
                          label: 'Continue',
                          onPress: () => openUrl(result.normalized!),
                          variant: 'primary',
                        },
                      ]
                    : [
                        {
                          label: 'Open',
                          onPress: () => openUrl(result.normalized!),
                          variant: 'primary',
                        },
                      ]
              }
            />
          ) : null}
          {result.host && (isWarn || isCritical) ? (
            <TouchableOpacity
              style={styles.secondary}
              onPress={() => {
                Alert.alert(
                  'Report false positive?',
                  'Stores a domain hash and reason codes only — not the full URL.',
                  [
                    {text: 'Cancel', style: 'cancel'},
                    {
                      text: 'Report',
                      onPress: () =>
                        void DigitalSafetyNative.reportSafeLinkFalsePositive(
                          result.host!,
                          result.reasonCodes || [],
                        ).then(() => Alert.alert('Thanks', 'Report saved on this device.')),
                    },
                    {
                      text: 'Block domain',
                      style: 'destructive',
                      onPress: () =>
                        void DigitalSafetyNative.addUserBlocklist(result.host!).then(() =>
                          Alert.alert('Blocked', `${result.host} added to your blocklist.`),
                        ),
                    },
                  ],
                );
              }}>
              <Text style={styles.secondaryText}>Report false positive / block</Text>
            </TouchableOpacity>
          ) : null}
          {(result as any).intelDegraded ? (
            <Text style={styles.footer}>
              Threat intel refresh unavailable — scoring used local lists only.
            </Text>
          ) : null}
        </RiskResultCard>
      ) : null}

      <Text style={styles.sectionTitle}>Trusted domains</Text>
      <Text style={styles.sectionSub}>
        Allowlisted domains are treated as safe in Safe Link scans on this device.
      </Text>
      <View style={styles.allowRow}>
        <TextInput
          style={styles.allowInput}
          placeholder="example.com"
          placeholderTextColor={colors.textMuted}
          value={allowHost}
          onChangeText={setAllowHost}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.allowBtn} onPress={() => void addAllow()} disabled={busy}>
          <Text style={styles.allowBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      {allowlist.map(host => (
        <View key={host} style={styles.allowItem}>
          <Text style={styles.allowHost}>{host}</Text>
          <TouchableOpacity
            onPress={() =>
              void DigitalSafetyNative.removeSafeLinkAllowlist(host).then(setAllowlist)
            }>
            <Text style={styles.allowRemove}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}

      <Text style={styles.footer}>{FOOTER}</Text>
      <Text style={styles.footer}>
        Optional clipboard URL scan is foreground-only and off until you enable it in Automation.
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
    input: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      color: colors.textPrimary,
      minHeight: 80,
      textAlignVertical: 'top',
      marginBottom: spacing.sm,
    },
    primary: {
      backgroundColor: brandColors.googleBlue,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    primaryText: {color: '#fff', fontWeight: '800'},
    secondary: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    secondaryText: {color: colors.textPrimary, fontWeight: '700'},
    sectionTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.md},
    sectionSub: {fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm},
    allowRow: {flexDirection: 'row', gap: 8, marginBottom: spacing.sm},
    allowInput: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.sm,
      color: colors.textPrimary,
    },
    allowBtn: {
      backgroundColor: brandColors.googleBlue,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      justifyContent: 'center',
    },
    allowBtnText: {color: '#fff', fontWeight: '800'},
    allowItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    allowHost: {color: colors.textPrimary, fontWeight: '600'},
    allowRemove: {color: brandColors.googleRed, fontWeight: '700'},
    footer: {
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: 'italic',
      lineHeight: 18,
      marginTop: spacing.md,
    },
  });
}
