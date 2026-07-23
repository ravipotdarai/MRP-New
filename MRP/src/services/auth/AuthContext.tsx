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
  refresh: () => Promise<void>;
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
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

  const value = useMemo(
    () => ({
      auth,
      device,
      loading,
      googleConfigured,
      refresh,
      signInWithGoogle,
      signOut,
    }),
    [auth, device, loading, googleConfigured, refresh, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
