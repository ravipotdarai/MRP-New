import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import MrpAuth, {AuthState, DeviceInfo} from '../../native/MrpAuth.types';

type AuthContextValue = {
  auth: AuthState;
  device: DeviceInfo | null;
  loading: boolean;
  googleConfigured: boolean;
  firebaseReady: boolean;
  refresh: () => Promise<void>;
  ensureFirebaseAuth: () => Promise<string>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const defaultAuth: AuthState = {signedIn: false};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [auth, setAuth] = useState<AuthState>(defaultAuth);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleConfigured, setGoogleConfigured] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [state, dev, configured] = await Promise.all([
        MrpAuth.getAuthState(),
        MrpAuth.getDeviceInfo(),
        MrpAuth.isGoogleSignInConfigured(),
      ]);
      setAuth(state);
      setDevice(dev);
      setGoogleConfigured(!!configured);
    } catch (e) {
      console.warn('[Auth] refresh failed', e);
    }
  }, []);

  const ensureFirebaseAuth = useCallback(async () => {
    if (!MrpAuth.ensureFirebaseAuth) {
      throw new Error('Update the app — Firebase Auth helper missing');
    }
    const result = await MrpAuth.ensureFirebaseAuth();
    await refresh();
    if (!result?.ok || !result.firebaseUid) {
      throw new Error('Firebase Auth not ready — sign in with Google from Account');
    }
    return result.firebaseUid;
  }, [refresh]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      try {
        if (MrpAuth.ensureFirebaseAuth) {
          await MrpAuth.ensureFirebaseAuth();
          await refresh();
        }
      } catch (e) {
        console.warn('[Auth] ensureFirebaseAuth on launch', e);
      }
      setLoading(false);
    })();
  }, [refresh]);

  const signInWithGoogle = useCallback(async () => {
    const state = await MrpAuth.signInWithGoogle();
    setAuth(state);
    await MrpAuth.registerDeviceLocally().catch(() => undefined);
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await MrpAuth.signOut();
    setAuth(defaultAuth);
    await refresh();
  }, [refresh]);

  const firebaseReady = !!auth.firebaseUid;

  const value = useMemo(
    () => ({
      auth,
      device,
      loading,
      googleConfigured,
      firebaseReady,
      refresh,
      ensureFirebaseAuth,
      signInWithGoogle,
      signOut,
    }),
    [
      auth,
      device,
      loading,
      googleConfigured,
      firebaseReady,
      refresh,
      ensureFirebaseAuth,
      signInWithGoogle,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
