import {NativeModules} from 'react-native';

interface PinLockInterface {
  isPinSet(): Promise<boolean>;
  setPin(pin: string): Promise<boolean>;
  verifyPin(pin: string): Promise<boolean>;
  clearPin(): Promise<boolean>;
}

const {PinLock} = NativeModules;

export default PinLock as PinLockInterface;