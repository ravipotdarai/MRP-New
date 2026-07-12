import {useState, useEffect, useCallback} from 'react';
import PinLock from '../native/PinLock.types';

export function usePinLock() {
  const [isPinSet, setIsPinSet] = useState<boolean | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkPinSet = useCallback(async () => {
    try {
      const pinSet = await PinLock.isPinSet();
      setIsPinSet(pinSet);
    } catch (e) {
      console.error('Failed to check PIN:', e);
      setIsPinSet(false);
    }
  }, []);

  const setPin = useCallback(async (pin: string) => {
    setIsVerifying(true);
    setError(null);
    try {
      await PinLock.setPin(pin);
      setIsPinSet(true);
      return true;
    } catch (e: any) {
      setError(e.message || 'Failed to set PIN');
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, []);

  const verifyPin = useCallback(async (pin: string) => {
    setIsVerifying(true);
    setError(null);
    try {
      const isValid = await PinLock.verifyPin(pin);
      if (!isValid) {
        setError('Incorrect PIN');
      }
      return isValid;
    } catch (e: any) {
      setError(e.message || 'Failed to verify PIN');
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, []);

  const clearPin = useCallback(async () => {
    try {
      await PinLock.clearPin();
      setIsPinSet(false);
    } catch (e) {
      console.error('Failed to clear PIN:', e);
    }
  }, []);

  useEffect(() => {
    checkPinSet();
  }, [checkPinSet]);

  return {
    isPinSet,
    isVerifying,
    error,
    setPin,
    verifyPin,
    clearPin,
    recheckPin: checkPinSet,
  };
}