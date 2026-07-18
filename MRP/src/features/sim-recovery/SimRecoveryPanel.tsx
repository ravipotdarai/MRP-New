import React, {useCallback, useEffect, useState} from 'react';
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

/**
 * One master toggle: Protection Enabled.
 * Turning it ON requests Phone + SMS permissions (no separate Phone toggle needed).
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

  const bridge = mrpmModule as any;

  const refresh = useCallback(async () => {
    try {
      if (!bridge?.getSimRecoveryStatus) {
        setLoadError('Native SIM Recovery module not available. Reinstall the app.');
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
      if (typeof bridge.requestRuntimePermissions === 'function') {
        return !!(await bridge.requestRuntimePermissions(permissions));
      }
      const result = await PermissionsAndroid.requestMultiple(permissions as any);
      return permissions.every(
        p => result[p] === PermissionsAndroid.RESULTS.GRANTED,
      );
    } catch {
      return false;
    }
  };

  const phonePerms = (): string[] => {
    const perms = [PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE];
    if (Platform.Version >= 33) {
      perms.push('android.permission.READ_PHONE_NUMBERS');
    }
    return perms;
  };

  const enableProtection = async (): Promise<boolean> => {
    // SMS is required to send alerts; Phone is best-effort for "New Number"
    const smsOk = await requestPerms([PermissionsAndroid.PERMISSIONS.SEND_SMS]);
    if (!smsOk) {
      Alert.alert(
        'SMS permission needed',
        'Allow SMS so recovery contacts can be alerted when the SIM changes.',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Open Settings',
            onPress: () => bridge.openAppSettings?.(),
          },
        ],
      );
      return false;
    }

    const phoneOk = await requestPerms(phonePerms());
    if (!phoneOk) {
      // Still enable — SMS works; New Number may show Unavailable
      Alert.alert(
        'Phone permission skipped',
        'SIM Recovery will still work. Without Phone permission, the SMS may not include the new SIM number.',
      );
    }

    await bridge.setSimRecoveryEnabled(true, true);
    await refresh();
    return true;
  };

  const onProtectionPress = async () => {
    if (busy) return;
    const enabled = !!status?.enabled;

    if (enabled) {
      Alert.alert('Disable SIM Recovery?', 'Alerts will stop until you enable again.', [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Disable',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await bridge.setSimRecoveryEnabled(false, status?.consent ?? false);
              await refresh();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to disable');
            } finally {
              setBusy(false);
              setSwitchKey(k => k + 1);
            }
          },
        },
      ]);
      return;
    }

    Alert.alert(
      'Enable SIM Change Recovery?',
      'When another SIM is inserted, MRP will SMS your recovery contacts with location (works offline).\n\nThis will ask for SMS and Phone permissions.',
      [
        {text: 'Cancel', style: 'cancel', onPress: () => setSwitchKey(k => k + 1)},
        {
          text: 'Enable',
          onPress: async () => {
            setBusy(true);
            try {
              const ok = await enableProtection();
              if (!ok) {
                /* stay off */
              }
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to enable');
            } finally {
              setBusy(false);
              setSwitchKey(k => k + 1);
            }
          },
        },
      ],
    );
  };

  const addContact = async () => {
    if (!phone.trim() || phone.replace(/\D/g, '').length < 8) {
      Alert.alert('Invalid phone', 'Enter a valid phone number (min 8 digits).');
      return;
    }
    if (contacts.length >= 3) {
      Alert.alert('Limit reached', 'Maximum 3 recovery contacts.');
      return;
    }
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  };

  const removeContact = (id: string) => {
    Alert.alert('Remove contact?', 'This cannot be undone.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await bridge.deleteRecoveryContact(id);
          await refresh();
        },
      },
    ]);
  };

  const testSms = async () => {
    if (!contacts.length) {
      Alert.alert('Add a contact first', 'Save at least one recovery contact before testing SMS.');
      return;
    }
    setBusy(true);
    try {
      const smsOk = await requestPerms([PermissionsAndroid.PERMISSIONS.SEND_SMS]);
      if (!smsOk) {
        Alert.alert('SMS permission required', 'Allow SMS, then try Test SMS again.');
        return;
      }
      // Best-effort phone for New Number line
      await requestPerms(phonePerms());

      const result = await bridge.testRecoverySms();
      const ok = typeof result === 'boolean' ? result : !!result?.success;
      const detail =
        typeof result === 'object' && result?.message
          ? result.message
          : ok
            ? 'Check the recovery phone for the test message.'
            : 'Check SMS permission and contact numbers.';

      Alert.alert(ok ? 'Test SMS sent' : 'SMS failed', detail);
      await refresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Test failed');
    } finally {
      setBusy(false);
    }
  };

  const clearHistory = () => {
    Alert.alert('Delete SIM change history?', undefined, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await bridge.deleteSimChangeHistory();
          await refresh();
        },
      },
    ]);
  };

  const fmt = (ms: number) => (ms > 0 ? new Date(ms).toLocaleString() : 'Never');

  return (
    <View style={styles.card}>
      <Text style={styles.title}>SIM Change Recovery</Text>
      <Text style={styles.subtitle}>
        One switch turns this on. Enabling asks for SMS (required) and Phone (for New Number on the
        alert). Add up to 3 recovery contacts, then use Test SMS.
      </Text>

      {loadError ? (
        <Text style={styles.errorText}>{loadError}</Text>
      ) : null}

      <TouchableOpacity
        style={styles.row}
        onPress={onProtectionPress}
        activeOpacity={0.7}
        disabled={busy}>
        <View style={{flex: 1}}>
          <Text style={styles.rowTitle}>Protection Enabled</Text>
          <Text style={styles.rowSub}>
            {status?.enabled
              ? 'Armed — will SMS contacts on SIM change'
              : 'Off — tap to enable (requests SMS + Phone)'}
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

      <View style={styles.stats}>
        <Stat label="Carrier" value={status?.currentCarrier || '—'} />
        <Stat
          label="SIM Number"
          value={
            status?.currentSimPhoneMasked ||
            (status?.phonePermissionGranted === false
              ? 'Allow Phone when enabling'
              : 'Not provided by carrier')
          }
        />
        <Stat label="Contacts" value={String(status?.contactCount ?? 0)} />
        <Stat label="Last SMS" value={fmt(status?.lastSmsMs ?? 0)} />
        <Stat
          label="Baseline"
          value={status?.baselineEnrolled ? 'Enrolled' : 'Not set'}
        />
        <Stat label="Pending Sync" value={String(status?.pendingSync ?? 0)} />
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
          <TouchableOpacity onPress={() => removeContact(c.id)}>
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
          <Text style={styles.btnSecondaryText}>Test SMS</Text>
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
