"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { SyncPolicyEditor } from "@/components/SyncPolicyEditor";
import {
  DEVICE_CONFIG_DEFAULTS,
  readDeviceConfig,
  writeDeviceConfig,
  type DeviceConfig,
} from "@/lib/device-config";

export default function SettingsPage() {
  const { user } = useAuth();
  const [initial, setInitial] = useState<DeviceConfig | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    void readDeviceConfig(user.uid).then((remote) => {
      setInitial({ ...DEVICE_CONFIG_DEFAULTS, ...remote });
      setReady(true);
    });
  }, [user]);

  if (!ready) {
    return (
      <div>
        <h1 className="page-title">Sync policy</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Sync policy</h1>
      <p className="page-lead">
        Writes Firebase <code className="mono">device_config/{`{uid}`}</code> only. No coordinates
        or media.
      </p>
      <div className="panel">
        <SyncPolicyEditor
          initial={initial}
          onSave={async (cfg) => {
            if (!user) return;
            await writeDeviceConfig(
              user.uid,
              {
                ...cfg,
                accountEmail: user.email || undefined,
                displayName: user.displayName || undefined,
                phoneNumber: user.phoneNumber || undefined,
              },
              "web",
            );
            setInitial({
              ...cfg,
              accountEmail: user.email || undefined,
              displayName: user.displayName || undefined,
              phoneNumber: user.phoneNumber || undefined,
            });
          }}
        />
      </div>
    </div>
  );
}
