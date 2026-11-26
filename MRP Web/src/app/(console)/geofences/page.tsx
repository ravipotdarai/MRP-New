"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const mapFences = useMemo(
    () =>
      (vault?.geofences || [])
        .map((g, i) => {
          const lat = num(g.latitude ?? g.lat);
          const lng = num(g.longitude ?? g.lng);
          if (lat == null || lng == null) return null;
          return {
            id: String(g.id || `zone-${i}`),
            name: String(g.name || g.id || `Zone ${i + 1}`),
            lat,
            lng,
            radiusMeters: num(g.radiusMeters ?? g.radius) ?? 100,
            enabled: g.enabled !== false,
          };
        })
        .filter(Boolean) as Array<{
        id: string;
        name: string;
        lat: number;
        lng: number;
        radiusMeters: number;
        enabled: boolean;
      }>,
    [vault?.geofences],
  );

  const selected = selectedId ? mapFences.find((z) => z.id === selectedId) || null : null;

  // Selecting a zone card also filters enter/exit to that zone.
  useEffect(() => {
    if (selected) setZoneFilter(selected.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when selection id changes
  }, [selected?.id, selected?.name]);

  const resolveZone = (row: Record<string, unknown>) => {
    const badge = rowGeofence(row);
    const byId = badge.fenceId
      ? mapFences.find((z) => z.id === badge.fenceId || z.id === String(badge.fenceId))
      : null;
    const name =
      badge.fenceName ||
      byId?.name ||
      (() => {
        const meta = (row.metadata || {}) as Record<string, unknown>;
        return String(meta.geofence_name || meta.zoneName || meta.transition_zone || meta.name || "").trim();
      })() ||
      "Unknown zone";
    return {
      name,
      fenceId: badge.fenceId || byId?.id || null,
      inside: badge.inside,
    };
  };

  const enterExit = useMemo(() => {
    const rows = asRows(vault).filter((r) => {
      const t = eventType(r).toLowerCase();
      return t.includes("geofence") || t.includes("fence") || t.includes("zone");
    });
    return [...rows]
      .map((r) => {
        const t = eventTimeMs(r);
        const zone = resolveZone(r);
        return {
          row: r,
          timeMs: t,
          day: toDayKey(t),
          zone: zone.name,
          fenceId: zone.fenceId,
          type: eventType(r),
          kind: enterExitKind(eventType(r), rowStatus(r)),
          ll: rowLatLng(r),
          address: rowAddress(r),
          fence: rowGeofence(r),
        };
      })
      .sort((a, b) => b.timeMs - a.timeMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveZone uses mapFences
  }, [vault, mapFences]);

  const filteredEvents = useMemo(() => {
    return enterExit.filter((e) => {
      if (zoneFilter !== "all") {
        const matchName = e.zone === zoneFilter;
        const matchSelectedId =
          selected && (e.fenceId === selected.id || e.zone === selected.name);
        const matchFilterId = mapFences.find((z) => z.name === zoneFilter);
        const matchById =
          matchFilterId && e.fenceId && e.fenceId === matchFilterId.id;
        if (!matchName && !matchSelectedId && !matchById) return false;
      }
      if (dateFilter && e.day !== dateFilter) return false;
      return true;
    });
  }, [enterExit, zoneFilter, dateFilter, selected, mapFences]);

  const zoneOptions = useMemo(() => {
    const names = new Set<string>();
    mapFences.forEach((z) => names.add(z.name));
    enterExit.forEach((e) => {
      if (e.zone && e.zone !== "Unknown zone") names.add(e.zone);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [mapFences, enterExit]);

  // When a zone is selected, emphasize it and still draw others faintly via highlight flag.
  const shownFences = useMemo(
    () =>
      mapFences.map((z) => ({
        id: z.id,
        lat: z.lat,
        lng: z.lng,
        radiusMeters: z.radiusMeters,
        name: z.name,
        highlight: selectedId != null && selectedId === z.id,
      })),
    [mapFences, selectedId],
  );

  const selectZone = (id: string) => {
    setSelectedId(id);
    const z = mapFences.find((x) => x.id === id);
    if (z) setZoneFilter(z.name);
  };

  return (
    <div>
      <h1 className="page-title">Geofences</h1>
      <p className="page-lead">
        Read-only from device backup. Create/edit zones on the phone (Hub → Geofence). Click a zone
        to focus the map and filter enter/exit events.
      </p>
      <div className="grid-2">
        <div className="panel">
          <h2>Zones ({mapFences.length})</h2>
          {mapFences.length === 0 ? (
            <p className="muted">
              No geofences in this backup — create zones on the phone, enable automatic Drive sync,
              then Refresh.
            </p>
          ) : (
            <ul className="zone-list">
              {mapFences.map((z) => {
                const active = selected?.id === z.id;
                return (
                  <li key={z.id}>
                    <button
                      type="button"
                      className={`zone-card ${active ? "zone-card-active" : ""}`}
                      onClick={() => selectZone(z.id)}
                    >
                      <div className="zone-card-head">
                        <strong>{z.name}</strong>
                        <span className="zone-card-badges">
                          {z.enabled ? (
                            <span className="badge badge-safe">On</span>
                          ) : (
                            <span className="badge">Off</span>
                          )}
                          {active ? <span className="badge badge-safe">On map</span> : null}
                        </span>
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
                        <dd>{z.enabled ? "Enabled · Drive sync" : "Disabled on phone · still listed"}</dd>
                      </dl>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <h2 style={{ margin: 0 }}>
              Map · {shownFences.length} zone{shownFences.length === 1 ? "" : "s"}
              {selected ? ` · ${selected.name}` : ""}
            </h2>
            {selectedId ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setSelectedId(null);
                  setZoneFilter("all");
                }}
              >
                Show all
              </button>
            ) : null}
          </div>
          {shownFences.length ? (
            <>
              <InteractiveMap
                key={`gf-map-${selectedId || "all"}-${shownFences.length}`}
                geofences={shownFences}
                markers={
                  selected
                    ? [
                        {
                          lat: selected.lat,
                          lng: selected.lng,
                          id: selected.id,
                          color: "#f59e0b",
                        },
                      ]
                    : shownFences.map((g) => ({
                        lat: g.lat,
                        lng: g.lng,
                        id: g.id,
                        color: "#0d9488",
                      }))
                }
                center={selected ? { lat: selected.lat, lng: selected.lng } : undefined}
                zoom={selected ? 15 : undefined}
                height={360}
                onMarkerClick={(id) => {
                  if (id) selectZone(id);
                }}
              />
              <p className="muted" style={{ marginTop: "0.65rem", fontSize: "0.85rem" }}>
                {selected
                  ? `Focused: ${selected.name} · ${selected.radiusMeters}m radius (amber). Other zones stay teal.`
                  : "Teal circles = coverage for every zone in this backup."}
              </p>
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
              onChange={(e) => {
                const name = e.target.value;
                setZoneFilter(name);
                if (name === "all") {
                  setSelectedId(null);
                } else {
                  const hit = mapFences.find((z) => z.name === name);
                  setSelectedId(hit?.id || null);
                }
              }}
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
                setSelectedId(null);
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
                        <span
                          className={`badge badge-sm ${e.kind === "Exit" ? "badge-alert" : "badge-safe"}`}
                        >
                          {e.kind === "Enter" || e.kind === "Exit"
                            ? e.kind
                            : formatEventType(e.type)}
                        </span>
                        <strong className="geo-zone-name">{e.zone}</strong>
                      </div>
                      <time
                        className="mono muted geo-timeline-when"
                        dateTime={e.timeMs ? new Date(e.timeMs).toISOString() : undefined}
                      >
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
