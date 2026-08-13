import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {ColorPalette, spacing, radius, brandColors} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {DigitalSafetyNative, type ScamAggregateResult} from './DigitalSafety.native';
import {logOtpScanEvent} from './digitalSafetyEvents';
import {RiskResultCard} from './components/RiskResultCard';
import {bandFromScore, type RiskBand} from './risk/types';

function verdictLabel(verdict: string): string {
  switch (verdict) {
    case 'scam_likely':
      return 'Scam likely';
    case 'caution':
      return 'Caution';
    case 'ok':
      return 'Looks OK';
    default:
      return 'Paste text to scan';
  }
}

export function ScamCheckScreen({
  onBack,
  embedded = false,
}: {
  onBack?: () => void;
  embedded?: boolean;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScamAggregateResult | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  const runScan = async () => {
    setBusy(true);
    try {
      const next = await DigitalSafetyNative.aggregateScamText(input);
      setResult(next);
      setShowWhy(false);
      if (next.verdict !== 'empty') {
        void logOtpScanEvent(next.verdict, next.score, next.reasonCodes);
      }
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
          <Text style={styles.title}>Scam Check</Text>
          <Text style={styles.sub}>
            Paste suspicious SMS, email snippets, or URLs — unified scam signals
          </Text>
        </>
      ) : (
        <Text style={styles.sub}>Paste suspicious messages or links</Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="Paste message text…"
        placeholderTextColor={colors.textMuted}
        value={input}
        onChangeText={setInput}
        multiline
      />
      <TouchableOpacity style={styles.primary} disabled={busy} onPress={() => void runScan()}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>Check for scam signals</Text>
        )}
      </TouchableOpacity>

      {result && result.verdict !== 'empty' ? (
        <RiskResultCard
          colors={colors}
          band={(result.band as RiskBand) || bandFromScore(result.score)}
          score={result.score}
          title={verdictLabel(result.verdict)}
          reasons={result.reasons}
          showReasons={showWhy}
          onToggleReasons={() => setShowWhy(s => !s)}
          footer="MRP does not read your inbox. Only text you paste here is analyzed on-device."
        />
      ) : null}

      <Text style={styles.footer}>
        OTP, CVV, and passwords are never stored. Results use the same risk bands as Safe Link.
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
      minHeight: 120,
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
    footer: {
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: 'italic',
      lineHeight: 18,
      marginTop: spacing.md,
    },
  });
}
