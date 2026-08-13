import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {ColorPalette, spacing, radius, brandColors} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {useEntitlements} from '../../services/entitlements/EntitlementProvider';
import {DigitalSafetyNative, type NetworkGuardianState} from './DigitalSafety.native';
import {SubscriptionLockState} from './components/SubscriptionLockState';
import {DsScreenState} from './components/DsScreenState';

function formatCount(value?: number): string {
  if (value == null) return '0';
  return value.toLocaleString();
}

export function NetworkGuardianScreen({
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
  const entitled = canUseFeature('digitalsafe.network_guardian');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<NetworkGuardianState | null>(null);
  const stoppedVpn = useRef(false);

  const applyState = useCallback((next: NetworkGuardianState) => {
    setState(next);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      applyState(await DigitalSafetyNative.getNetworkGuardianState());
    } catch (e: any) {
      const msg = e?.message || String(e);
      setLoadError(msg);
      Alert.alert('Network Guardian', msg);
    } finally {
      setRefreshing(false);
    }
  }, [applyState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // DNS VPN toggle is withdrawn — stop leftover tunnel so apps are not left on a broken VPN.
  useEffect(() => {
    if (stoppedVpn.current || !state?.enabled) return;
    stoppedVpn.current = true;
    void DigitalSafetyNative.setNetworkGuardianEnabled(false)
      .then(applyState)
      .catch(() => undefined);
  }, [state?.enabled, applyState]);

  const setCategory = async (category: string, enabled: boolean) => {
    setRefreshing(true);
    try {
      applyState(await DigitalSafetyNative.setGuardianCategoryEnabled(category, enabled));
    } catch (e: any) {
      Alert.alert('Category', e?.message || String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const refreshIntel = async () => {
    setRefreshing(true);
    try {
      applyState(await DigitalSafetyNative.refreshGuardianLists());
    } catch (e: any) {
      Alert.alert('Rule lists', e?.message || String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const busy = refreshing;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.pad}>
      {!embedded && onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Digital Safety</Text>
        </TouchableOpacity>
      ) : null}
      {!embedded ? (
        <>
          <Text style={styles.title}>Network Guardian</Text>
          <Text style={styles.sub}>
            Category lists for ads, trackers, malware, phishing, and content. DNS VPN filter is paused.
          </Text>
        </>
      ) : (
        <Text style={styles.sub}>
          Category lists for ads, trackers, malware, phishing, and content. DNS VPN filter is paused.
        </Text>
      )}

      {!entitled ? (
        <SubscriptionLockState
          colors={colors}
          title="Premium required"
          message="Network Guardian uses a local DNS VPN. It does not inspect HTTPS content. Available on Premium, Family, and Enterprise."
          onUpgrade={onUpgrade}
        />
      ) : null}

      <DsScreenState
        colors={colors}
        loading={refreshing && !state}
        error={loadError && !state ? loadError : null}
        onRetry={refresh}
      />

      {refreshing && state ? (
        <ActivityIndicator color={brandColors.googleBlue} style={{marginTop: spacing.md}} />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Categories</Text>
        <Text style={styles.help}>
          Choose which lists to keep on. These lists are stored on this device. The DNS VPN filter is
          paused until a later release.
        </Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Ads</Text>
            <Text style={styles.rowSub}>Blocks known ad-network domains (DNS). Default on.</Text>
          </View>
          <Switch value={state?.categoryAds !== false} onValueChange={v => setCategory('ads', v)} disabled={busy} />
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Trackers</Text>
            <Text style={styles.rowSub}>Stricter. Can break some apps. Default off.</Text>
          </View>
          <Switch value={!!state?.categoryTrackers} onValueChange={v => setCategory('trackers', v)} disabled={busy} />
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Malware</Text>
          </View>
          <Switch value={state?.categoryMalware !== false} onValueChange={v => setCategory('malware', v)} disabled={busy} />
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Phishing</Text>
          </View>
          <Switch value={state?.categoryPhishing !== false} onValueChange={v => setCategory('phishing', v)} disabled={busy} />
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Adult / content</Text>
            <Text style={styles.rowSub}>Off by default. Blocks known adult domains at DNS.</Text>
          </View>
          <Switch value={!!state?.categoryContent} onValueChange={v => setCategory('content', v)} disabled={busy} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Blocked counters</Text>
        <Text style={styles.help}>
          Aggregate counts only — no browsing history is stored.
        </Text>
        <StatusRow label="Ads" value={formatCount(state?.blockedAds)} styles={styles} />
        <StatusRow label="Trackers" value={formatCount(state?.blockedTrackers)} styles={styles} />
        <StatusRow label="Malware" value={formatCount(state?.blockedMalware)} styles={styles} />
        <StatusRow label="Phishing" value={formatCount(state?.blockedPhishing)} styles={styles} />
        <StatusRow label="Adult / content" value={formatCount(state?.blockedContent)} styles={styles} />
        <StatusRow label="Total" value={formatCount(state?.blockedTotal)} styles={styles} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Recent activity</Text>
        <Text style={styles.help}>Last blocked domains (truncated). No browsing history is stored.</Text>
        {(state?.recentActivity ?? []).length === 0 ? (
          <Text style={styles.help}>No blocks yet.</Text>
        ) : (
          (state?.recentActivity ?? []).map((row, idx) => (
            <View key={`${row.host}-${row.t}-${idx}`} style={styles.statusRow}>
              <Text style={styles.statusLabel}>{row.category}</Text>
              <Text style={styles.statusValue}>{row.host}</Text>
            </View>
          ))
        )}
      </View>

      <TouchableOpacity style={styles.primary} onPress={refresh} disabled={busy}>
        <Text style={styles.primaryText}>{refreshing ? 'Refreshing…' : 'Refresh status'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={refreshIntel} disabled={busy}>
        <Text style={styles.secondaryText}>Refresh threat intel</Text>
      </TouchableOpacity>
      {state?.intelLastError ? <Text style={styles.help}>{state.intelLastError}</Text> : null}

      <Text style={styles.footer}>
        Category lists are stored on this device. No browsing history is stored.
      </Text>
    </ScrollView>
  );
}

function StatusRow({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
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
    infoCard: {
      backgroundColor: colors.skySoft,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    infoTitle: {fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.xs},
    infoBody: {fontSize: 13, color: colors.textBody, lineHeight: 19},
    bulletRow: {flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.sm},
    bulletMark: {
      width: 14,
      fontSize: 14,
      fontWeight: '800',
      color: brandColors.googleBlue,
      lineHeight: 19,
    },
    bulletText: {flex: 1, fontSize: 13, color: colors.textBody, lineHeight: 19},
    warnCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: brandColors.googleYellow,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    warnTitle: {fontSize: 14, fontWeight: '800', color: colors.textPrimary, marginBottom: 4},
    warnBody: {fontSize: 13, color: colors.textBody, lineHeight: 18},
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    row: {flexDirection: 'row', alignItems: 'center'},
    rowText: {flex: 1, paddingRight: spacing.md},
    rowTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
    rowSub: {fontSize: 13, color: colors.textBody, lineHeight: 18, marginTop: 4},
    toggleBusy: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    toggleBusyText: {fontSize: 13, color: colors.textMuted, fontWeight: '600'},
    sectionTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm},
    statusRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    statusLabel: {fontSize: 13, color: colors.textMuted, fontWeight: '700'},
    statusValue: {fontSize: 14, color: colors.textPrimary, fontWeight: '700'},
    help: {fontSize: 13, color: colors.textBody, lineHeight: 18, marginBottom: spacing.sm},
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
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    secondaryText: {color: colors.textPrimary, fontWeight: '700'},
    input: {
      backgroundColor: colors.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
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
