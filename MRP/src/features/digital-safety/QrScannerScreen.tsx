import React, {useCallback, useMemo, useState} from 'react';
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
import {QR_PROTECTION_ENABLED} from '../../config/featureFlags';

const FOOTER =
  'Always verify the destination before paying or entering passwords. MRP never auto-opens payment QR codes.';

const LOW_BATTERY_HINT =
  'QR uses the camera heavily. Below 25% battery, scanning is blocked to avoid phone shutdown.';

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
    if (!QR_PROTECTION_ENABLED) {
      Alert.alert(
        'QR Protection unavailable',
        'This feature is turned off in this build. Use Safe Link (paste) instead.',
      );
      return;
    }
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
      const msg = e?.message || String(e);
      const code = e?.code || '';
      if (code === 'BATTERY_LOW' || /battery low/i.test(msg)) {
        Alert.alert('Battery too low for QR', `${msg}\n\n${LOW_BATTERY_HINT}`);
      } else {
        Alert.alert('Scan failed', msg);
      }
    } finally {
      setBusy(false);
    }
  }, []);

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

      <Text style={styles.hint}>{LOW_BATTERY_HINT}</Text>

      <TouchableOpacity
        style={[styles.scanBtn, busy && styles.scanBtnDisabled]}
        onPress={() => void scan()}
        disabled={busy}
        activeOpacity={0.85}>
        <Text style={styles.scanBtnText}>{busy ? 'Scanning…' : 'Scan QR'}</Text>
      </TouchableOpacity>

      {busy ? (
        <ActivityIndicator size="large" color={brandColors.googleBlue} style={{marginTop: 24}} />
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
                    style: 'destructive',
                    onPress: () => {
                      void Linking.openURL(payload).catch(() =>
                        Alert.alert('Could not open', 'No app handled this payment link.'),
                      );
                    },
                  },
                ],
              )
            }>
            <Text style={styles.dangerOutlineText}>Open in payment app</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {payload && !wifiInfo && !/^(upi|paytm|phonepe|gpay|intent):/i.test(payload) ? (
        <View style={styles.card}>
          <Text style={styles.band}>Raw payload</Text>
          <Text style={styles.norm} numberOfLines={6}>
            {payload}
          </Text>
          <Text style={styles.footer}>{FOOTER}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg, padding: spacing.lg},
    backBtn: {marginBottom: spacing.sm},
    backText: {fontSize: 16, color: brandColors.googleBlue, fontWeight: '600'},
    title: {fontSize: 22, fontWeight: '800', color: colors.text},
    sub: {fontSize: 14, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md},
    hint: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: spacing.md,
    },
    scanBtn: {
      backgroundColor: brandColors.googleBlue,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    scanBtnDisabled: {opacity: 0.6},
    scanBtnText: {color: '#fff', fontWeight: '700', fontSize: 16},
    card: {
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surface,
    },
    band: {fontSize: 12, fontWeight: '800', color: brandColors.googleBlue, marginBottom: 6},
    host: {fontSize: 16, fontWeight: '700', color: colors.text},
    muted: {fontSize: 13, color: colors.textMuted, marginTop: 4},
    norm: {fontSize: 13, color: colors.text, marginTop: 4},
    footer: {fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16},
    dangerOutline: {
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: brandColors.googleRed,
      borderRadius: radius.md,
      paddingVertical: 10,
      alignItems: 'center',
    },
    dangerOutlineText: {color: brandColors.googleRed, fontWeight: '700'},
  });
}
