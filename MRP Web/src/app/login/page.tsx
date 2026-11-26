"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { user, loading, configured, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard/");
    }
  }, [loading, user, router]);

  const onSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      window.location.assign("/dashboard/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-stage" data-testid="auth-loading">
        <div className="auth-card">
          <p className="muted">Checking session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-stage" data-testid="login-page">
      <div className="auth-card">
        <Link href="/" className="hero-kicker">
          PathSync Web
        </Link>
        <h1>Sign in</h1>
        <p className="page-lead">
          Use the same Google account as on your phone, then unlock with your PathSync PIN on
          Overview. Decryption stays in this browser.
        </p>

        {!configured ? (
          <p className="badge badge-alert">Configure Firebase in .env.local first</p>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            data-testid="login-google-popup"
            onClick={() => void onSignIn()}
          >
            {busy ? "Opening Google…" : "Continue with Google"}
          </button>
        )}
        {error ? (
          <p className="muted" style={{ color: "var(--alert)", marginTop: "1rem" }} data-testid="login-error">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
