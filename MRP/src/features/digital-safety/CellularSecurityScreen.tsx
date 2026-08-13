import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import {ColorPalette, spacing, radius, brandColors} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {useEntitlements} from '../../services/entitlements/EntitlementProvider';
import {DigitalSafetyNative, type CellularSecuritySummary} from './DigitalSafety.native';
import {USSD_CODES, ussdTelUri} from '../security-center/ussdCodes';
import {SubscriptionLockState} from './components/SubscriptionLockState';
import {DsScreenState} from './components/DsScreenState';

function statusColor(status: CellularSecuritySummary['status'], colors: ColorPalette): string {
  switch (status) {
    case 'attention':
      return colors.amber;
    case 'permission_required':
      return brandColors.googleRed;
    case 'ok':
      return brandColors.googleGreen;
    default:
      return colors.textMuted;
  }
}

export function CellularSecurityScreen({
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
  const entitled = canUseFeature('digitalsafe.cellular_monitor');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CellularSecuritySummary | null>(null);

  const refresh = useCallback(async () => {
    if (!entitled) return;
    setBusy(true);
    setLoadError(null);
    try {
      setSummary(await DigitalSafetyNative.getCellularSecuritySummary());
    } catch (e: any) {
      const msg = e?.message || String(e);
      setLoadError(msg);
      Alert.alert('Cellular Security', msg);
    } finally {
      setBusy(false);
    }
  }, [entitled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDialerCheck = (code: string, title: string) => {
    Alert.alert(
      title,
      `MRP will open your Phone app with ${code}. Confirm there to run the carrier check.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Open dialer', onPress: () => Linking.openURL(ussdTelUri(code)).catch(() => {})},
      ],
    );
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
          <Text style={styles.title}>Cellular Security</Text>
          <Text style={styles.sub}>Carrier and SIM anomaly guidance, not fake-tower certainty</Text>
        </>
      ) : (
        <Text style={styles.sub}>Carrier and SIM anomaly guidance, not fake-tower certainty</Text>
      )}

      {!entitled ? (
        <SubscriptionLockState
          colors={colors}
          title="Basic required"
          message="Cellular anomaly signals are available on Basic and higher. MRP cannot prove a fake cell tower on consumer Android."
          onUpgrade={onUpgrade}
        />
      ) : (
        <>
          <DsScreenState
            colors={colors}
            loading={busy && !summary}
            error={loadError && !summary ? loadError : null}
            empty={!busy && !summary && !loadError}
            emptyTitle="No cellular summary yet"
            emptyMessage="Tap Refresh to read SIM and network signals on this device."
            onRetry={refresh}
          />

      {busy && summary ? <ActivityIndicator color={brandColors.googleBlue} style={{marginTop: spacing.md}} /> : null}

      {summary ? (
        <View style={[styles.card, {borderColor: statusColor(summary.status, colors)}]}>
          <Text style={[styles.status, {color: statusColor(summary.status, colors)}]}>
            {(summary.status || 'unavailable').replace('_', ' ')}
            {typeof summary.score === 'number' ? ` · ${summary.score}/100` : ''}
          </Text>
          <Text style={styles.detail}>{summary.detail}</Text>
          <CellRow label="Operator" value={summary.operatorName || 'Unknown'} styles={styles} />
          <CellRow label="SIM operator" value={summary.simOperatorName || 'Unknown'} styles={styles} />
          <CellRow label="Network type" value={summary.networkType || 'Unknown'} styles={styles} />
          <CellRow label="SIM state" value={summary.simState || 'Unknown'} styles={styles} />
          <CellRow
            label="Roaming"
            value={summary.roaming ? 'Yes' : 'No'}
            styles={styles}
          />
          {(summary.reasons || []).length ? (
            <View style={styles.reasonBlock}>
              <Text style={styles.reasonTitle}>Signals noticed</Text>
              {summary.reasons!.map((reason, index) => (
                <Text key={`${reason}-${index}`} style={styles.reason}>
                  • {reason}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Manual forwarding checks</Text>
        <Text style={styles.help}>
          Use these carrier codes to verify whether calls are being diverted without your knowledge.
        </Text>
        {USSD_CODES.map(item => (
          <TouchableOpacity
            key={item.id}
            style={styles.codeRow}
            onPress={() => openDialerCheck(item.code, item.title)}>
            <View style={styles.codeText}>
              <Text style={styles.codeTitle}>{item.title}</Text>
              <Text style={styles.codeSub}>
                {item.code} · {item.subtitle}
              </Text>
            </View>
            <Text style={styles.codeCta}>Run</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.primary} onPress={refresh}>
        <Text style={styles.primaryText}>{busy ? 'Refreshing…' : 'Refresh status'}</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>
        MRP can highlight unusual SIM, roaming, and network state signals, but it cannot prove a fake
        cellular tower on normal Android devices.
      </Text>
        </>
      )}
    </ScrollView>
  );
}

function CellRow({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
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
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    status: {fontSize: 18, fontWeight: '800', marginBottom: 8, textTransform: 'capitalize'},
    detail: {fontSize: 13, color: colors.textBody, marginBottom: spacing.md},
    row: {marginBottom: 8},
    rowLabel: {fontSize: 12, color: colors.textMuted, fontWeight: '700'},
    rowValue: {fontSize: 14, color: colors.textPrimary, marginTop: 2},
    reasonBlock: {marginTop: spacing.sm},
    reasonTitle: {fontSize: 14, fontWeight: '800', color: colors.textPrimary, marginBottom: 6},
    reason: {fontSize: 13, color: colors.textBody, marginBottom: 4},
    sectionTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: 8},
    help: {fontSize: 13, color: colors.textBody, lineHeight: 18, marginBottom: spacing.sm},
    codeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    codeText: {flex: 1, paddingRight: spacing.md},
    codeTitle: {fontSize: 14, fontWeight: '700', color: colors.textPrimary},
    codeSub: {fontSize: 12, color: colors.textMuted, marginTop: 2},
    codeCta: {fontSize: 13, fontWeight: '800', color: brandColors.googleBlue},
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
      marginTop: spacing.sm,
    },
  });
}
