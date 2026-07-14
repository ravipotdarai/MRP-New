import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

interface Props {
  isSetup: boolean;
  onPinSet: (pin: string) => void;
  onPinVerify: (pin: string) => void;
  isLoading: boolean;
  error: string | null;
}

export function PinLockScreen({
  isSetup,
  onPinSet,
  onPinVerify,
  isLoading,
  error,
}: Props) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

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
      onPinSet(pin);
    } else {
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
            style={styles.pinInput}
            value={pin}
            onChangeText={handlePinChange}
            placeholder="Enter PIN"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
          />

          {isSetup && (
            <TextInput
              style={styles.pinInput}
              value={confirmPin}
              onChangeText={handleConfirmPinChange}
              placeholder="Confirm PIN"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
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
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isSetup ? 'Set PIN' : 'Unlock'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
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
    color: '#f8fafc',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
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
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    fontSize: 24,
    color: '#f8fafc',
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#ef4444',
    marginBottom: 16,
    fontSize: 14,
  },
  button: {
    width: '80%',
    height: 56,
    backgroundColor: '#0284c7',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
  },
});