"use client";

import { useState } from "react";
import { fetchLatestVaultBlob, DRIVE_APPDATA_SCOPE, requestDriveAppDataToken } from "@/lib/drive-appdata";
import { decryptVaultUtf8, parseVaultJson, type VaultPayload } from "@/lib/vault-crypto";

export default function MonitoringPage() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vault, setVault] = useState<VaultPayload | null>(null);
  const [meta, setMeta] = useState<{ name: string; modifiedTime?: string } | null>(null);

  const openVault = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await requestDriveAppDataToken();
      const { file, blob } = await fetchLatestVaultBlob(token);
      const plain = await decryptVaultUtf8(blob, pin);
      setVault(parseVaultJson(plain));
      setMeta({ name: file.name, modifiedTime: file.modifiedTime });
    } catch (e) {
      setVault(null);
      setError(e instanceof Error ? e.message : "Failed to open vault");
    } finally {
      setBusy(false);
    }
  };

  const timeline = Array.isArray(vault?.timeline) ? vault!.timeline! : [];
  const live = vault?.liveLocation || null;

  return (
    <div>
      <h1 className="page-title">Monitoring</h1>
      <p className="page-lead">
        Scope: <code className="mono">{DRIVE_APPDATA_SCOPE}</code> — MRP files only (P5-10).
        Decryption stays in this browser.
      </p>

      <div className="panel rise" style={{ marginBottom: "1rem" }}>
        <div className="field">
          <label htmlFor="pin">MRP PIN</label>
          <input
            id="pin"
            type="password"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN used for Drive backup"
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || pin.length < 4}
          onClick={() => void openVault()}
        >
          {busy ? "Decrypting…" : "Load latest Drive vault"}
        </button>
        {error ? (
          <p className="muted" style={{ color: "var(--alert)", marginTop: "0.75rem" }}>
            {error}
          </p>
        ) : null}
        {meta ? (
          <p className="muted mono" style={{ marginTop: "0.75rem" }}>
            {meta.name} · {meta.modifiedTime || "unknown time"}
          </p>
        ) : null}
      </div>

      {live ? (
        <div className="panel rise rise-delay-1" style={{ marginBottom: "1rem" }}>
          <h2>Live location (from vault)</h2>
          <p className="muted">
            {(live.address as string) || `${live.lat}, ${live.lng}`}
          </p>
          <p className="mono muted">
            {String(live.city || "")} {String(live.state || "")} {String(live.country || "")}
          </p>
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            Source: {String(live.source || "—")} · Battery: {String(live.batteryPct ?? "—")}% ·
            Network: {String(live.network || "—")}
          </p>
        </div>
      ) : null}

      {vault ? (
        <div className="panel rise rise-delay-2">
          <h2>Timeline ({timeline.length})</h2>
          {timeline.length === 0 ? (
            <p className="muted">No events in this backup.</p>
          ) : (
            <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Address</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.slice(0, 50).map((row, i) => {
                    const e = row as Record<string, unknown>;
                    const loc = (e.location || {}) as Record<string, unknown>;
                    return (
                      <tr key={String(e.id || i)}>
                        <td>{String(e.eventType || e.event_type || "—")}</td>
                        <td>{String(e.status || "—")}</td>
                        <td className="muted">
                          {String(loc.detailedAddress || loc.detailed_address || "—")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {vault.selfiesOmitted ? (
            <p className="muted" style={{ marginTop: "0.75rem" }}>
              Selfies omitted in this backup (Free or policy off).
            </p>
          ) : Array.isArray(vault.selfies) && vault.selfies.length > 0 ? (
            <p className="muted" style={{ marginTop: "0.75rem" }}>
              Premium+ selfies present in vault ({vault.selfies.length}) — shown only to the signed-in
              owner in this client; admin APIs never return them.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
