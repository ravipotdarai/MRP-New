import {NativeModules} from 'react-native';

export type AuthState = {
  signedIn: boolean;
  uid?: string;
  email?: string;
  emailMasked?: string;
  displayName?: string;
  /** Firebase Auth UID — required for Circle invite / RTDB. */
  firebaseUid?: string | null;
  deviceId?: string;
  linkedAt?: number;
  deviceRegisteredAt?: number;
};

export type EnsureFirebaseAuthResult = {
  ok: boolean;
  firebaseUid?: string;
  restored?: boolean;
};

export type DeviceInfo = {
  deviceId: string;
  label: string;
  model: string;
  manufacturer: string;
  osVersion: string;
  sdkInt: number;
};

export type GoogleSignInDebugInfo = {
  packageName: string;
  sha1: string;
  sha256: string;
  webClientId: string;
  webClientConfigured: boolean;
};

interface MrpAuthInterface {
  getAuthState(): Promise<AuthState>;
  ensureFirebaseAuth(): Promise<EnsureFirebaseAuthResult>;
  isGoogleSignInConfigured(): Promise<boolean>;
  getGoogleSignInDebugInfo(): Promise<GoogleSignInDebugInfo>;
  signInWithGoogle(): Promise<AuthState>;
  signOut(): Promise<boolean>;
  getDeviceInfo(): Promise<DeviceInfo>;
  registerDeviceLocally(): Promise<{
    uid: string;
    deviceId: string;
    registeredAt: number;
    label: string;
  }>;
}

const {MrpAuth} = NativeModules;

export default MrpAuth as MrpAuthInterface;
