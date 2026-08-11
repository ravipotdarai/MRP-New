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

const FOOTER =
  'Checks links you paste or share to MRP. Does not scan links opened in other apps unless you share them.';

function bandColor(band: string, colors: ColorPalette): string {
  switch (band) {
    case 'SAFE':
      return brandColors.googleGreen;
    case 'LOW_RISK':
      return colors.sky;
    case 'SUSPICIOUS':
      return brandColors.googleYellow;
    case 'HIGH_RISK':
      return colors.amber;
    case 'CRITICAL':
      return brandColors.googleRed;
    default:
      return colors.textMuted;
  }
}

export function SafeLinkResultScreen({
  initialText = '',
  onBack,
  embedded = false,
}: {
  initialText?: string;
  onBack?: () => void;
  /** When true, Hub already shows the title bar — skip duplicate chrome. */
  embedded?: boolean;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [input, setInput] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UrlRiskNativeResult | null>(null);
  const [showWhy, setShowWhy] = useState(false);

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
        <View
          style={[
            styles.card,
            {borderColor: bandColor(result.band, colors)},
          ]}>
          <Text style={[styles.band, {color: bandColor(result.band, colors)}]}>
            {result.band.replace('_', ' ')} · {result.score}/100
          </Text>
          {result.host ? <Text style={styles.host}>{result.host}</Text> : null}
          {result.normalized ? (
            <Text style={styles.norm} numberOfLines={3}>
              {result.normalized}
            </Text>
          ) : null}
          {(result.redirectHops?.length ?? 0) > 0 ? (
            <Text style={styles.muted}>
              Redirects: {result.redirectHops!.length} hop(s)
            </Text>
          ) : null}

          <TouchableOpacity onPress={() => setShowWhy(s => !s)}>
            <Text style={styles.whyLink}>
              {showWhy ? 'Hide reasons' : 'Why is this unsafe?'}
            </Text>
          </TouchableOpacity>
          {showWhy
            ? result.reasons.map((r, i) => (
                <Text key={i} style={styles.reason}>
                  • {r}
                </Text>
              ))
            : null}

          {result.normalized && result.band !== 'INVALID' ? (
            <View style={styles.actions}>
              {isCritical ? (
                <>
                  <TouchableOpacity style={styles.safeBtn} onPress={onBack}>
                    <Text style={styles.safeBtnText}>Go back (safer)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dangerOutline}
                    onPress={() => openUrl(result.normalized!)}>
                    <Text style={styles.dangerOutlineText}>Open anyway</Text>
                  </TouchableOpacity>
                </>
              ) : isWarn ? (
                <>
                  <TouchableOpacity
                    style={styles.secondary}
                    onPress={onBack}>
                    <Text style={styles.secondaryText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primary}
                    onPress={() => openUrl(result.normalized!)}>
                    <Text style={styles.primaryText}>Continue</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.primary}
                  onPress={() => openUrl(result.normalized!)}>
                  <Text style={styles.primaryText}>Open</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.footer}>{FOOTER}</Text>
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
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginRight: 8,
    },
    secondaryText: {color: colors.textPrimary, fontWeight: '700'},
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 2,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    band: {fontSize: 18, fontWeight: '800', marginBottom: 6},
    host: {fontSize: 16, fontWeight: '700', color: colors.textPrimary},
    norm: {fontSize: 13, color: colors.textBody, marginTop: 4},
    muted: {fontSize: 12, color: colors.textMuted, marginTop: 6},
    whyLink: {
      color: brandColors.googleBlue,
      fontWeight: '700',
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    reason: {fontSize: 13, color: colors.textBody, marginBottom: 4},
    actions: {flexDirection: 'row', marginTop: spacing.md, flexWrap: 'wrap'},
    safeBtn: {
      flex: 1,
      backgroundColor: brandColors.googleGreen,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 8,
      minWidth: '100%',
    },
    safeBtnText: {color: '#fff', fontWeight: '800'},
    dangerOutline: {
      flex: 1,
      borderWidth: 1,
      borderColor: brandColors.googleRed,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      minWidth: '100%',
    },
    dangerOutlineText: {color: brandColors.googleRed, fontWeight: '700'},
    footer: {
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: 'italic',
      lineHeight: 18,
      marginTop: spacing.md,
    },
  });
}
