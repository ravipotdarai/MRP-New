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
  { key: "emergencyTracking", label: "Emergency / Find-my-device tracking" },
];

const PRESETS: {
  id: string;
  label: string;
  hint: string;
  patch: Partial<DeviceConfig>;
}[] = [
  {
    id: "balanced",
    label: "Balanced",
    hint: "15 min Drive sync · emergency off · battery-friendly",
    patch: {
      syncFrequencyMinutes: 15,
      emergencyTracking: false,
      emergencyIntervalMinutes: 5,
      highAccuracy: false,
      syncOnMobileData: false,
      syncOnWifi: true,
    },
  },
  {
    id: "precise",
    label: "Precise",
    hint: "10 min sync · mobile data on · more battery",
    patch: {
      syncFrequencyMinutes: 10,
      emergencyTracking: false,
      emergencyIntervalMinutes: 5,
      highAccuracy: true,
      syncOnMobileData: true,
      syncOnWifi: true,
      syncLocation: true,
    },
  },
  {
    id: "find",
    label: "Find my device",
    hint: "Emergency ON · 1 min GPS/Drive · uses more battery (feature kept)",
    patch: {
      emergencyTracking: true,
      emergencyIntervalMinutes: 1,
      syncFrequencyMinutes: 10,
      highAccuracy: true,
      syncOnMobileData: true,
      syncOnWifi: true,
      syncLocation: true,
      backgroundTracking: true,
      eventSyncEnabled: true,
    },
  },
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
      const emerg = Math.max(1, Number(cfg.emergencyIntervalMinutes) || 1);
      const next: DeviceConfig = {
        ...cfg,
        syncFrequencyMinutes: Math.max(10, Number(cfg.syncFrequencyMinutes) || 15),
        emergencyIntervalMinutes: emerg,
      };
      await onSave(next);
      setCfg(next);
      setMsg("Saved to Firebase sync policy (phone picks up on next pull).");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <div>
      <div className="preset-row" style={{ marginBottom: "1rem" }}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn"
            disabled={saving}
            title={p.hint}
            onClick={() => setCfg((c) => ({ ...c, ...p.patch }))}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginBottom: "1rem" }}>
        Panic SMS, SIM recovery, geofence, and monitoring stay on the phone. This panel only tunes
        Drive sync / emergency locate policy (Firebase config). Location bytes stay in your encrypted
        Drive vault.
      </p>
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
        <label htmlFor="freq">Normal Drive sync frequency (minutes, min 10)</label>
        <input
          id="freq"
          type="number"
          min={10}
          value={cfg.syncFrequencyMinutes ?? 15}
          onChange={(e) =>
            setCfg((c) => ({
              ...c,
              syncFrequencyMinutes: Math.max(10, parseInt(e.target.value || "10", 10) || 10),
            }))
          }
        />
      </div>
      <div className="field">
        <label htmlFor="emerg">Emergency GPS / sync interval (minutes, min 1)</label>
        <input
          id="emerg"
          type="number"
          min={1}
          value={cfg.emergencyIntervalMinutes ?? 5}
          onChange={(e) =>
            setCfg((c) => ({
              ...c,
              emergencyIntervalMinutes: Math.max(
                1,
                parseInt(e.target.value || "1", 10) || 1,
              ),
            }))
          }
        />
      </div>
      {(cfg.emergencyIntervalMinutes ?? 5) < 5 && cfg.emergencyTracking ? (
        <p className="muted" style={{ color: "var(--alert)", marginBottom: "0.75rem" }}>
          Intervals under 5 minutes use significantly more battery. Keep Panic / SIM / monitoring as
          needed — this only affects locate sync cadence.
        </p>
      ) : null}
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
