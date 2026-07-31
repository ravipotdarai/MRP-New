"use client";

import { useMemo } from "react";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";
import { InteractiveMap } from "@/components/InteractiveMap";
import { asRows, eventType } from "@/lib/vault-selectors";

function GeofencesBody() {
  const { vault } = useVaultSession();
  const fences = vault?.geofences || [];
  const enterExit = useMemo(
    () =>
      asRows(vault).filter((r) => {
        const t = eventType(r).toLowerCase();
        return t.includes("geofence") || t.includes("fence") || t.includes("zone");
      }),
    [vault],
  );

  const mapFences = fences
    .filter((g) => typeof g.latitude === "number" && typeof g.longitude === "number")
    .map((g) => ({
      id: g.id,
      lat: g.latitude as number,
      lng: g.longitude as number,
      radiusMeters: g.radiusMeters || 100,
      name: g.name,
    }));

  return (
    <div>
      <h1 className="page-title">Geofences</h1>
      <p className="page-lead">
        Read-only from vault. Create/edit zones on the phone (Hub → Geofence).
      </p>
      <div className="grid-2">
        <div className="panel">
          <h2>Zones ({fences.length})</h2>
          {fences.length === 0 ? (
            <p className="muted">No geofences in vault snapshot.</p>
          ) : (
            <ul style={{ listStyle: "none", lineHeight: 1.8 }}>
              {fences.map((g, i) => (
                <li key={g.id || i}>
                  <strong>{g.name || g.id || `Zone ${i + 1}`}</strong>
                  <span className="muted mono">
                    {" "}
                    · {g.latitude}, {g.longitude} · {g.radiusMeters || "?"}m
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <h2>Map</h2>
          {mapFences.length ? (
            <InteractiveMap
              center={{ lat: mapFences[0].lat, lng: mapFences[0].lng }}
              geofences={mapFences}
              markers={mapFences.map((g) => ({ lat: g.lat, lng: g.lng, id: g.id, color: "#3d9b6a" }))}
              height={300}
            />
          ) : (
            <p className="muted">Nothing to plot.</p>
          )}
        </div>
      </div>
      <div className="panel" style={{ marginTop: "1.25rem" }}>
        <h2>Enter / exit events</h2>
        {enterExit.length === 0 ? (
          <p className="muted">No geofence events in timeline.</p>
        ) : (
          <ul className="muted" style={{ listStyle: "none", lineHeight: 1.7 }}>
            {enterExit.slice(-30).reverse().map((r, i) => (
              <li key={i}>
                {eventType(r)} · {String(r.status || "")}
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
    <VaultUnlockGate title="Unlock vault for geofences">
      <GeofencesBody />
    </VaultUnlockGate>
  );
}
