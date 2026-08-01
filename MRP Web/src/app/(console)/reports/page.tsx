"use client";

import { useMemo, useState } from "react";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";
import {
  asRows,
  eventType,
  eventTimeMs,
  pathDistanceKm,
  rowAddress,
  rowLatLng,
  travelPoints,
} from "@/lib/vault-selectors";

function downloadText(filename: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportsBody() {
  const { vault } = useVaultSession();
  const [kind, setKind] = useState<"timeline" | "travel" | "usage" | "geofence">("timeline");

  const summary = useMemo(() => {
    const rows = asRows(vault);
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const pts = travelPoints(vault, day.getTime(), Date.now());
    return {
      events: rows.length,
      todayKm: pathDistanceKm(pts),
      apps: vault?.appUsage?.sessions?.length || 0,
      fences: vault?.geofences?.length || 0,
    };
  }, [vault]);

  const exportCsv = () => {
    if (kind === "timeline") {
      const header = "eventType,status,time,address,lat,lng";
      const lines = asRows(vault).map((e) => {
        const loc = rowLatLng(e);
        const cells = [
          eventType(e),
          e.status || "",
          eventTimeMs(e) ? new Date(eventTimeMs(e)).toISOString() : "",
          rowAddress(e),
          loc?.lat ?? "",
          loc?.lng ?? "",
        ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
        return cells.join(",");
      });
      downloadText("mrp-timeline.csv", [header, ...lines].join("\n"), "text/csv;charset=utf-8");
      return;
    }
    if (kind === "usage") {
      const header = "appName,packageName,durationSeconds,startTime,endTime";
      const lines = (vault?.appUsage?.sessions || []).map((s) =>
        [s.appName || "", s.packageName || "", s.durationSeconds ?? "", s.startTime ?? "", s.endTime ?? ""]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(","),
      );
      downloadText("mrp-app-usage.csv", [header, ...lines].join("\n"), "text/csv;charset=utf-8");
      return;
    }
    if (kind === "geofence") {
      const header = "name,id,lat,lng,radiusMeters";
      const lines = (vault?.geofences || []).map((g) =>
        [g.name || "", g.id || "", g.latitude ?? "", g.longitude ?? "", g.radiusMeters ?? ""]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(","),
      );
      downloadText("mrp-geofences.csv", [header, ...lines].join("\n"), "text/csv;charset=utf-8");
      return;
    }
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const pts = travelPoints(vault, day.getTime(), Date.now());
    const header = "time,lat,lng";
    const lines = pts.map((p) =>
      [new Date(p.t).toISOString(), p.lat, p.lng].map((c) => `"${String(c)}"`).join(","),
    );
    downloadText("mrp-travel-today.csv", [header, ...lines].join("\n"), "text/csv;charset=utf-8");
  };

  const exportExcelish = () => {
    // Spreadsheet-friendly TSV that Excel opens
    if (kind === "timeline") {
      const header = ["eventType", "status", "time", "address", "lat", "lng"].join("\t");
      const lines = asRows(vault).map((e) => {
        const loc = rowLatLng(e);
        return [
          eventType(e),
          e.status || "",
          eventTimeMs(e) ? new Date(eventTimeMs(e)).toISOString() : "",
          rowAddress(e),
          loc?.lat ?? "",
          loc?.lng ?? "",
        ].join("\t");
      });
      downloadText("mrp-timeline.xls", [header, ...lines].join("\n"), "application/vnd.ms-excel");
    } else {
      exportCsv();
    }
  };

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <p className="page-lead">Export from the unlocked session (no re-PIN).</p>
      <div className="panel">
        <ul className="muted" style={{ listStyle: "none", lineHeight: 1.7, marginBottom: "1rem" }}>
          <li>Timeline events: {summary.events}</li>
          <li>Travel today: {summary.todayKm.toFixed(2)} km</li>
          <li>App sessions: {summary.apps}</li>
          <li>Geofences: {summary.fences}</li>
        </ul>
        <label className="muted" htmlFor="rep-kind">
          Report type
        </label>
        <select
          id="rep-kind"
          className="input"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          style={{ display: "block", marginTop: "0.35rem", maxWidth: 280 }}
        >
          <option value="timeline">Security timeline</option>
          <option value="travel">Travel (today)</option>
          <option value="usage">App usage</option>
          <option value="geofence">Geofences</option>
        </select>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={exportCsv}>
            Download CSV
          </button>
          <button type="button" className="btn" onClick={exportExcelish}>
            Download Excel-friendly
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <VaultUnlockGate title="Unlock device data for reports">
      <ReportsBody />
    </VaultUnlockGate>
  );
}
