"use client";

import { useMemo, useState } from "react";
import {
  decryptVaultUtf8,
  parseVaultJson,
  type VaultPayload,
} from "@/lib/vault-crypto";
import {
  fetchLatestVaultBlob,
  requestDriveAppDataToken,
} from "@/lib/drive-appdata";
import { useAuth } from "@/lib/auth-context";

function formatDur(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "0s";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function AppUsagePage() {
  const { user } = useAuth();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vault, setVault] = useState<VaultPayload | null>(null);

  const load = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const token = await requestDriveAppDataToken();
      const { blob } = await fetchLatestVaultBlob(token);
      const plain = await decryptVaultUtf8(blob, pin);
      setVault(parseVaultJson(plain));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open vault");
      setVault(null);
    } finally {
      setBusy(false);
    }
  };

  const sessions = useMemo(
    () => vault?.appUsage?.sessions ?? [],
    [vault?.appUsage?.sessions],
  );
  const byApp = useMemo(() => {
    const map = new Map<string, { name: string; sec: number }>();
    for (const s of sessions) {
      const pkg = s.packageName || "unknown";
      const prev = map.get(pkg) || { name: s.appName || pkg, sec: 0 };
      prev.sec += Number(s.durationSeconds) || 0;
      map.set(pkg, prev);
    }
    return [...map.entries()]
      .map(([pkg, v]) => ({ pkg, ...v }))
      .sort((a, b) => b.sec - a.sec);
  }, [sessions]);

  const safety = vault?.appUsage?.safety;

  return (
    <div className="page fade-in">
      <h1>App Usage</h1>
      <p className="page-lead">
        Daily usage from your encrypted Drive vault (phone exports today only). System apps are
        excluded. Requires MRP app with vault v3 sync.
      </p>

      <div className="panel rise row-gap">
        <label className="field">
          <span>Vault PIN</span>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Same as phone PIN"
            autoComplete="current-password"
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || pin.length < 4 || !user}
          onClick={() => void load()}
        >
          {busy ? "Decrypting…" : "Load App Usage from Drive"}
        </button>
        {error ? (
          <p className="muted" style={{ color: "var(--alert)" }}>
            {error}
          </p>
        ) : null}
        {vault && !vault.appUsage ? (
          <p className="muted">
            This vault has no <code>appUsage</code> (update the phone app and Back up now).
          </p>
        ) : null}
      </div>

      {vault?.appUsage ? (
        <div className="panel rise fade-in">
          <h2>Today · {sessions.length} sessions</h2>
          <p className="muted mono">
            Day start{" "}
            {vault.appUsage.dayStartMs
              ? new Date(vault.appUsage.dayStartMs).toLocaleString()
              : "—"}
          </p>
          {byApp.length === 0 ? (
            <p className="muted">No sessions for today in this vault.</p>
          ) : (
            <ul className="usage-list">
              {byApp.slice(0, 40).map((a) => (
                <li key={a.pkg} className="usage-row">
                  <div>
                    <strong>{a.name}</strong>
                    <div className="muted mono small">{a.pkg}</div>
                  </div>
                  <span className="mono">{formatDur(a.sec)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {safety ? (
        <div className="panel rise fade-in">
          <h2>Safety · permission sections</h2>
          {(
            [
              ["SMS", safety.sms],
              ["Camera", safety.camera],
              ["Microphone", safety.microphone],
            ] as const
          ).map(([title, list]) => (
            <div key={title} className="safety-block">
              <h3>{title}</h3>
              {!list?.length ? (
                <p className="muted">None listed</p>
              ) : (
                <ul className="usage-list">
                  {list.slice(0, 30).map((a) => (
                    <li key={`${title}-${a.packageName}`} className="usage-row">
                      <div>
                        <strong>{a.appName || a.packageName}</strong>
                        <div className="muted mono small">{a.packageName}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
