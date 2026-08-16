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
import Animated from 'react-native-reanimated';
import {ColorPalette, spacing, brandColors} from '../shared/theme';
import {useTheme} from '../shared/ThemeContext';
import {brandCopy} from '../assets/brand';
import {BrandLockup, BrandWave} from '../shared/components/BrandLockup';
import {pageBounceEnter} from '../shared/animations/pageBounce';

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
    setPin(text.replace(/[^0-9]/g, ''));
    setLocalError(null);
  };

  const handleConfirmPinChange = (text: string) => {
    setConfirmPin(text.replace(/[^0-9]/g, ''));
    setLocalError(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View style={styles.content} entering={pageBounceEnter}>
        <BrandLockup size="lock" light showPillars={false} />

        {isSetup ? (
          <Text style={styles.setupHint}>Create a 4–6 digit PIN</Text>
        ) : null}

        <View style={styles.inputContainer}>
          <TextInput
            ref={pinRef}
            style={styles.pinInput}
            value={pin}
            onChangeText={handlePinChange}
            placeholder={isSetup ? 'New PIN' : 'PIN'}
            placeholderTextColor="#9AA0A6"
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            autoFocus={false}
            showSoftInputOnFocus
          />

          {isSetup ? (
            <TextInput
              style={styles.pinInput}
              value={confirmPin}
              onChangeText={handleConfirmPinChange}
              placeholder="Confirm PIN"
              placeholderTextColor="#9AA0A6"
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
              autoFocus={false}
            />
          ) : null}
        </View>

        {localError || error ? <Text style={styles.errorText}>{localError || error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handlePinSubmit}
          disabled={isLoading || pin.length < 4}>
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{isSetup ? 'Set PIN' : 'Unlock'}</Text>
          )}
        </TouchableOpacity>

        {!isSetup && onForgotPin ? (
          <TouchableOpacity style={styles.forgotBtn} onPress={onForgotPin}>
            <Text style={styles.forgotText}>Forgot PIN?</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.driveFooter}>{brandCopy.driveFooter}</Text>
      </Animated.View>
      <BrandWave />
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: brandColors.surface,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 40,
    },
    setupHint: {
      fontSize: 14,
      color: '#5F6368',
      marginTop: spacing.lg,
      marginBottom: spacing.md,
      textAlign: 'center',
    },
    inputContainer: {
      width: '100%',
      alignItems: 'center',
      marginTop: spacing.xl,
    },
    pinInput: {
      width: '80%',
      height: 56,
      backgroundColor: '#fff',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#E8EAED',
      paddingHorizontal: 16,
      fontSize: 24,
      color: brandColors.onyx,
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
      backgroundColor: brandColors.googleBlue,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '700',
    },
    forgotBtn: {marginTop: 24},
    forgotText: {color: brandColors.googleBlue, fontSize: 15, fontWeight: '700'},
    driveFooter: {
      marginTop: spacing.xxl,
      fontSize: 12,
      color: '#5F6368',
      fontWeight: '600',
    },
  });
}
