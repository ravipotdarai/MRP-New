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
import {PaywallModal} from '../subscription/PaywallModal';
import {
  evaluateGeofenceHere,
  listGeofenceZones,
  removeGeofenceZone,
  upsertGeofenceZone,
  type GeofenceEval,
  type GeofenceZone,
} from '../../native/Geofence.types';
import {
  getTrackingConfig,
  pullRemoteTrackingConfig,
  setTrackingConfig,
  startDevicePresence,
  type DeviceTrackingConfig,
} from '../../native/DeviceTracking.types';
import mrpmModule from '../../shared/hooks/useNativeBridge';

type Props = {onUpgrade?: () => void};

export function GeofenceScreen({onUpgrade}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {canUseFeature} = useEntitlements();
  const unlocked = canUseFeature('geofence');

  const [zones, setZones] = useState<GeofenceZone[]>([]);
  const [here, setHere] = useState<GeofenceEval | null>(null);
  const [cfg, setCfg] = useState<DeviceTrackingConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [name, setName] = useState('Home');
  const [radius, setRadius] = useState('150');

  const refresh = useCallback(async () => {
    const [z, h, c] = await Promise.all([
      listGeofenceZones(),
      evaluateGeofenceHere().catch(() => null),
      getTrackingConfig(),
    ]);
    setZones(z);
    setHere(h);
    setCfg(c);
    await pullRemoteTrackingConfig().catch(() => false);
    await startDevicePresence().catch(() => false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!unlocked) {
    return (
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Premium required</Text>
          <Text style={styles.body}>Geofence zones are a Premium+ feature.</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => (onUpgrade ? onUpgrade() : setPaywall(true))}>
            <Text style={styles.primaryBtnText}>View subscriptions</Text>
          </TouchableOpacity>
        </View>
        <PaywallModal
          visible={paywall}
          message="Geofence needs Premium or higher."
          onClose={() => setPaywall(false)}
          onUpgrade={() => {
            setPaywall(false);
            onUpgrade?.();
          }}
        />
      </View>
    );
  }

  const addAtCurrent = async () => {
    setBusy(true);
    try {
      let lat = here?.latitude;
      let lng = here?.longitude;
      if (lat == null || lng == null) {
        const live = await (mrpmModule as any).getCurrentLocationWithAddress?.();
        lat = live?.latitude;
        lng = live?.longitude;
      }
      if (lat == null || lng == null) {
        Alert.alert('No location', 'Enable location and try again.');
        return;
      }
      await upsertGeofenceZone({
        name: name.trim() || 'Home',
        latitude: lat,
        longitude: lng,
        radiusMeters: Math.max(30, parseFloat(radius) || 150),
        enabled: true,
      });
      await refresh();
      Alert.alert('Zone saved', 'Timeline events will show Inside / Away for this zone.');
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Could not save zone');
    } finally {
      setBusy(false);
    }
  };

  const updateCfg = async (patch: Partial<DeviceTrackingConfig>) => {
    if (!cfg) return;
    const next = {...cfg, ...patch};
    setCfg(next);
    await setTrackingConfig(next);
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.hero}>Geofence</Text>
      <Text style={styles.sub}>
        Define safe zones. Timeline shows Inside/Away on events, plus separate Enter/Exit rows
        when a zone boundary is crossed. Location is only resolved for monitoring events — not
        held continuously.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>You are here</Text>
        {here ? (
          <>
            <Text style={styles.meta}>{here.address || `${here.latitude}, ${here.longitude}`}</Text>
            <Text style={styles.meta}>
              {[here.city, here.state, here.postalCode, here.country].filter(Boolean).join(' · ') ||
                'Address parts pending'}
            </Text>
            <Text style={styles.meta}>
              {here.insideGeofence
                ? `Inside ${here.geofenceName || 'zone'}`
                : here.distanceToFenceM >= 0
                  ? `Away · ${Math.round(here.distanceToFenceM)} m from nearest zone`
                  : 'No zones yet'}
            </Text>
          </>
        ) : (
          <Text style={styles.body}>Waiting for location…</Text>
        )}
        <TouchableOpacity style={styles.secondaryFull} onPress={refresh} disabled={busy}>
          <Text style={styles.secondaryBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add zone at current location</Text>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Home"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.label}>Radius (meters)</Text>
        <TextInput
          style={styles.input}
          value={radius}
          onChangeText={setRadius}
          keyboardType="number-pad"
          placeholder="150"
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity
          style={[styles.primaryBtn, busy && {opacity: 0.6}]}
          onPress={addAtCurrent}
          disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Save zone here</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your zones</Text>
        {zones.length === 0 ? (
          <Text style={styles.body}>No zones yet.</Text>
        ) : (
          zones.map(z => (
            <View key={z.id} style={styles.zoneRow}>
              <View style={{flex: 1}}>
                <Text style={styles.zoneName}>
                  {z.name} {z.enabled ? '' : '(off)'}
                </Text>
                <Text style={styles.meta}>
                  {z.radiusMeters} m · {z.latitude.toFixed(5)}, {z.longitude.toFixed(5)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert('Remove zone?', z.name, [
                    {text: 'Cancel', style: 'cancel'},
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: async () => {
                        await removeGeofenceZone(z.id);
                        await refresh();
                      },
                    },
                  ])
                }>
                <Text style={styles.remove}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sync policy (Firebase config only)</Text>
        <Text style={styles.body}>
          Location and events stay on this device and sync to Drive. Firebase stores only these
          toggles (what / when / how often) — never coordinates or selfies.
        </Text>
        {cfg ? (
          <>
            {(
              [
                ['movementTracking', 'Movement tracking (on-device)'],
                ['backgroundTracking', 'Background tracking'],
                ['highAccuracy', 'High accuracy GPS'],
                ['eventSyncEnabled', 'Sync events to Drive'],
                ['syncOnWifi', 'Allow sync on Wi‑Fi'],
                ['syncOnMobileData', 'Allow sync on mobile data'],
                ['syncLocation', 'Include live location in Drive'],
                ['syncGeofenceChanges', 'Sync when geofence changes'],
                ['syncSelfiesPremium', 'Premium+ selfies in Drive'],
                ['emergencyTracking', 'Emergency Tracking'],
              ] as const
            ).map(([key, label]) => (
              <View key={key} style={styles.switchRow}>
                <Text style={styles.zoneName}>{label}</Text>
                <Switch
                  value={!!cfg[key]}
                  onValueChange={v => updateCfg({[key]: v})}
                  trackColor={{false: colors.border, true: colors.emeraldDark}}
                  thumbColor={cfg[key] ? colors.emerald : colors.textSecondary}
                />
              </View>
            ))}
            <Text style={styles.label}>Normal sync frequency (minutes, min 1)</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={String(cfg.syncFrequencyMinutes)}
              onChangeText={t => {
                const n = Math.max(1, parseInt(t || '1', 10) || 1);
                updateCfg({syncFrequencyMinutes: n});
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
                updateCfg({emergencyIntervalMinutes: n});
              }}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={[styles.meta, {marginTop: 8}]}>
              After one Hub → Drive “Back up now”, auto Drive sync can use that PIN securely on
              device. Web reads Drive vault — not Firebase live nodes.
            </Text>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {flex: 1, padding: spacing.lg},
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
    cardTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm},
    body: {fontSize: 14, color: colors.textBody, lineHeight: 20, marginBottom: spacing.sm},
    meta: {fontSize: 13, color: colors.textMuted, marginBottom: 4},
    label: {fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 6},
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
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
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    secondaryBtnText: {color: colors.sky, fontWeight: '700'},
    zoneRow: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm},
    zoneName: {fontSize: 15, fontWeight: '700', color: colors.textPrimary},
    remove: {color: colors.red, fontWeight: '700'},
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
  });
}
