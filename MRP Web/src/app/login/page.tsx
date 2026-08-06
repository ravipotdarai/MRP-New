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
      <div className="hero-landing" style={{ maxWidth: 960, margin: "0 auto" }} data-testid="auth-loading">
        <div className="rise">
          <p className="muted">Checking session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hero-landing" style={{ maxWidth: 960, margin: "0 auto" }} data-testid="login-page">
      <div className="rise">
        <Link href="/" className="hero-kicker">
          ← PathSync Web
        </Link>
        <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>Sign in</h1>
        <p className="page-lead">
          <strong>Step 1 — Google:</strong> use the same account linked on your phone.{" "}
          <strong>Step 2 — PathSync PIN:</strong> unlock your encrypted backup on the next screen
          (decryption stays in this browser).
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
        <p className="muted" style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
          Complete the Google account picker. After sign-in you should see the PathSync PIN unlock
          panel on Overview.
        </p>
      </div>
    </div>
  );
}
