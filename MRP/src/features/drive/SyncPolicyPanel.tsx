import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, StyleSheet, Switch, TextInput} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {
  getTrackingConfig,
  pullRemoteTrackingConfig,
  setTrackingConfig,
  type DeviceTrackingConfig,
} from '../../native/DeviceTracking.types';
import {BackgroundLocationDisclosure} from '../setup/BackgroundLocationDisclosure';

const BOOL_TOGGLES = [
  ['movementTracking', 'Movement tracking (on-device)'],
  ['backgroundTracking', 'Background tracking'],
  ['highAccuracy', 'High accuracy GPS'],
  ['eventSyncEnabled', 'Sync events to Drive'],
  ['syncOnWifi', 'Allow chunk sync on Wi‑Fi'],
  ['syncOnMobileData', 'Allow chunk sync on mobile data (LTE/5G)'],
  ['syncLocation', 'Include live location in Drive'],
  ['syncGeofenceChanges', 'Sync when geofence changes'],
  ['syncSelfiesPremium', 'Premium+ selfies in Drive'],
  ['emergencyTracking', 'Emergency Tracking'],
] as const;

/** Firebase device_config toggles — Hub → Drive Sync (not Geofence). */
export function SyncPolicyPanel() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [cfg, setCfg] = useState<DeviceTrackingConfig | null>(null);
  const [discloseBg, setDiscloseBg] = useState(false);
  const pendingBg = useRef(false);

  const refresh = useCallback(async () => {
    try {
      await pullRemoteTrackingConfig().catch(() => null);
      setCfg(await getTrackingConfig());
    } catch {
      setCfg(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateCfg = async (patch: Partial<DeviceTrackingConfig>) => {
    if (!cfg) return;
    const next = {...cfg, ...patch};
    setCfg(next);
    await setTrackingConfig(next);
  };

  const onToggle = (key: keyof DeviceTrackingConfig, v: boolean) => {
    if (key === 'backgroundTracking' && v && !cfg?.backgroundTracking) {
      pendingBg.current = true;
      setDiscloseBg(true);
      return;
    }
    void updateCfg({[key]: v});
  };

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sync policy (MRP config only)</Text>
        <Text style={styles.body}>
          Location and events stay on this device and sync to Drive. MRP stores only these
          toggles (what / when / how often) — never coordinates or selfies.
        </Text>
        {cfg ? (
          <>
            {BOOL_TOGGLES.map(([key, label]) => (
              <View key={key} style={styles.switchRow}>
                <Text style={styles.labelRow}>{label}</Text>
                <Switch
                  value={!!cfg[key]}
                  onValueChange={v => onToggle(key, v)}
                  trackColor={{false: colors.border, true: colors.emeraldDark}}
                  thumbColor={cfg[key] ? colors.emerald : colors.textSecondary}
                />
              </View>
            ))}
            <Text style={styles.label}>Normal sync frequency (minutes, min 10)</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={String(cfg.syncFrequencyMinutes)}
              onChangeText={t => {
                const n = Math.max(10, parseInt(t || '10', 10) || 10);
                void updateCfg({syncFrequencyMinutes: n});
              }}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.label}>Emergency interval (minutes, min 1)</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={String(cfg.emergencyIntervalMinutes)}
              onChangeText={t => {
                const n = Math.max(1, parseInt(t || '1', 10) || 1);
                void updateCfg({emergencyIntervalMinutes: n});
              }}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={[styles.meta, {marginTop: 8}]}>
              Security events sync to Drive immediately. Normal cadence is ≥10 min. Emergency /
              Find-my-device uses its own interval (min 1). After one Hub → Drive “Back up now”, auto
              Drive sync can use that PIN on device.
            </Text>
            {!!cfg.emergencyTracking ? (
              <Text style={[styles.meta, {marginTop: 4, color: colors.amber}]}>
                Emergency tracking is active. MRP syncs faster over any validated network
                (saved Wi‑Fi or mobile data) and panics on USB attach or SIM removal. SIM
                removal also turns emergency on automatically. Turn off when done to save battery.
              </Text>
            ) : (
              <Text style={[styles.meta, {marginTop: 4}]}>
                Removing the SIM automatically enables emergency tracking and panic sync to Drive.
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.meta}>Loading policy…</Text>
        )}
      </View>
      <BackgroundLocationDisclosure
        visible={discloseBg}
        onCancel={() => {
          pendingBg.current = false;
          setDiscloseBg(false);
        }}
        onContinue={() => {
          setDiscloseBg(false);
          if (pendingBg.current) {
            pendingBg.current = false;
            void updateCfg({backgroundTracking: true});
          }
        }}
      />
    </>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    body: {
      fontSize: 14,
      color: colors.textBody,
      lineHeight: 20,
      marginBottom: spacing.sm,
    },
    meta: {fontSize: 13, color: colors.textMuted, marginBottom: 4},
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 8,
    },
    labelRow: {fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1, paddingRight: 8},
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      backgroundColor: colors.bg,
      marginBottom: 4,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
  });
}
