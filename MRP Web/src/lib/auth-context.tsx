"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { getFirebaseAuth, isFirebaseConfigured } from "./firebase";
import { clearDriveAccessToken } from "./drive-appdata";
import { signInWithGoogleIdentity } from "./google-gis-auth";

type AuthState = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  isAdmin: boolean;
  redirectPending: boolean;
  signInWithGoogle: () => Promise<User>;
  /** @deprecated Same as signInWithGoogle (GIS). Kept for login UI compat. */
  signInWithGoogleRedirect: () => Promise<User>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthState | null>(null);

function adminEmails(): Set<string> {
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS || "";
  const fromEnv = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...fromEnv, "ravipotdarai@gmail.com"]);
}

export function friendlyAuthError(err: unknown): Error {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/unauthorized-domain":
        return new Error(
          "This site origin is not in Firebase Authorized domains. Add mobileresilienceplatform.web.app under Authentication → Settings → Authorized domains.",
        );
      case "auth/network-request-failed":
        return new Error("Network error during Google sign-in. Check your connection and try again.");
      case "auth/invalid-credential":
        return new Error(
          "Google credential was rejected. Confirm the Web OAuth client ID matches this Firebase project, then try again.",
        );
      case "auth/account-exists-with-different-credential":
        return new Error("An account already exists with a different sign-in method for this email.");
      default:
        return new Error(err.message || `Sign-in failed (${err.code})`);
    }
  }
  if (err instanceof Error) {
    const msg = err.message || "";
    if (/popup_closed|closed|access_denied|user.*cancel/i.test(msg)) {
      return new Error("Google sign-in was cancelled. Click Continue with Google and finish the account picker.");
    }
    if (/origin|unauthorized|redirect_uri/i.test(msg)) {
      return new Error(
        "Google blocked this site origin. In Google Cloud Console → Credentials → Web client, add https://mobileresilienceplatform.web.app under Authorized JavaScript origins.",
      );
    }
    return err;
  }
  return new Error("Sign-in failed");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    // Local Playwright only: inject window.__MRP_E2E_USER__ before app scripts.
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        const e2e = (window as Window & { __MRP_E2E_USER__?: User }).__MRP_E2E_USER__;
        if (e2e?.uid) {
          setUser(e2e);
          setLoading(false);
          return;
        }
      }
    }

    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, [configured]);

  const signInWithGoogle = useCallback(async () => {
    try {
      const signedIn = await signInWithGoogleIdentity();
      setUser(signedIn);
      setLoading(false);
      return signedIn;
    } catch (e) {
      throw friendlyAuthError(e);
    }
  }, []);

  const signOut = useCallback(async () => {
    clearDriveAccessToken();
    await fbSignOut(getFirebaseAuth());
  }, []);

  const getIdToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  const isAdmin = useMemo(() => {
    const email = user?.email?.toLowerCase();
    if (!email) return false;
    return adminEmails().has(email);
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      configured,
      isAdmin,
      redirectPending: false,
      signInWithGoogle,
      signInWithGoogleRedirect: signInWithGoogle,
      signOut,
      getIdToken,
    }),
    [user, loading, configured, isAdmin, signInWithGoogle, signOut, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
