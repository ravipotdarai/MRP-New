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
import {startDevicePresence} from '../../native/DeviceTracking.types';
import mrpmModule from '../../shared/hooks/useNativeBridge';

type Props = {onUpgrade?: () => void};

export function GeofenceScreen({onUpgrade}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {canUseFeature} = useEntitlements();
  const unlocked = canUseFeature('geofence');

  const [zones, setZones] = useState<GeofenceZone[]>([]);
  const [here, setHere] = useState<GeofenceEval | null>(null);
  const [busy, setBusy] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [name, setName] = useState('Home');
  const [radiusMeters, setRadiusMeters] = useState('150');

  const refresh = useCallback(async () => {
    const [z, h] = await Promise.all([
      listGeofenceZones(),
      evaluateGeofenceHere().catch(() => null),
    ]);
    setZones(z);
    setHere(h);
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
        radiusMeters: Math.max(30, parseFloat(radiusMeters) || 150),
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

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.hero}>Geofence</Text>
      <Text style={styles.sub}>
        Define safe zones. Timeline shows Inside/Away on events, plus Enter/Exit when a boundary
        is crossed. Sync policy (Drive / Firebase toggles) lives under Hub → Drive Sync.
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
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.label}>Radius (meters)</Text>
        <TextInput
          style={styles.input}
          value={radiusMeters}
          onChangeText={setRadiusMeters}
          keyboardType="number-pad"
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={addAtCurrent} disabled={busy}>
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
                <Text style={styles.zoneName}>{z.name}</Text>
                <Text style={styles.meta}>
                  {Math.round(z.radiusMeters)} m · {z.latitude.toFixed(4)}, {z.longitude.toFixed(4)}
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
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {flex: 1, padding: spacing.lg},
    scroll: {padding: spacing.lg, paddingBottom: spacing.xxl},
    hero: {fontSize: 26, fontWeight: '800', color: colors.textPrimary},
    sub: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 6,
      marginBottom: spacing.md,
      lineHeight: 20,
    },
    title: {fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm},
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
      backgroundColor: colors.bg,
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
  });
}
