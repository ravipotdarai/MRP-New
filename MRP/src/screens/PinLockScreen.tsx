import React, {useMemo, useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import {ColorPalette} from '../shared/theme';
import {useTheme} from '../shared/ThemeContext';

interface Props {
  isSetup: boolean;
  onPinSet: (pin: string) => void;
  onPinVerify: (pin: string) => void;
  onForgotPin?: () => void;
  isLoading: boolean;
  error: string | null;
}

export function PinLockScreen({
  isSetup,
  onPinSet,
  onPinVerify,
  onForgotPin,
  isLoading,
  error,
}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const pinRef = useRef<TextInput>(null);

  // Do not auto-open the system keyboard on app launch (looks like a gray bottom popup).
  // Keyboard appears only when the user taps the PIN field.
  useEffect(() => {
    Keyboard.dismiss();
    const t = setTimeout(() => {
      pinRef.current?.blur();
      Keyboard.dismiss();
    }, 50);
    return () => clearTimeout(t);
  }, []);

  const handlePinSubmit = () => {
    if (pin.length < 4 || pin.length > 6) {
      setLocalError('PIN must be 4-6 digits');
      return;
    }

    if (isSetup) {
      if (pin !== confirmPin) {
        setLocalError('PINs do not match');
        return;
      }
      Keyboard.dismiss();
      onPinSet(pin);
    } else {
      Keyboard.dismiss();
      onPinVerify(pin);
    }
  };

  const handlePinChange = (text: string) => {
    const numericText = text.replace(/[^0-9]/g, '');
    setPin(numericText);
    setLocalError(null);
  };

  const handleConfirmPinChange = (text: string) => {
    const numericText = text.replace(/[^0-9]/g, '');
    setConfirmPin(numericText);
    setLocalError(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Text style={styles.title}>
          {isSetup ? 'Set Up PIN' : 'Enter PIN'}
        </Text>
        <Text style={styles.subtitle}>
          {isSetup
            ? 'Create a PIN to protect your MRP app'
            : 'Enter your PIN to access MRP'}
        </Text>

        <View style={styles.inputContainer}>
          <TextInput
            ref={pinRef}
            style={styles.pinInput}
            value={pin}
            onChangeText={handlePinChange}
            placeholder="Enter PIN"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            autoFocus={false}
            showSoftInputOnFocus={true}
          />

          {isSetup && (
            <TextInput
              style={styles.pinInput}
              value={confirmPin}
              onChangeText={handleConfirmPinChange}
              placeholder="Confirm PIN"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
              autoFocus={false}
            />
          )}
        </View>

        {(localError || error) && (
          <Text style={styles.errorText}>{localError || error}</Text>
        )}

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handlePinSubmit}
          disabled={isLoading || pin.length < 4}>
          {isLoading ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <Text style={styles.buttonText}>
              {isSetup ? 'Set PIN' : 'Unlock'}
            </Text>
          )}
        </TouchableOpacity>

        {!isSetup && onForgotPin ? (
          <TouchableOpacity style={styles.forgotBtn} onPress={onForgotPin}>
            <Text style={styles.forgotText}>Forgot PIN?</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 40,
      textAlign: 'center',
    },
    inputContainer: {
      width: '100%',
      alignItems: 'center',
    },
    pinInput: {
      width: '80%',
      height: 56,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      paddingHorizontal: 16,
      fontSize: 24,
      color: colors.textPrimary,
      textAlign: 'center',
      letterSpacing: 8,
      marginBottom: 16,
    },
    errorText: {
      color: colors.red,
      marginBottom: 16,
      fontSize: 14,
    },
    button: {
      width: '80%',
      height: 56,
      backgroundColor: colors.sky,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 16,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '600',
    },
    forgotBtn: {marginTop: 24},
    forgotText: {color: colors.sky, fontSize: 15, fontWeight: '700'},
  });
}
