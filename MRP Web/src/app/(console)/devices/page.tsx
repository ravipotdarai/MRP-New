"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  formatConfigTime,
  listDeviceConfigs,
  readDeviceConfig,
  type DeviceConfig,
  type DeviceConfigRow,
} from "@/lib/device-config";

export default function DevicesPage() {
  const { user, isAdmin } = useAuth();
  const [own, setOwn] = useState<DeviceConfig | null>(null);
  const [rows, setRows] = useState<DeviceConfigRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const cfg = await readDeviceConfig(user.uid);
      setOwn(cfg);
      if (isAdmin) {
        setRows(await listDeviceConfigs());
      } else {
        setRows([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1 className="page-title">Devices</h1>
      <p className="page-lead">
        Sync policy from Firebase <code className="mono">device_config</code>. Encrypted backups stay
        on Drive — never listed here (P6-6 / P6-10).
      </p>

      {error ? (
        <p className="muted" style={{ color: "var(--alert)" }}>
          {error}
        </p>
      ) : null}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2>This Google account</h2>
        <p className="mono muted">{user?.email}</p>
        <p className="mono muted" style={{ marginTop: "0.35rem" }}>
          uid {user?.uid}
        </p>
        {loading ? (
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Loading…
          </p>
        ) : own ? (
          <ul className="muted" style={{ listStyle: "none", marginTop: "0.75rem", lineHeight: 1.7 }}>
            <li>Updated: {formatConfigTime(own.updatedAtMs)}</li>
            <li>Source: {own.source || "—"}</li>
            <li>Event → Drive: {own.eventSyncEnabled ? "on" : "off"}</li>
            <li>Emergency: {own.emergencyTracking ? "on" : "off"}</li>
            <li>Sync every {own.syncFrequencyMinutes ?? "—"} min</li>
          </ul>
        ) : (
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            No policy yet — save from Settings or wait for the phone to publish.
          </p>
        )}
      </div>

      {isAdmin ? (
        <div className="panel">
          <h2>All accounts (admin)</h2>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            Metadata only — no coordinates, timeline, or selfies.
          </p>
          {rows.length === 0 ? (
            <p className="muted">No device_config rows yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>UID</th>
                    <th>Email hint</th>
                    <th>Updated</th>
                    <th>Source</th>
                    <th>Drive sync</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ uid, config }) => (
                    <tr key={uid}>
                      <td className="mono">{uid.slice(0, 12)}…</td>
                      <td>{config.accountEmail || "—"}</td>
                      <td>{formatConfigTime(config.updatedAtMs)}</td>
                      <td>{config.source || "—"}</td>
                      <td>{config.eventSyncEnabled ? "on" : "off"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
