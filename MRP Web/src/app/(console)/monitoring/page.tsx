"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchLatestVaultBlob,
  DRIVE_APPDATA_SCOPE,
  requestDriveAppDataToken,
} from "@/lib/drive-appdata";
import {
  decryptVaultUtf8,
  parseVaultJson,
  type VaultPayload,
} from "@/lib/vault-crypto";
import { VaultMap } from "@/components/VaultMap";
import { EventTypeChart } from "@/components/EventTypeChart";
import { useAuth } from "@/lib/auth-context";
import { readDeviceConfig, writeDeviceConfig } from "@/lib/device-config";

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function isGeofenceRow(row: unknown): boolean {
  const e = row as Record<string, unknown>;
  const t = String(e.eventType || e.event_type || "").toLowerCase();
  return t.includes("geofence") || t.includes("fence") || t.includes("zone");
}

export default function MonitoringPage() {
  const { user } = useAuth();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [findBusy, setFindBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [vault, setVault] = useState<VaultPayload | null>(null);
  const [meta, setMeta] = useState<{ name: string; modifiedTime?: string } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [policyEmergency, setPolicyEmergency] = useState(false);
  const pinRef = useRef(pin);
  pinRef.current = pin;

  const openVault = useCallback(async (quiet = false) => {
    if (pinRef.current.length < 4) return;
    if (!quiet) {
      setBusy(true);
      setError(null);
      setInfo(null);
    }
    try {
      const token = await requestDriveAppDataToken();
      const { file, blob } = await fetchLatestVaultBlob(token);
      const plain = await decryptVaultUtf8(blob, pinRef.current);
      setVault(parseVaultJson(plain));
      setMeta({ name: file.name, modifiedTime: file.modifiedTime });
      if (quiet) {
        setInfo(`Vault refreshed · ${new Date().toLocaleTimeString()}`);
      }
    } catch (e) {
      if (!quiet) {
        setVault(null);
        setError(e instanceof Error ? e.message : "Failed to open vault");
      }
    } finally {
      if (!quiet) setBusy(false);
    }
  }, []);

  const refreshPolicy = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const cfg = await readDeviceConfig(user.uid);
      setPolicyEmergency(Boolean(cfg?.emergencyTracking));
    } catch {
      /* ignore */
    }
  }, [user?.uid]);

  useEffect(() => {
    void refreshPolicy();
  }, [refreshPolicy]);

  useEffect(() => {
    if (!autoRefresh || pin.length < 4) return;
    const id = window.setInterval(() => {
      void openVault(true);
      void refreshPolicy();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, pin, openVault, refreshPolicy]);

  const findMyDevice = async () => {
    if (!user?.uid) {
      setError("Sign in required");
      return;
    }
    setFindBusy(true);
    setError(null);
    setInfo(null);
    try {
      const existing = (await readDeviceConfig(user.uid)) || {};
      await writeDeviceConfig(
        user.uid,
        {
          ...existing,
          emergencyTracking: true,
          emergencyIntervalMinutes: 1,
          syncFrequencyMinutes: Math.max(10, existing.syncFrequencyMinutes || 10),
          syncOnMobileData: true,
          syncOnWifi: true,
          syncLocation: true,
          highAccuracy: true,
          backgroundTracking: true,
          eventSyncEnabled: true,
        },
        "web",
      );
      setPolicyEmergency(true);
      setAutoRefresh(true);
      setInfo(
        "Find-my-device ON: phone will GPS + sync to your Drive about every 1 minute while emergency is on (high battery use). Auto-refreshing vault every 60s — use Stop emergency when done. Panic SMS and SIM recovery are unchanged.",
      );
      if (pin.length >= 4) {
        window.setTimeout(() => void openVault(true), 2_000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set find policy");
    } finally {
      setFindBusy(false);
    }
  };

  const cancelFind = async () => {
    if (!user?.uid) return;
    setFindBusy(true);
    try {
      const existing = (await readDeviceConfig(user.uid)) || {};
      await writeDeviceConfig(
        user.uid,
        {
          ...existing,
          emergencyTracking: false,
          syncFrequencyMinutes: Math.max(10, existing.syncFrequencyMinutes || 15),
        },
        "web",
      );
      setPolicyEmergency(false);
      setAutoRefresh(false);
      setInfo("Emergency tracking turned off. Panic, SIM recovery, geofence, and monitoring stay available on the phone.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setFindBusy(false);
    }
  };

  const timeline = useMemo(
    () => (Array.isArray(vault?.timeline) ? vault!.timeline! : []),
    [vault],
  );
  const live = vault?.liveLocation || null;
  const selfies = Array.isArray(vault?.selfies) ? vault!.selfies! : [];
  const simHistory = Array.isArray(vault?.simHistory) ? vault!.simHistory! : [];
  const geofenceRows = useMemo(() => timeline.filter(isGeofenceRow), [timeline]);
  const snap = vault?.trackingConfigSnapshot || null;

  const liveLat = live ? num(live.lat) ?? num(live.latitude) : null;
  const liveLng = live ? num(live.lng) ?? num(live.longitude) : null;

  const pathPoints = useMemo(() => {
    const pts: { lat: number; lng: number; label: string }[] = [];
    for (const row of timeline) {
      const e = row as Record<string, unknown>;
      const loc = (e.location || {}) as Record<string, unknown>;
      const la = num(loc.latitude) ?? num(loc.lat);
      const ln = num(loc.longitude) ?? num(loc.lng);
      if (la != null && ln != null) {
        pts.push({
          lat: la,
          lng: ln,
          label: String(e.eventType || e.event_type || "event"),
        });
      }
    }
    return pts.slice(-40);
  }, [timeline]);

  return (
    <div>
      <h1 className="page-title">Monitoring</h1>
      <p className="page-lead">
        Drive-only locate: decrypt your vault in this browser (
        <code className="mono">{DRIVE_APPDATA_SCOPE}</code>). MRP servers never see plaintext
        location or selfies. Phone features — Panic, SIM recovery, geofence, emergency — stay fully
        available; only Circle live share is off for v1.
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || pin.length < 4}
            onClick={() => void openVault(false)}
          >
            {busy ? "Decrypting…" : "Load latest Drive vault"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={findBusy || !user}
            onClick={() => void findMyDevice()}
          >
            {findBusy ? "Updating…" : "Find my device"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={findBusy || !user}
            onClick={() => void cancelFind()}
          >
            Stop emergency
          </button>
          <label className="muted" style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              disabled={pin.length < 4}
            />
            Auto-refresh vault (60s)
          </label>
        </div>
        {policyEmergency ? (
          <p
            className="muted"
            style={{
              marginTop: "0.75rem",
              color: "var(--alert)",
              fontWeight: 600,
            }}
          >
            Emergency / Find-my-device policy is ON for this account. Leave it on only while you are
            actively locating the phone.
          </p>
        ) : null}
        {error ? (
          <p className="muted" style={{ color: "var(--alert)", marginTop: "0.75rem" }}>
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="muted" style={{ color: "var(--safe)", marginTop: "0.75rem" }}>
            {info}
          </p>
        ) : null}
        {meta ? (
          <p className="muted mono" style={{ marginTop: "0.75rem" }}>
            {meta.name} · {meta.modifiedTime || "unknown time"}
          </p>
        ) : null}
      </div>

      {liveLat != null && liveLng != null ? (
        <div className="panel rise rise-delay-1" style={{ marginBottom: "1rem" }}>
          <h2>Live location (from vault)</h2>
          <VaultMap lat={liveLat} lng={liveLng} />
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            {(live?.address as string) || `${liveLat}, ${liveLng}`}
          </p>
          <p className="mono muted">
            {String(live?.city || "")} {String(live?.state || "")}{" "}
            {String(live?.country || "")}
          </p>
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            Source: {String(live?.source || "—")} · Battery: {String(live?.batteryPct ?? "—")}% ·
            Network: {String(live?.network || "—")}
          </p>
        </div>
      ) : live ? (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h2>Live location</h2>
          <p className="muted">Vault has liveLocation but no parseable coordinates.</p>
        </div>
      ) : null}

      {pathPoints.length > 0 ? (
        <div className="panel rise rise-delay-2" style={{ marginBottom: "1rem" }}>
          <h2>Recent path ({pathPoints.length} points)</h2>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            From timeline geo in the vault (not a live stream).
          </p>
          <VaultMap
            lat={pathPoints[pathPoints.length - 1].lat}
            lng={pathPoints[pathPoints.length - 1].lng}
          />
          <ul className="path-list">
            {pathPoints
              .slice()
              .reverse()
              .slice(0, 12)
              .map((p, i) => (
                <li key={`${p.lat}-${p.lng}-${i}`} className="mono muted">
                  {p.label}: {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {vault ? (
        <div className="panel rise rise-delay-2" style={{ marginBottom: "1rem" }}>
          <h2>Event graph</h2>
          <EventTypeChart timeline={timeline} />
        </div>
      ) : null}

      {vault ? (
        <div className="panel rise rise-delay-2" style={{ marginBottom: "1rem" }}>
          <h2>Geofence events ({geofenceRows.length})</h2>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            Manage geofences on the phone (Hub → Geofence). This list shows vault timeline rows that
            look like fence enter/exit.
          </p>
          {geofenceRows.length === 0 ? (
            <p className="muted">No geofence-tagged events in this backup.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Address</th>
                  </tr>
                </thead>
                <tbody>
                  {geofenceRows.slice(0, 40).map((row, i) => {
                    const e = row as Record<string, unknown>;
                    const loc = (e.location || {}) as Record<string, unknown>;
                    return (
                      <tr key={String(e.id || `gf-${i}`)}>
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
        </div>
      ) : null}

      {vault ? (
        <div className="panel rise rise-delay-2" style={{ marginBottom: "1rem" }}>
          <h2>SIM history ({simHistory.length})</h2>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            SIM change recovery still runs on-device (Hub → SIM). Vault may include recent history when
            synced.
          </p>
          {simHistory.length === 0 ? (
            <p className="muted">No SIM history in this vault.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {simHistory.slice(0, 40).map((row, i) => {
                    const s = row as Record<string, unknown>;
                    const when =
                      s.atMs != null
                        ? new Date(Number(s.atMs)).toLocaleString()
                        : String(s.time || s.timestamp || "—");
                    const detail =
                      String(
                        s.summary ||
                          s.carrier ||
                          s.note ||
                          s.iccidMasked ||
                          JSON.stringify(s).slice(0, 120),
                      );
                    return (
                      <tr key={i}>
                        <td className="mono muted">{when}</td>
                        <td>{detail}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {snap ? (
        <div className="panel rise rise-delay-2" style={{ marginBottom: "1rem" }}>
          <h2>Tracking snapshot (from vault)</h2>
          <pre className="mono muted" style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>
            {JSON.stringify(snap, null, 2)}
          </pre>
        </div>
      ) : null}

      {vault ? (
        <div className="panel rise rise-delay-2" style={{ marginBottom: "1rem" }}>
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
                  {timeline.slice(0, 100).map((row, i) => {
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
        </div>
      ) : null}

      {vault ? (
        <div className="panel rise rise-delay-3">
          <h2>Selfies</h2>
          {vault.selfiesOmitted ? (
            <p className="muted">
              Selfies were omitted from this backup (policy / size). Enable Premium+ selfie sync on
              the phone.
            </p>
          ) : selfies.length === 0 ? (
            <p className="muted">No selfies in this vault.</p>
          ) : (
            <div className="selfie-grid">
              {selfies.slice(0, 24).map((s, i) => {
                const item = s as Record<string, unknown>;
                const b64 = String(item.base64 || item.data || "");
                const mime = String(item.mime || item.contentType || "image/jpeg");
                if (!b64 || b64.length < 32) {
                  return (
                    <div key={i} className="selfie-tile muted">
                      #{i + 1} (no image bytes)
                    </div>
                  );
                }
                const src = b64.startsWith("data:") ? b64 : `data:${mime};base64,${b64}`;
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} className="selfie-tile" src={src} alt={`Selfie ${i + 1}`} />
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
