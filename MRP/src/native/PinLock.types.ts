import {NativeModules} from 'react-native';

interface PinLockInterface {
  isPinSet(): Promise<boolean>;
  setPin(pin: string): Promise<boolean>;
  verifyPin(pin: string): Promise<boolean>;
  clearPin(): Promise<boolean>;
  generateRecoveryCode(): Promise<string>;
  saveRecoveryCode(phrase: string): Promise<boolean>;
  hasRecoveryCode(): Promise<boolean>;
  setRecoveryCodeAcknowledged(acknowledged: boolean): Promise<boolean>;
  hasRecoveryCodeAcknowledged(): Promise<boolean>;
  resetPinWithRecoveryCode(newPin: string, phrase: string): Promise<boolean>;
  resetPinAfterGoogleAuth(newPin: string): Promise<boolean>;
  allowPinResetViaGoogle(): Promise<boolean>;
}

const {PinLock} = NativeModules;

export default PinLock as PinLockInterface;
