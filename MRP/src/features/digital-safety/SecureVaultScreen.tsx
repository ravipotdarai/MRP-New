import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import {ColorPalette, spacing, radius, brandColors} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {DigitalSafetyNative, type SecureVaultItemMeta} from './DigitalSafety.native';

const FOOTER =
  'Documents encrypted on device and in Google Drive. MRP cannot recover your PIN.';

export function SecureVaultScreen({
  onBack,
  embedded = false,
}: {
  onBack?: () => void;
  embedded?: boolean;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<SecureVaultItemMeta[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [editor, setEditor] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('notes');
  const [expiryDays, setExpiryDays] = useState('');
  const [viewItem, setViewItem] = useState<SecureVaultItemMeta | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await DigitalSafetyNative.listSecureVaultItems());
      setCategories(await DigitalSafetyNative.getSecureVaultCategories());
    } catch (e: any) {
      Alert.alert('Vault', e?.message || String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unlock = () => {
    if (pin.length < 4) {
      Alert.alert('PIN required', 'Enter your MRP PIN (4+ digits).');
      return;
    }
    setUnlocked(true);
  };

  const create = async () => {
    if (!unlocked) {
      Alert.alert('Unlock first', 'Enter your MRP PIN to create items.');
      return;
    }
    setBusy(true);
    try {
      const days = parseInt(expiryDays, 10);
      const expiryAtMs =
        Number.isFinite(days) && days > 0
          ? Date.now() + days * 24 * 60 * 60 * 1000
          : 0;
      await DigitalSafetyNative.createSecureVaultItem(
        pin,
        category,
        title,
        body,
        expiryAtMs,
      );
      setEditor(false);
      setTitle('');
      setBody('');
      setExpiryDays('');
      await load();
    } catch (e: any) {
      Alert.alert('Create failed', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const openItem = async (id: string) => {
    if (!unlocked) {
      Alert.alert('Unlock first', 'Enter your MRP PIN to view items.');
      return;
    }
    setBusy(true);
    try {
      const item = await DigitalSafetyNative.getSecureVaultItem(id, pin);
      setViewItem(item);
    } catch (e: any) {
      Alert.alert('Open failed', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    Alert.alert('Delete item?', 'This removes the encrypted local copy.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await DigitalSafetyNative.deleteSecureVaultItem(id);
          setViewItem(null);
          await load();
        },
      },
    ]);
  };

  const backup = async () => {
    if (!unlocked) return;
    setBusy(true);
    try {
      const r = await DigitalSafetyNative.backupSecureVault(pin);
      if (r.ok) Alert.alert('Backup OK', `Encrypted upload (${r.bytes ?? 0} bytes).`);
      else Alert.alert('Backup failed', r.error || 'unknown');
    } catch (e: any) {
      Alert.alert('Backup failed', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!unlocked) return;
    setBusy(true);
    try {
      const r = await DigitalSafetyNative.restoreSecureVault(pin);
      if (r.ok) {
        Alert.alert('Restored', `${r.count ?? 0} item(s) merged.`);
        await load();
      } else Alert.alert('Restore failed', r.error || 'unknown');
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.pad}>
      {!embedded && onBack ? (
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>‹ Digital Safety</Text>
        </TouchableOpacity>
      ) : null}
      {!embedded ? (
        <>
          <Text style={styles.title}>Secure Vault</Text>
          <Text style={styles.sub}>Encrypted documents & notes</Text>
        </>
      ) : (
        <Text style={styles.sub}>Encrypted documents & notes</Text>
      )}

      {!unlocked ? (
        <View style={styles.gate}>
          <Text style={styles.label}>MRP PIN</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            secureTextEntry
            keyboardType="number-pad"
            placeholder="Enter PIN"
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity style={styles.primary} onPress={unlock}>
            <Text style={styles.primaryText}>Unlock vault</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.unlocked}>Vault unlocked for this session</Text>
      )}

      {busy ? <ActivityIndicator color={brandColors.googleBlue} /> : null}

      {unlocked ? (
        <>
          <TouchableOpacity style={styles.primary} onPress={() => setEditor(true)}>
            <Text style={styles.primaryText}>New item</Text>
          </TouchableOpacity>
          <View style={styles.rowBtns}>
            <TouchableOpacity style={styles.secondaryFlex} onPress={backup}>
              <Text style={styles.secondaryText}>Drive backup</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryFlex} onPress={restore}>
              <Text style={styles.secondaryText}>Restore</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      <Text style={styles.section}>Items ({items.length})</Text>
      {items.length === 0 ? (
        <Text style={styles.muted}>No vault items yet.</Text>
      ) : (
        items.map(item => (
          <TouchableOpacity
            key={item.id}
            style={styles.card}
            onPress={() => openItem(item.id)}
            disabled={!unlocked}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.muted}>
              {item.category}
              {item.expiryAtMs
                ? ` · expires ${new Date(item.expiryAtMs).toLocaleDateString()}`
                : ''}
            </Text>
          </TouchableOpacity>
        ))
      )}

      <Text style={styles.footer}>{FOOTER}</Text>

      <Modal visible={editor} animationType="slide" onRequestClose={() => setEditor(false)}>
        <ScrollView style={styles.root} contentContainerStyle={styles.pad}>
          <Text style={styles.title}>New vault item</Text>
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 8}}>
            {(categories.length ? categories : ['notes']).map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, category === c && styles.chipOn]}
                onPress={() => setCategory(c)}>
                <Text style={styles.chipText}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.label}>Title</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} />
          <Text style={styles.label}>Secure note / details</Text>
          <TextInput
            style={[styles.input, {minHeight: 120}]}
            value={body}
            onChangeText={setBody}
            multiline
          />
          <Text style={styles.label}>Expiry reminder (days, optional)</Text>
          <TextInput
            style={styles.input}
            value={expiryDays}
            onChangeText={setExpiryDays}
            keyboardType="number-pad"
          />
          <TouchableOpacity style={styles.primary} onPress={create}>
            <Text style={styles.primaryText}>Encrypt & save</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={() => setEditor(false)}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      <Modal visible={!!viewItem} animationType="fade" onRequestClose={() => setViewItem(null)}>
        <ScrollView style={styles.root} contentContainerStyle={styles.pad}>
          <Text style={styles.title}>{viewItem?.title}</Text>
          <Text style={styles.muted}>{viewItem?.category}</Text>
          <Text style={styles.body}>{viewItem?.body || '(empty)'}</Text>
          <TouchableOpacity
            style={styles.dangerOutline}
            onPress={() => viewItem && remove(viewItem.id)}>
            <Text style={styles.dangerOutlineText}>Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={() => setViewItem(null)}>
            <Text style={styles.secondaryText}>Close</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    pad: {padding: spacing.lg, paddingBottom: spacing.xxl},
    backText: {color: brandColors.googleBlue, fontWeight: '700', marginBottom: spacing.sm},
    title: {fontSize: 24, fontWeight: '800', color: colors.textPrimary},
    sub: {fontSize: 14, color: colors.textMuted, marginBottom: spacing.md},
    gate: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    unlocked: {color: brandColors.googleGreen, fontWeight: '700', marginBottom: spacing.sm},
    section: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textMuted,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    label: {fontSize: 13, color: colors.textSecondary, marginBottom: 4, marginTop: 8},
    input: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      color: colors.textPrimary,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    cardTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
    muted: {fontSize: 13, color: colors.textMuted},
    body: {fontSize: 15, color: colors.textBody, marginTop: spacing.md, lineHeight: 22},
    primary: {
      backgroundColor: brandColors.googleBlue,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: spacing.sm,
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
    secondaryFlex: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginHorizontal: 4,
    },
    secondaryText: {color: colors.textPrimary, fontWeight: '700'},
    rowBtns: {flexDirection: 'row', marginTop: spacing.sm},
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.surfaceAlt,
      marginRight: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipOn: {borderColor: brandColors.googleBlue, backgroundColor: colors.skySoft},
    chipText: {fontSize: 12, fontWeight: '700', color: colors.textPrimary},
    dangerOutline: {
      borderWidth: 1,
      borderColor: brandColors.googleRed,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    dangerOutlineText: {color: brandColors.googleRed, fontWeight: '700'},
    footer: {
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: 'italic',
      marginTop: spacing.lg,
      lineHeight: 18,
    },
  });
}
