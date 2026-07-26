"use client";

import { useState } from "react";
import {
  DEVICE_CONFIG_DEFAULTS,
  type DeviceConfig,
} from "@/lib/device-config";

const BOOL_KEYS: { key: keyof DeviceConfig; label: string }[] = [
  { key: "movementTracking", label: "Movement tracking (on-device)" },
  { key: "backgroundTracking", label: "Background tracking" },
  { key: "highAccuracy", label: "High accuracy GPS" },
  { key: "eventSyncEnabled", label: "Sync events to Drive" },
  { key: "syncOnWifi", label: "Allow sync on Wi‑Fi" },
  { key: "syncOnMobileData", label: "Allow sync on mobile data" },
  { key: "syncLocation", label: "Include live location in Drive" },
  { key: "syncGeofenceChanges", label: "Sync when geofence changes" },
  { key: "syncSelfiesPremium", label: "Premium+ selfies in Drive" },
  { key: "emergencyTracking", label: "Emergency Tracking" },
];

export function SyncPolicyEditor({
  initial,
  busy,
  saveLabel = "Save policy",
  onSave,
}: {
  initial?: DeviceConfig | null;
  busy?: boolean;
  saveLabel?: string;
  onSave: (cfg: DeviceConfig) => Promise<void>;
}) {
  const [cfg, setCfg] = useState<DeviceConfig>({
    ...DEVICE_CONFIG_DEFAULTS,
    ...initial,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const saving = busy || localBusy;

  const save = async () => {
    setLocalBusy(true);
    setMsg(null);
    try {
      const next: DeviceConfig = {
        ...cfg,
        syncFrequencyMinutes: Math.max(1, Number(cfg.syncFrequencyMinutes) || 15),
        emergencyIntervalMinutes: Math.max(1, Number(cfg.emergencyIntervalMinutes) || 1),
      };
      await onSave(next);
      setCfg(next);
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <div>
      {BOOL_KEYS.map(({ key, label }) => (
        <label
          key={key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            padding: "0.55rem 0",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <span>{label}</span>
          <input
            type="checkbox"
            checked={Boolean(cfg[key])}
            onChange={(e) => setCfg((c) => ({ ...c, [key]: e.target.checked }))}
          />
        </label>
      ))}
      <div className="field" style={{ marginTop: "1rem" }}>
        <label htmlFor="freq">Normal sync frequency (minutes, min 1)</label>
        <input
          id="freq"
          type="number"
          min={1}
          value={cfg.syncFrequencyMinutes ?? 15}
          onChange={(e) =>
            setCfg((c) => ({
              ...c,
              syncFrequencyMinutes: Math.max(1, parseInt(e.target.value || "1", 10) || 1),
            }))
          }
        />
      </div>
      <div className="field">
        <label htmlFor="emerg">Emergency interval (minutes, min 1)</label>
        <input
          id="emerg"
          type="number"
          min={1}
          value={cfg.emergencyIntervalMinutes ?? 1}
          onChange={(e) =>
            setCfg((c) => ({
              ...c,
              emergencyIntervalMinutes: Math.max(1, parseInt(e.target.value || "1", 10) || 1),
            }))
          }
        />
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={saving}
        onClick={() => void save()}
        style={{ marginTop: "0.75rem" }}
      >
        {saving ? "Saving…" : saveLabel}
      </button>
      {msg ? (
        <p className="muted" style={{ marginTop: "0.75rem" }}>
          {msg}
        </p>
      ) : null}
    </div>
  );
}
