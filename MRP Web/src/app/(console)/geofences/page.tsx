"use client";

import { useMemo, useState } from "react";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";
import { InteractiveMap } from "@/components/InteractiveMap";
import {
  asRows,
  eventTimeMs,
  eventType,
  formatEventType,
  num,
  rowAddress,
  rowGeofence,
  rowLatLng,
  rowStatus,
} from "@/lib/vault-selectors";

function enterExitKind(type: string, status: string): "Enter" | "Exit" | string {
  if (/enter/i.test(status) || /ENTER/i.test(type)) return "Enter";
  if (/exit/i.test(status) || /EXIT/i.test(type)) return "Exit";
  return status || "—";
}

function toDayKey(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function GeofencesBody() {
  const { vault } = useVaultSession();
  const fences = vault?.geofences || [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const mapFences = useMemo(
    () =>
      fences
        .map((g, i) => {
          const lat = num(g.latitude);
          const lng = num(g.longitude);
          if (lat == null || lng == null) return null;
          return {
            id: String(g.id || `zone-${i}`),
            name: String(g.name || g.id || `Zone ${i + 1}`),
            lat,
            lng,
            radiusMeters: num(g.radiusMeters) ?? 100,
          };
        })
        .filter(Boolean) as Array<{
        id: string;
        name: string;
        lat: number;
        lng: number;
        radiusMeters: number;
      }>,
    [fences],
  );

  const selected = mapFences.find((z) => z.id === selectedId) || mapFences[0] || null;

  const resolveZoneName = (row: Record<string, unknown>) => {
    const badge = rowGeofence(row);
    if (badge.fenceName) return badge.fenceName;
    if (badge.fenceId) {
      const hit = mapFences.find((z) => z.id === badge.fenceId);
      if (hit) return hit.name;
    }
    const meta = (row.metadata || {}) as Record<string, unknown>;
    const n = String(meta.geofence_name || meta.zoneName || meta.name || "").trim();
    return n || "Unknown zone";
  };

  const enterExit = useMemo(() => {
    const rows = asRows(vault).filter((r) => {
      const t = eventType(r).toLowerCase();
      return t.includes("geofence") || t.includes("fence") || t.includes("zone");
    });
    return [...rows]
      .map((r) => {
        const t = eventTimeMs(r);
        return {
          row: r,
          timeMs: t,
          day: toDayKey(t),
          zone: resolveZoneName(r),
          type: eventType(r),
          kind: enterExitKind(eventType(r), rowStatus(r)),
          ll: rowLatLng(r),
          address: rowAddress(r),
          fence: rowGeofence(r),
        };
      })
      .sort((a, b) => b.timeMs - a.timeMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveZoneName uses mapFences
  }, [vault, mapFences]);

  const filteredEvents = useMemo(() => {
    return enterExit.filter((e) => {
      if (zoneFilter !== "all" && e.zone !== zoneFilter) return false;
      if (dateFilter && e.day !== dateFilter) return false;
      return true;
    });
  }, [enterExit, zoneFilter, dateFilter]);

  const zoneOptions = useMemo(() => {
    const names = new Set<string>();
    mapFences.forEach((z) => names.add(z.name));
    enterExit.forEach((e) => {
      if (e.zone && e.zone !== "Unknown zone") names.add(e.zone);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [mapFences, enterExit]);

  const shownFences = selected
    ? [
        {
          id: selected.id,
          lat: selected.lat,
          lng: selected.lng,
          radiusMeters: selected.radiusMeters,
          name: selected.name,
        },
      ]
    : mapFences.map((z) => ({
        id: z.id,
        lat: z.lat,
        lng: z.lng,
        radiusMeters: z.radiusMeters,
        name: z.name,
      }));

  return (
    <div>
      <h1 className="page-title">Geofences</h1>
      <p className="page-lead">
        Read-only from device backup. Create/edit zones on the phone (Hub → Geofence). Click a zone to
        preview coverage on the map.
      </p>
      <div className="grid-2">
        <div className="panel">
          <h2>Zones ({mapFences.length})</h2>
          {mapFences.length === 0 ? (
            <p className="muted">No geofences in this backup.</p>
          ) : (
            <ul className="zone-list">
              {mapFences.map((z) => {
                const active = selected?.id === z.id;
                return (
                  <li key={z.id}>
                    <button
                      type="button"
                      className={`zone-card ${active ? "zone-card-active" : ""}`}
                      onClick={() => setSelectedId(z.id)}
                    >
                      <div className="zone-card-head">
                        <strong>{z.name}</strong>
                        {active ? <span className="badge badge-safe">On map</span> : null}
                      </div>
                      <dl className="zone-detail-grid">
                        <dt>ID</dt>
                        <dd className="mono">{z.id}</dd>
                        <dt>Coordinates</dt>
                        <dd className="mono">
                          {z.lat.toFixed(6)}, {z.lng.toFixed(6)}
                        </dd>
                        <dt>Radius</dt>
                        <dd>{z.radiusMeters} m coverage</dd>
                        <dt>Status</dt>
                        <dd>Synced from phone</dd>
                      </dl>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="panel">
          <h2>Map{selected ? ` · ${selected.name}` : ""}</h2>
          {shownFences.length ? (
            <>
              <InteractiveMap
                geofences={shownFences}
                markers={
                  selected
                    ? [{ lat: selected.lat, lng: selected.lng, id: selected.id, color: "#0d9488" }]
                    : shownFences.map((g) => ({
                        lat: g.lat,
                        lng: g.lng,
                        id: g.id,
                        color: "#0d9488",
                      }))
                }
                height={360}
              />
              {selected ? (
                <p className="muted" style={{ marginTop: "0.65rem", fontSize: "0.85rem" }}>
                  Teal circle = {selected.radiusMeters}m coverage around {selected.name}.
                </p>
              ) : null}
            </>
          ) : (
            <p className="muted">Nothing to plot.</p>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: "1.25rem" }}>
        <h2>Enter / exit events</h2>
        <div className="geo-filters">
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="geo-zone-filter">Zone</label>
            <select
              id="geo-zone-filter"
              className="input"
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
            >
              <option value="all">All zones</option>
              {zoneOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="geo-date-filter">Date</label>
            <input
              id="geo-date-filter"
              className="input"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
          {dateFilter || zoneFilter !== "all" ? (
            <button
              type="button"
              className="btn btn-sm"
              style={{ alignSelf: "flex-end" }}
              onClick={() => {
                setZoneFilter("all");
                setDateFilter("");
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {filteredEvents.length === 0 ? (
          <p className="muted" style={{ marginTop: "0.85rem" }}>
            No geofence events{enterExit.length ? " for these filters" : " in timeline"}.
          </p>
        ) : (
          <ul className="timeline-list timeline-spine geo-timeline">
            {filteredEvents.slice(0, 80).map((e, i) => (
              <li key={String(e.row.id || `${e.type}-${e.timeMs}-${i}`)} className="timeline-item">
                <div className="timeline-row geo-timeline-row" style={{ cursor: "default" }}>
                  <span
                    className={`tl-icon geo-tl-dot ${e.kind === "Exit" ? "tl-icon-alert" : "tl-icon-safe"}`}
                    aria-hidden
                  />
                  <div className="timeline-row-body geo-timeline-body">
                    <div className="geo-timeline-head">
                      <div className="geo-timeline-title">
                        <span className={`badge badge-sm ${e.kind === "Exit" ? "badge-alert" : "badge-safe"}`}>
                          {e.kind === "Enter" || e.kind === "Exit" ? e.kind : formatEventType(e.type)}
                        </span>
                        <strong className="geo-zone-name">{e.zone}</strong>
                      </div>
                      <time className="mono muted geo-timeline-when" dateTime={e.timeMs ? new Date(e.timeMs).toISOString() : undefined}>
                        {e.timeMs ? new Date(e.timeMs).toLocaleString() : "—"}
                      </time>
                    </div>
                    <dl className="geo-timeline-meta">
                      <dt>Location</dt>
                      <dd className="mono">
                        {e.ll ? `${e.ll.lat.toFixed(5)}, ${e.ll.lng.toFixed(5)}` : "—"}
                      </dd>
                      <dt>Address</dt>
                      <dd className="geo-address">{e.address || "—"}</dd>
                    </dl>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function GeofencesPage() {
  return (
    <VaultUnlockGate title="Unlock device data for geofences">
      <GeofencesBody />
    </VaultUnlockGate>
  );
}
