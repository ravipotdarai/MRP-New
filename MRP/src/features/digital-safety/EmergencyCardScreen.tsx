import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {ColorPalette, spacing, radius, brandColors} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {DigitalSafetyNative, type EmergencyCard} from './DigitalSafety.native';

const VIS_OPTIONS = [
  {key: 'name', label: 'Name'},
  {key: 'bloodGroup', label: 'Blood group'},
  {key: 'allergies', label: 'Allergies'},
  {key: 'contacts', label: 'Contacts'},
  {key: 'instructions', label: 'Instructions'},
] as const;

export function EmergencyCardScreen({
  onBack,
  embedded = false,
}: {
  onBack?: () => void;
  embedded?: boolean;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [card, setCard] = useState<EmergencyCard>({});
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setCard(await DigitalSafetyNative.getEmergencyCard());
    } catch (e: any) {
      Alert.alert('Load failed', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await DigitalSafetyNative.saveEmergencyCard(card);
      setCard(saved);
      Alert.alert('Saved', 'Emergency Card updated on this device.');
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const addContact = () => {
    if (!contactName.trim() || contactPhone.trim().length < 8) {
      Alert.alert('Contact', 'Enter name and phone (8+ digits).');
      return;
    }
    const contacts = [...(card.contacts || []), {name: contactName.trim(), phone: contactPhone.trim()}];
    setCard({...card, contacts});
    setContactName('');
    setContactPhone('');
  };

  const toggleVisible = (key: string) => {
    const cur = new Set(card.visibleFields || []);
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    setCard({...card, visibleFields: Array.from(cur)});
  };

  const visible = new Set(card.visibleFields || []);

  if (preview) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.pad}>
        <TouchableOpacity onPress={() => setPreview(false)}>
          <Text style={styles.backText}>‹ Edit card</Text>
        </TouchableOpacity>
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>EMERGENCY</Text>
          {visible.has('name') && card.name ? (
            <Text style={styles.previewName}>{card.name}</Text>
          ) : null}
          {visible.has('bloodGroup') && card.bloodGroup ? (
            <Text style={styles.previewLine}>Blood: {card.bloodGroup}</Text>
          ) : null}
          {visible.has('allergies') && card.allergies ? (
            <Text style={styles.previewLine}>Allergies: {card.allergies}</Text>
          ) : null}
          {visible.has('contacts')
            ? (card.contacts || []).map((c, i) => (
                <Text key={i} style={styles.previewLine}>
                  {c.name}: {c.phone}
                </Text>
              ))
            : null}
          {visible.has('instructions') && card.instructions ? (
            <Text style={styles.previewLine}>{card.instructions}</Text>
          ) : null}
        </View>
        <Text style={styles.footer}>
          Lock-screen visibility depends on Android / OEM. MRP cannot bypass lock-screen security.
          Secure Vault contents are never shown here.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.pad}>
      {!embedded && onBack ? (
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>‹ Digital Safety</Text>
        </TouchableOpacity>
      ) : null}
      {!embedded ? (
        <>
          <Text style={styles.title}>Emergency Card</Text>
          <Text style={styles.sub}>ICE info you choose to share in an emergency</Text>
        </>
      ) : (
        <Text style={styles.sub}>ICE info you choose to share in an emergency</Text>
      )}

      {busy ? <ActivityIndicator color={brandColors.googleBlue} /> : null}

      <Field label="Full name" value={card.name || ''} onChange={v => setCard({...card, name: v})} colors={colors} styles={styles} />
      <Field label="Blood group" value={card.bloodGroup || ''} onChange={v => setCard({...card, bloodGroup: v})} colors={colors} styles={styles} />
      <Field label="Allergies" value={card.allergies || ''} onChange={v => setCard({...card, allergies: v})} colors={colors} styles={styles} multiline />
      <Field label="Insurance" value={card.insurance || ''} onChange={v => setCard({...card, insurance: v})} colors={colors} styles={styles} />
      <Field label="Medical notes" value={card.medicalNotes || ''} onChange={v => setCard({...card, medicalNotes: v})} colors={colors} styles={styles} multiline />
      <Field label="Instructions" value={card.instructions || ''} onChange={v => setCard({...card, instructions: v})} colors={colors} styles={styles} multiline />

      <Text style={styles.section}>Emergency contacts</Text>
      {(card.contacts || []).map((c, i) => (
        <View key={i} style={styles.contactRow}>
          <Text style={styles.contactText}>
            {c.name} · {c.phone}
          </Text>
          <TouchableOpacity
            onPress={() =>
              setCard({
                ...card,
                contacts: (card.contacts || []).filter((_, j) => j !== i),
              })
            }>
            <Text style={styles.remove}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}
      <Field label="Contact name" value={contactName} onChange={setContactName} colors={colors} styles={styles} />
      <Field label="Phone" value={contactPhone} onChange={setContactPhone} colors={colors} styles={styles} />
      <TouchableOpacity style={styles.secondary} onPress={addContact}>
        <Text style={styles.secondaryText}>Add contact</Text>
      </TouchableOpacity>

      <Text style={styles.section}>Lock-screen visibility</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Allow lock-screen summary</Text>
        <Switch
          value={!!card.lockScreenEnabled}
          onValueChange={v => setCard({...card, lockScreenEnabled: v})}
        />
      </View>
      {VIS_OPTIONS.map(o => (
        <View key={o.key} style={styles.row}>
          <Text style={styles.label}>{o.label}</Text>
          <Switch value={visible.has(o.key)} onValueChange={() => toggleVisible(o.key)} />
        </View>
      ))}

      <TouchableOpacity style={styles.primary} onPress={save} disabled={busy}>
        <Text style={styles.primaryText}>Save</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={() => setPreview(true)}>
        <Text style={styles.secondaryText}>Preview emergency view</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.dangerOutline}
        onPress={() =>
          Alert.alert('Clear Emergency Card?', 'This removes ICE data from this device.', [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Clear',
              style: 'destructive',
              onPress: async () => {
                await DigitalSafetyNative.clearEmergencyCard();
                setCard({});
              },
            },
          ])
        }>
        <Text style={styles.dangerOutlineText}>Clear card</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  colors,
  styles,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  multiline?: boolean;
}) {
  return (
    <View style={{marginBottom: spacing.sm}}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && {minHeight: 72}]}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
      />
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    pad: {padding: spacing.lg, paddingBottom: spacing.xxl},
    backText: {color: brandColors.googleBlue, fontWeight: '700', marginBottom: spacing.sm},
    title: {fontSize: 24, fontWeight: '800', color: colors.textPrimary},
    sub: {fontSize: 14, color: colors.textMuted, marginBottom: spacing.md},
    section: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textMuted,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      letterSpacing: 0.5,
    },
    label: {fontSize: 13, color: colors.textSecondary, marginBottom: 4},
    input: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      color: colors.textPrimary,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    contactRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    contactText: {color: colors.textPrimary, flex: 1},
    remove: {color: brandColors.googleRed, fontWeight: '700'},
    primary: {
      backgroundColor: brandColors.googleBlue,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    primaryText: {color: '#fff', fontWeight: '800'},
    secondary: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    secondaryText: {color: colors.textPrimary, fontWeight: '700'},
    dangerOutline: {
      borderWidth: 1,
      borderColor: brandColors.googleRed,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    dangerOutlineText: {color: brandColors.googleRed, fontWeight: '700'},
    previewCard: {
      backgroundColor: '#111',
      borderRadius: radius.lg,
      padding: spacing.xl,
      marginTop: spacing.lg,
      borderWidth: 3,
      borderColor: brandColors.googleRed,
    },
    previewTitle: {
      color: brandColors.googleRed,
      fontWeight: '900',
      fontSize: 20,
      letterSpacing: 2,
      marginBottom: spacing.md,
    },
    previewName: {color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 8},
    previewLine: {color: '#eee', fontSize: 16, marginBottom: 6},
    footer: {
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: 'italic',
      marginTop: spacing.md,
      lineHeight: 18,
    },
  });
}
