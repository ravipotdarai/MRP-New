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
  Switch,
} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {useEntitlements} from '../../services/entitlements/EntitlementProvider';
import {useAuth} from '../../services/auth/AuthContext';
import {PaywallModal} from '../subscription/PaywallModal';
import {
  backupNow,
  connectDrive,
  getDriveStatus,
  restoreLatest,
  setDriveWifiOnly,
  type DriveVaultStatus,
} from '../../native/DriveVault.types';
import {SyncPolicyPanel} from './SyncPolicyPanel';

type Props = {
  onUpgrade?: () => void;
  onBack?: () => void;
};

export function DriveSyncScreen({onUpgrade}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {canUseFeature, tier, caps} = useEntitlements();
  const {auth} = useAuth();
  const unlocked = caps.cloudSync || canUseFeature('cloud.sync');

  const [status, setStatus] = useState<DriveVaultStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [paywallVisible, setPaywallVisible] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await getDriveStatus();
      setStatus(s);
    } catch (e: any) {
      console.warn('[DriveSync] status', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requirePremium = () => {
    if (!unlocked) {
      setPaywallVisible(true);
      return false;
    }
    return true;
  };

  const onConnect = async () => {
    if (!requirePremium()) return;
    if (!auth.signedIn) {
      Alert.alert('Sign in required', 'Hub → Account → Sign in with Google first.');
      return;
    }
    setBusy(true);
    try {
      await connectDrive();
      await refresh();
      Alert.alert('Drive connected', 'MRP can back up encrypted data to your Drive app folder.');
    } catch (e: any) {
      Alert.alert('Could not connect Drive', e?.message || 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const onBackup = async () => {
    if (!requirePremium()) return;
    if (!pin || pin.length < 4) {
      Alert.alert('PIN required', 'Enter your MRP PIN to encrypt the backup.');
      return;
    }
    setBusy(true);
    try {
      const result = await backupNow(pin);
      setPin('');
      await refresh();
      Alert.alert(
        'Backup complete',
        `${result.timelineCount} timeline events encrypted and uploaded (${result.bytes} bytes).` +
          (result.purgedOldBackups
            ? `\nRemoved ${result.purgedOldBackups} old MRP backup file(s).`
            : '') +
          (result.pendingSyncDrained
            ? `\nDrained ${result.pendingSyncDrained} pending SIM sync item(s).`
            : ''),
      );
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes('PAUSED_QUOTA') || msg.includes('storage is full')) {
        Alert.alert('Drive full', 'Backup paused. Local vault is intact. Free space in Drive, then retry.');
      } else {
        Alert.alert('Backup failed', msg);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    if (!requirePremium()) return;
    if (!pin || pin.length < 4) {
      Alert.alert('PIN required', 'Enter the MRP PIN used when the backup was created.');
      return;
    }
    Alert.alert(
      'Restore from Drive?',
      'Merges timeline events from your encrypted backup. Existing local events are kept.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Restore',
          onPress: async () => {
            setBusy(true);
            try {
              const result = await restoreLatest(pin);
              setPin('');
              await refresh();
              Alert.alert(
                'Restore complete',
                `Added ${result.restoredEvents} events (${result.backupEvents} in backup).`,
              );
            } catch (e: any) {
              Alert.alert('Restore failed', e?.message || 'Could not restore');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  if (!unlocked) {
    return (
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Premium required</Text>
          <Text style={styles.body}>
            Encrypted Google Drive backup is included with Premium, Family, and Enterprise. Your
            current plan is {tier}.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => (onUpgrade ? onUpgrade() : setPaywallVisible(true))}>
            <Text style={styles.primaryBtnText}>View subscriptions</Text>
          </TouchableOpacity>
        </View>
        <PaywallModal
          visible={paywallVisible}
          title="Premium required"
          message="Drive sync needs Premium or higher."
          onClose={() => setPaywallVisible(false)}
          onUpgrade={() => {
            setPaywallVisible(false);
            onUpgrade?.();
          }}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.wrap, styles.centered]}>
        <ActivityIndicator color={colors.sky} />
      </View>
    );
  }

  const lastBackup =
    status?.lastBackupMs && status.lastBackupMs > 0
      ? new Date(status.lastBackupMs).toLocaleString()
      : 'Never';

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.hero}>Drive Sync</Text>
      <Text style={styles.sub}>
        Encrypted backup to your Google Drive app folder only — MRP never stores vault contents.
      </Text>

      {status?.pausedQuota ? (
        <View style={[styles.card, styles.warnCard]}>
          <Text style={styles.warnTitle}>Backup paused — Drive full</Text>
          <Text style={styles.body}>Local data is safe. Free Drive space, then back up again.</Text>
        </View>
      ) : null}

      {!status?.recoveryAcknowledged ? (
        <View style={[styles.card, styles.warnCard]}>
          <Text style={styles.warnTitle}>Recovery code required</Text>
          <Text style={styles.body}>
            Acknowledge your 12-word recovery code at PIN setup before enabling Drive. Without it,
            a lost PIN can make backups unrecoverable.
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status</Text>
        <Text style={styles.meta}>Google: {status?.email || (auth.emailMasked ?? 'Not signed in')}</Text>
        <Text style={styles.meta}>
          Drive appdata: {status?.driveConnected ? 'Connected' : 'Not connected'}
        </Text>
        <Text style={styles.meta}>Local timeline events: {status?.timelineCount ?? 0}</Text>
        <Text style={styles.meta}>Pending SIM sync items: {status?.pendingSyncCount ?? 0}</Text>
        <Text style={styles.meta}>Last backup: {lastBackup}</Text>
        {status?.remoteModifiedTime ? (
          <Text style={styles.meta}>Remote file: {status.remoteModifiedTime}</Text>
        ) : null}
        <TouchableOpacity style={styles.secondaryFull} onPress={refresh} disabled={busy}>
          <Text style={styles.secondaryBtnText}>Refresh status</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, busy && styles.btnDisabled]}
          onPress={onConnect}
          disabled={busy || !status?.recoveryAcknowledged}>
          <Text style={styles.primaryBtnText}>
            {status?.driveConnected ? 'Reconnect Drive' : 'Connect Drive'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Settings</Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.memberName}>Wi‑Fi only</Text>
            <Text style={styles.meta}>Skip uploads on cellular</Text>
          </View>
          <Switch
            value={!!status?.wifiOnly}
            onValueChange={async v => {
              await setDriveWifiOnly(v);
              await refresh();
            }}
            trackColor={{false: colors.border, true: colors.emeraldDark}}
            thumbColor={status?.wifiOnly ? colors.emerald : colors.textSecondary}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Backup / restore</Text>
        <Text style={styles.body}>
          PIN encrypts the backup (AES-GCM). Same Google account + same PIN restores on this phone
          or a new device. Scope is Drive app data only — MRP never requests full Drive access.
        </Text>
        <Text style={styles.body}>
          New device: install MRP → Google Sign-In → set PIN → acknowledge recovery → Connect Drive
          → Restore latest.
        </Text>
        {status?.wifiOnly &&
        status.lastBackupMs > 0 &&
        Date.now() - status.lastBackupMs > 24 * 60 * 60 * 1000 ? (
          <Text style={styles.meta}>
            Tip: last backup was over 24h ago. On Wi‑Fi, run Back up now (Wi‑Fi-only is enabled).
          </Text>
        ) : null}
        <Text style={styles.label}>MRP PIN</Text>
        <TextInput
          style={styles.input}
          value={pin}
          onChangeText={setPin}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
          placeholder="••••"
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity
          style={[styles.primaryBtn, busy && styles.btnDisabled]}
          onPress={onBackup}
          disabled={busy || !status?.driveConnected}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Back up now</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryFull}
          onPress={onRestore}
          disabled={busy || !status?.driveConnected}>
          <Text style={styles.secondaryBtnText}>Restore latest</Text>
        </TouchableOpacity>
      </View>

      <SyncPolicyPanel />

      <PaywallModal
        visible={paywallVisible}
        title="Premium required"
        message="Drive sync needs Premium or higher."
        onClose={() => setPaywallVisible(false)}
        onUpgrade={() => {
          setPaywallVisible(false);
          onUpgrade?.();
        }}
      />
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {flex: 1, padding: spacing.lg},
    centered: {alignItems: 'center', justifyContent: 'center'},
    scroll: {padding: spacing.lg, paddingBottom: spacing.xxl},
    hero: {fontSize: 26, fontWeight: '800', color: colors.textPrimary},
    sub: {fontSize: 14, color: colors.textMuted, marginTop: 6, marginBottom: spacing.md, lineHeight: 20},
    title: {fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm},
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    warnCard: {borderColor: colors.amber, backgroundColor: colors.amberSoft},
    warnTitle: {fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 6},
    cardTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm},
    body: {fontSize: 14, color: colors.textBody, lineHeight: 20, marginBottom: spacing.sm},
    meta: {fontSize: 13, color: colors.textMuted, marginBottom: 4},
    label: {fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, marginTop: 8},
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
      letterSpacing: 4,
    },
    primaryBtn: {
      backgroundColor: colors.sky,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    primaryBtnText: {color: '#fff', fontWeight: '800', fontSize: 14},
    secondaryFull: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    secondaryBtnText: {color: colors.sky, fontWeight: '700', fontSize: 14},
    btnDisabled: {opacity: 0.55},
    row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    rowText: {flex: 1, paddingRight: 12},
    memberName: {fontSize: 15, fontWeight: '700', color: colors.textPrimary},
  });
}
