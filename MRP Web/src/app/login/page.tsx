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
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  const onSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hero-landing" style={{ maxWidth: 960, margin: "0 auto" }}>
      <div className="rise">
        <Link href="/" className="hero-kicker">
          ← MRP Web
        </Link>
        <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>Sign in</h1>
        <p className="page-lead">
          Use the same Google account linked on your phone. Your vault stays on your device and
          private Drive — decryption happens only in this browser with your MRP PIN. MRP does not
          keep a readable copy on MRP servers.
        </p>
        {!configured ? (
          <p className="badge badge-alert">Configure Firebase in .env.local first</p>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || loading}
            onClick={() => void onSignIn()}
          >
            {busy ? "Opening Google…" : "Continue with Google"}
          </button>
        )}
        {error ? (
          <p className="muted" style={{ color: "var(--alert)", marginTop: "1rem" }}>
            {error}
          </p>
        ) : null}
      </div>
      <div className="panel rise rise-delay-1">
        <h2>What we ask for</h2>
        <p className="muted">
          Firebase Auth for identity. Drive <code className="mono">appdata</code> only when you
          open Monitoring — never your full Drive.
        </p>
      </div>
    </div>
  );
}
