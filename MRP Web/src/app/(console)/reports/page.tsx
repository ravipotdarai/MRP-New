"use client";

import { useMemo, useState } from "react";
import { fetchLatestVaultBlob, requestDriveAppDataToken } from "@/lib/drive-appdata";
import { decryptVaultUtf8, parseVaultJson } from "@/lib/vault-crypto";

export default function ReportsPage() {
  const [pin, setPin] = useState("");
  const [csv, setCsv] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const blobUrl = useMemo(() => {
    if (!csv) return null;
    return URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  }, [csv]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await requestDriveAppDataToken();
      const { blob } = await fetchLatestVaultBlob(token);
      const plain = await decryptVaultUtf8(blob, pin);
      const vault = parseVaultJson(plain);
      const rows = Array.isArray(vault.timeline) ? vault.timeline : [];
      const header = "eventType,status,address,lat,lng";
      const lines = rows.map((row) => {
        const e = row as Record<string, unknown>;
        const loc = (e.location || {}) as Record<string, unknown>;
        const cells = [
          e.eventType || e.event_type || "",
          e.status || "",
          loc.detailedAddress || loc.detailed_address || "",
          loc.latitude ?? "",
          loc.longitude ?? "",
        ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
        return cells.join(",");
      });
      setCsv([header, ...lines].join("\n"));
    } catch (e) {
      setCsv(null);
      setError(e instanceof Error ? e.message : "Report failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <p className="page-lead">CSV export from your decrypted Drive vault (P6-4).</p>
      <div className="panel">
        <div className="field">
          <label htmlFor="rpin">MRP PIN</label>
          <input
            id="rpin"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || pin.length < 4}
          onClick={() => void generate()}
        >
          {busy ? "Building…" : "Generate CSV"}
        </button>
        {error ? (
          <p className="muted" style={{ color: "var(--alert)", marginTop: "0.75rem" }}>
            {error}
          </p>
        ) : null}
        {blobUrl ? (
          <p style={{ marginTop: "1rem" }}>
            <a className="btn" href={blobUrl} download="mrp-timeline.csv">
              Download mrp-timeline.csv
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
