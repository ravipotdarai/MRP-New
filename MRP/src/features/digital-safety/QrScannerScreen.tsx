import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import {ColorPalette, spacing, radius, brandColors} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {DigitalSafetyNative} from './DigitalSafety.native';
import {scanUrlOrPayload, isWifiQrPayload, parseWifiQr} from '../security-center/urlScan';
import {logDigitalSafetyEvent} from './digitalSafetyEvents';
import {SafeLinkResultScreen} from './SafeLinkResultScreen';

const FOOTER =
  'Always verify the destination before paying or entering passwords. MRP never auto-opens payment QR codes.';

export function QrScannerScreen({
  onBack,
  embedded = false,
}: {
  onBack?: () => void;
  embedded?: boolean;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState<string | null>(null);
  const [wifiInfo, setWifiInfo] = useState<{ssid: string; security: string} | null>(null);

  const scan = useCallback(async () => {
    setBusy(true);
    setPayload(null);
    setWifiInfo(null);
    try {
      const raw = await DigitalSafetyNative.startQrScan();
      if (!raw) {
        Alert.alert('Cancelled', 'No QR code captured.');
        return;
      }
      void logDigitalSafetyEvent('QR_SCANNED', 'completed', {
        source: 'qr_camera',
        len: raw.length,
      });

      if (isWifiQrPayload(raw)) {
        setWifiInfo(parseWifiQr(raw));
        setPayload(raw);
        return;
      }

      // Payment schemes — preview only, never auto-open
      if (/^(upi|paytm|phonepe|gpay|intent):/i.test(raw)) {
        setPayload(raw);
        void logDigitalSafetyEvent('QR_BLOCKED', 'completed', {
          source: 'qr_camera',
          reason: 'payment_scheme',
        });
        return;
      }

      const urlScan = scanUrlOrPayload(raw);
      if (urlScan.normalized || urlScan.verdict !== 'invalid') {
        setPayload(raw);
        return;
      }

      setPayload(raw);
    } catch (e: any) {
      Alert.alert('Scan failed', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  // URL path → Safe Link result UI
  if (payload && !isWifiQrPayload(payload) && !/^(upi|paytm|phonepe|gpay|intent):/i.test(payload)) {
    const looksUrl =
      /https?:\/\//i.test(payload) ||
      /^[a-z0-9.-]+\.[a-z]{2,}/i.test(payload.trim());
    if (looksUrl) {
      return <SafeLinkResultScreen initialText={payload} embedded={embedded} onBack={onBack} />;
    }
  }

  return (
    <View style={styles.root}>
      {!embedded && onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Digital Safety</Text>
        </TouchableOpacity>
      ) : null}
      {!embedded ? (
        <>
          <Text style={styles.title}>QR Protection</Text>
          <Text style={styles.sub}>Scan & preview before opening</Text>
        </>
      ) : (
        <Text style={styles.sub}>Scan & preview before opening</Text>
      )}

      {busy ? (
        <ActivityIndicator size="large" color={brandColors.googleBlue} style={{marginTop: 40}} />
      ) : null}

      {payload && wifiInfo ? (
        <View style={styles.card}>
          <Text style={styles.band}>Wi‑Fi QR</Text>
          <Text style={styles.host}>SSID: {wifiInfo.ssid || '?'}</Text>
          <Text style={styles.muted}>Security: {wifiInfo.security}</Text>
          <Text style={styles.footer}>
            Confirm the network name before joining. MRP does not auto-join Wi‑Fi.
          </Text>
        </View>
      ) : null}

      {payload && /^(upi|paytm|phonepe|gpay|intent):/i.test(payload) ? (
        <View style={[styles.card, {borderColor: brandColors.googleRed}]}>
          <Text style={[styles.band, {color: brandColors.googleRed}]}>Payment QR</Text>
          <Text style={styles.norm} numberOfLines={4}>
            {payload}
          </Text>
          <Text style={styles.footer}>{FOOTER}</Text>
          <TouchableOpacity
            style={styles.dangerOutline}
            onPress={() =>
              Alert.alert(
                'Open payment?',
                'Only continue if you initiated this payment and trust the merchant.',
                [
                  {text: 'Cancel', style: 'cancel'},
                  {
                    text: 'Open payment app',
                    onPress: () => Linking.openURL(payload).catch(() => {}),
                  },
                ],
              )
            }>
            <Text style={styles.dangerOutlineText}>Open payment (manual)</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {payload &&
      !wifiInfo &&
      !/^(upi|paytm|phonepe|gpay|intent):/i.test(payload) &&
      !/https?:\/\//i.test(payload) ? (
        <View style={styles.card}>
          <Text style={styles.band}>Decoded text</Text>
          <Text style={styles.norm}>{payload}</Text>
        </View>
      ) : null}

      <TouchableOpacity style={styles.primary} disabled={busy} onPress={scan}>
        <Text style={styles.primaryText}>{busy ? 'Scanning…' : 'Scan again'}</Text>
      </TouchableOpacity>
      <Text style={styles.footer}>{FOOTER}</Text>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg, padding: spacing.lg},
    backBtn: {marginBottom: spacing.sm},
    backText: {color: brandColors.googleBlue, fontWeight: '700', fontSize: 15},
    title: {fontSize: 24, fontWeight: '800', color: colors.textPrimary},
    sub: {fontSize: 14, color: colors.textMuted, marginBottom: spacing.md},
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.border,
      padding: spacing.lg,
      marginVertical: spacing.md,
    },
    band: {fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 6},
    host: {fontSize: 16, fontWeight: '700', color: colors.textPrimary},
    norm: {fontSize: 13, color: colors.textBody, marginTop: 4},
    muted: {fontSize: 12, color: colors.textMuted, marginTop: 6},
    primary: {
      backgroundColor: brandColors.googleBlue,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    primaryText: {color: '#fff', fontWeight: '800'},
    dangerOutline: {
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: brandColors.googleRed,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
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
