import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  PermissionsAndroid,
  Linking,
} from 'react-native';
import mrpmModule from '../../shared/hooks/useNativeBridge';

type Contact = {
  id: string;
  name: string;
  phoneNumber: string;
  relationship: string;
  priority: number;
};

type Status = {
  enabled: boolean;
  consent: boolean;
  hasContacts: boolean;
  contactCount: number;
  lastSimChangeMs: number;
  lastSmsMs: number;
  pendingSync: number;
  currentCarrier: string;
  currentSlot: number;
  currentIccidMasked: string;
  baselineEnrolled: boolean;
  hasSimPhoneNumber?: boolean;
  currentSimPhoneMasked?: string;
  phonePermissionGranted?: boolean;
};

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>(resolve => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * SIM Change Recovery — single Protection toggle.
 * Phone permission is optional (often permanently denied on Pixel); SMS is required for Test SMS.
 */
export function SimRecoveryPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [busy, setBusy] = useState(false);
  const [switchKey, setSwitchKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const busyLock = useRef(false);

  const bridge = mrpmModule as any;

  const refresh = useCallback(async () => {
    try {
      if (!bridge?.getSimRecoveryStatus) {
        setLoadError('Native SIM Recovery module missing — reinstall the app.');
        return;
      }
      const [st, cts] = await Promise.all([
        bridge.getSimRecoveryStatus(),
        bridge.getRecoveryContacts(),
      ]);
      setStatus(st);
      setContacts(Array.isArray(cts) ? cts : []);
      setLoadError(null);
    } catch (e: any) {
      console.error('[SimRecovery] refresh failed', e);
      setLoadError(e?.message || String(e));
    }
  }, [bridge]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requestPerms = async (permissions: string[]): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      // Already granted?
      const checks = await Promise.all(
        permissions.map(p => PermissionsAndroid.check(p as any)),
      );
      if (checks.every(Boolean)) return true;

      if (typeof bridge.requestRuntimePermissions === 'function') {
        return await withTimeout(
          bridge.requestRuntimePermissions(permissions),
          8000,
          false,
        );
      }
      const result = await withTimeout(
        PermissionsAndroid.requestMultiple(permissions as any),
        8000,
        {} as Record<string, string>,
      );
      return permissions.every(
        p => result[p] === PermissionsAndroid.RESULTS.GRANTED,
      );
    } catch (e) {
      console.warn('[SimRecovery] requestPerms', e);
      return false;
    }
  };

  const runBusy = async (fn: () => Promise<void>) => {
    if (busyLock.current) return;
    busyLock.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyLock.current = false;
      setBusy(false);
      setSwitchKey(k => k + 1);
    }
  };

  const enableProtection = async () => {
    // SMS required
    const smsOk = await requestPerms([PermissionsAndroid.PERMISSIONS.SEND_SMS]);
    if (!smsOk) {
      Alert.alert(
        'SMS permission needed',
        'Allow SMS in system settings so recovery alerts can be sent.',
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Open Settings', onPress: () => bridge.openAppSettings?.()},
        ],
      );
      return;
    }

    // Phone is optional — do NOT block enable if permanently denied (USER_FIXED)
    let phoneOk = false;
    try {
      phoneOk = !!(await withTimeout(bridge.checkPhonePermission?.() ?? Promise.resolve(false), 2000, false));
    } catch {
      phoneOk = false;
    }
    if (!phoneOk) {
      // Best-effort short request; timeout avoids hang when USER_FIXED
      phoneOk = await requestPerms(
        Platform.Version >= 33
          ? [
              PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
              'android.permission.READ_PHONE_NUMBERS',
            ]
          : [PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE],
      );
    }

    await bridge.setSimRecoveryEnabled(true, true);
    await refresh();

    if (!phoneOk) {
      Alert.alert(
        'SIM Recovery enabled',
        'Phone permission is blocked in Android Settings (or denied). Alerts will still send, but "New Number" may show Unavailable until you enable Phone for MRP in Settings → Apps → MRP → Permissions.',
      );
    }
  };

  const onProtectionPress = () => {
    const enabled = !!status?.enabled;
    if (enabled) {
      Alert.alert('Disable SIM Recovery?', 'Alerts will stop until you enable again.', [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () =>
            runBusy(async () => {
              await bridge.setSimRecoveryEnabled(false, status?.consent ?? false);
              await refresh();
            }),
        },
      ]);
      return;
    }

    Alert.alert(
      'Enable SIM Change Recovery?',
      'On SIM change, MRP SMS your recovery contacts with location (works offline).\n\nSMS permission is required. Phone permission is optional (for New Number).',
      [
        {text: 'Cancel', style: 'cancel', onPress: () => setSwitchKey(k => k + 1)},
        {
          text: 'Enable',
          onPress: () =>
            runBusy(async () => {
              try {
                await enableProtection();
              } catch (e: any) {
                Alert.alert('Error', e?.message || 'Failed to enable');
              }
            }),
        },
      ],
    );
  };

  const addContact = () =>
    runBusy(async () => {
      if (!phone.trim() || phone.replace(/\D/g, '').length < 8) {
        Alert.alert('Invalid phone', 'Enter a valid phone number (min 8 digits).');
        return;
      }
      if (contacts.length >= 3) {
        Alert.alert('Limit reached', 'Maximum 3 recovery contacts.');
        return;
      }
      try {
        await bridge.saveRecoveryContact(
          name.trim() || 'Contact',
          phone.trim(),
          relationship.trim() || 'Trusted',
          contacts.length + 1,
        );
        setName('');
        setPhone('');
        setRelationship('');
        await refresh();
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Could not save contact');
      }
    });

  const removeContact = (id: string) => {
    Alert.alert('Remove contact?', 'This cannot be undone.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          runBusy(async () => {
            await bridge.deleteRecoveryContact(id);
            await refresh();
          }),
      },
    ]);
  };

  const testSms = () =>
    runBusy(async () => {
      if (!contacts.length) {
        Alert.alert('Add a contact first', 'Save at least one recovery contact before testing SMS.');
        return;
      }
      try {
        const smsOk = await requestPerms([PermissionsAndroid.PERMISSIONS.SEND_SMS]);
        if (!smsOk) {
          Alert.alert('SMS permission required', 'Allow SMS for MRP, then try again.', [
            {text: 'Cancel', style: 'cancel'},
            {text: 'Open Settings', onPress: () => bridge.openAppSettings?.()},
          ]);
          return;
        }

        const result = await withTimeout(
          bridge.testRecoverySms(),
          20000,
          {success: false, message: 'Timed out sending SMS'},
        );
        const ok = typeof result === 'boolean' ? result : !!result?.success;
        const detail =
          typeof result === 'object' && result?.message
            ? result.message
            : ok
              ? 'Check the recovery phone for the test message.'
              : 'SMS failed. Check contact numbers.';
        Alert.alert(ok ? 'Test SMS sent' : 'SMS failed', detail);
        await refresh();
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Test failed');
      }
    });

  const clearHistory = () => {
    Alert.alert('Delete SIM change history?', undefined, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          runBusy(async () => {
            await bridge.deleteSimChangeHistory();
            await refresh();
          }),
      },
    ]);
  };

  const openPhoneSettings = () => {
    Alert.alert(
      'Enable Phone permission',
      'Android blocked Phone access (Don\'t ask again). Open Settings → Apps → MRP → Permissions → Phone → Allow.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Open Settings',
          onPress: async () => {
            try {
              await bridge.openAppSettings?.();
            } catch {
              Linking.openSettings();
            }
          },
        },
      ],
    );
  };

  const fmt = (ms: number) => (ms > 0 ? new Date(ms).toLocaleString() : 'Never');

  return (
    <View style={styles.card}>
      <Text style={styles.title}>SIM Change Recovery</Text>
      <Text style={styles.subtitle}>
        Turn Protection ON, add a contact, then Test SMS. Phone permission is optional — if Android
        blocked it, open App Settings to allow Phone.
      </Text>

      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      <TouchableOpacity
        style={styles.row}
        onPress={onProtectionPress}
        activeOpacity={0.7}
        disabled={busy}>
        <View style={{flex: 1}}>
          <Text style={styles.rowTitle}>Protection Enabled</Text>
          <Text style={styles.rowSub}>
            {busy
              ? 'Working…'
              : status?.enabled
                ? 'Armed — SMS on SIM change'
                : 'Off — tap to enable'}
          </Text>
        </View>
        <View pointerEvents="none">
          <Switch
            key={switchKey}
            value={!!status?.enabled}
            trackColor={{false: '#334155', true: '#059669'}}
            thumbColor={status?.enabled ? '#10b981' : '#94a3b8'}
          />
        </View>
      </TouchableOpacity>

      {status?.phonePermissionGranted === false ? (
        <TouchableOpacity onPress={openPhoneSettings} style={styles.warnBanner}>
          <Text style={styles.warnText}>
            Phone permission blocked — tap to open Settings (needed for New Number in SMS)
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.stats}>
        <Stat label="Carrier" value={status?.currentCarrier || '—'} />
        <Stat
          label="SIM Number"
          value={
            status?.currentSimPhoneMasked ||
            (status?.phonePermissionGranted === false
              ? 'Phone blocked in Settings'
              : 'Not provided by carrier')
          }
        />
        <Stat label="Contacts" value={String(status?.contactCount ?? 0)} />
        <Stat label="Last SMS" value={fmt(status?.lastSmsMs ?? 0)} />
        <Stat
          label="Baseline"
          value={status?.baselineEnrolled ? 'Enrolled' : 'Not set'}
        />
        <Stat label="SMS Perm" value={status?.enabled ? 'Required' : '—'} />
      </View>

      <Text style={styles.section}>Recovery Contacts (max 3)</Text>
      {contacts.map(c => (
        <View key={c.id} style={styles.contactRow}>
          <View style={{flex: 1}}>
            <Text style={styles.contactName}>
              {c.name} · P{c.priority}
            </Text>
            <Text style={styles.contactPhone}>{c.phoneNumber}</Text>
            <Text style={styles.contactRel}>{c.relationship}</Text>
          </View>
          <TouchableOpacity onPress={() => removeContact(c.id)} disabled={busy}>
            <Text style={styles.delete}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}

      {contacts.length < 3 && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor="#64748b"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone (+91…)"
            placeholderTextColor="#64748b"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TextInput
            style={styles.input}
            placeholder="Relationship (Primary / Emergency)"
            placeholderTextColor="#64748b"
            value={relationship}
            onChangeText={setRelationship}
          />
          <TouchableOpacity style={styles.btn} onPress={addContact} disabled={busy}>
            <Text style={styles.btnText}>Add Contact</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.btnSecondary} onPress={testSms} disabled={busy}>
          <Text style={styles.btnSecondaryText}>{busy ? '…' : 'Test SMS'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSecondary} onPress={clearHistory} disabled={busy}>
          <Text style={styles.btnSecondaryText}>Delete History</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Stat({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  title: {color: '#f8fafc', fontSize: 16, fontWeight: '700', marginBottom: 4},
  subtitle: {color: '#94a3b8', fontSize: 13, lineHeight: 18, marginBottom: 12},
  errorText: {color: '#fca5a5', fontSize: 12, marginBottom: 8},
  warnBanner: {
    backgroundColor: '#422006',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  warnText: {color: '#fdba74', fontSize: 12, lineHeight: 16},
  row: {flexDirection: 'row', alignItems: 'center', marginBottom: 12},
  rowTitle: {color: '#e2e8f0', fontSize: 15, fontWeight: '600'},
  rowSub: {color: '#64748b', fontSize: 12, marginTop: 2, paddingRight: 8},
  stats: {flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10},
  stat: {
    width: '47%',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 10,
    marginRight: '3%',
    marginBottom: 8,
  },
  statLabel: {color: '#64748b', fontSize: 11, textTransform: 'uppercase'},
  statValue: {color: '#38bdf8', fontSize: 13, fontWeight: '600', marginTop: 2},
  section: {color: '#cbd5e1', fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 4},
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  contactName: {color: '#f1f5f9', fontWeight: '600'},
  contactPhone: {color: '#38bdf8', fontFamily: 'monospace', marginTop: 2},
  contactRel: {color: '#64748b', fontSize: 12},
  delete: {color: '#ef4444', fontWeight: '600', padding: 8},
  form: {marginTop: 8},
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  btn: {
    backgroundColor: '#38bdf8',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  btnText: {color: '#0f172a', fontWeight: '700'},
  actions: {flexDirection: 'row', marginTop: 12},
  btnSecondary: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    marginRight: 8,
  },
  btnSecondaryText: {color: '#38bdf8', fontWeight: '600', fontSize: 13},
});
