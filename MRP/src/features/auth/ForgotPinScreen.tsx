import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import PinLock from '../../native/PinLock.types';
import {useAuth} from '../../services/auth/AuthContext';

type Mode = 'choose' | 'recovery' | 'google' | 'google_new_pin';

type Props = {
  onBack: () => void;
  onPinReset: () => void;
};

export function ForgotPinScreen({onBack, onPinReset}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {signInWithGoogle, auth, googleConfigured} = useAuth();
  const [mode, setMode] = useState<Mode>('choose');
  const [busy, setBusy] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const resetWithRecovery = async () => {
    if (newPin.length < 4 || newPin !== confirmPin) {
      Alert.alert('Invalid PIN', 'PINs must match and be 4–6 digits.');
      return;
    }
    setBusy(true);
    try {
      await PinLock.resetPinWithRecoveryCode(newPin, recoveryPhrase.trim());
      Alert.alert('PIN reset', 'Your new PIN is ready.');
      onPinReset();
    } catch (e: any) {
      Alert.alert('Reset failed', e?.message || 'Recovery code invalid');
    } finally {
      setBusy(false);
    }
  };

  const startGoogleReset = async () => {
    setBusy(true);
    try {
      if (!auth.signedIn) {
        await signInWithGoogle();
      }
      await PinLock.allowPinResetViaGoogle();
      setMode('google_new_pin');
    } catch (e: any) {
      Alert.alert('Google sign-in failed', e?.message || 'Could not verify Google account');
    } finally {
      setBusy(false);
    }
  };

  const resetWithGoogle = async () => {
    if (newPin.length < 4 || newPin !== confirmPin) {
      Alert.alert('Invalid PIN', 'PINs must match and be 4–6 digits.');
      return;
    }
    setBusy(true);
    try {
      await PinLock.resetPinAfterGoogleAuth(newPin);
      Alert.alert('PIN reset', 'Your new PIN is ready.');
      onPinReset();
    } catch (e: any) {
      Alert.alert('Reset failed', e?.message || 'Could not reset PIN');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'choose') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Forgot PIN?</Text>
        <Text style={styles.sub}>
          Reset using your 12-word recovery code, or sign in with Google if you linked your account.
        </Text>
        <TouchableOpacity style={styles.optionBtn} onPress={() => setMode('recovery')}>
          <Text style={styles.optionTitle}>Use recovery code</Text>
          <Text style={styles.optionSub}>12 words you saved at setup</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.optionBtn, !googleConfigured && styles.optionDisabled]}
          onPress={startGoogleReset}
          disabled={!googleConfigured || busy}>
          <Text style={styles.optionTitle}>Sign in with Google</Text>
          <Text style={styles.optionSub}>
            {googleConfigured
              ? 'Same Google account linked to MRP'
              : 'Configure google_web_client_id in strings.xml first'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.warn}>
          Without a recovery code or linked Google account, your vault cannot be unlocked. MRP does
          not store your PIN.
        </Text>
        <TouchableOpacity onPress={onBack} style={styles.linkBtn}>
          <Text style={styles.linkText}>← Back to PIN</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isGooglePin = mode === 'google_new_pin';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{isGooglePin ? 'Set new PIN' : 'Recovery code'}</Text>
        {!isGooglePin ? (
          <TextInput
            style={styles.input}
            placeholder="Enter 12-word recovery code"
            placeholderTextColor={colors.textMuted}
            value={recoveryPhrase}
            onChangeText={setRecoveryPhrase}
            multiline
            autoCapitalize="none"
          />
        ) : (
          <Text style={styles.sub}>Signed in as {auth.emailMasked || auth.email}</Text>
        )}
        <TextInput
          style={styles.input}
          placeholder="New PIN"
          placeholderTextColor={colors.textMuted}
          value={newPin}
          onChangeText={t => setNewPin(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm new PIN"
          placeholderTextColor={colors.textMuted}
          value={confirmPin}
          onChangeText={t => setConfirmPin(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
        />
        <TouchableOpacity
          style={styles.primaryBtn}
          disabled={busy}
          onPress={isGooglePin ? resetWithGoogle : resetWithRecovery}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Reset PIN</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode('choose')} style={styles.linkBtn}>
          <Text style={styles.linkText}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg, padding: spacing.lg},
    scroll: {paddingBottom: spacing.xxl},
    title: {fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm},
    sub: {fontSize: 14, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 20},
    optionBtn: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionDisabled: {opacity: 0.5},
    optionTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
    optionSub: {fontSize: 13, color: colors.textMuted, marginTop: 4},
    warn: {fontSize: 12, color: colors.amber, marginTop: spacing.md, lineHeight: 18},
    input: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
      fontSize: 15,
    },
    primaryBtn: {
      backgroundColor: colors.sky,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    primaryBtnText: {color: '#fff', fontWeight: '800', fontSize: 15},
    linkBtn: {marginTop: spacing.lg, alignItems: 'center'},
    linkText: {color: colors.sky, fontWeight: '700', fontSize: 15},
  });
}
