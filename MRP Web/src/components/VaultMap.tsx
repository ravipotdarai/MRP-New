"use client";

/**
 * Map for Drive vault liveLocation (Drive-only locate — no MRP server GPS).
 */
export function VaultMap({
  lat,
  lng,
  height = 280,
}: {
  lat: number;
  lng: number;
  height?: number;
}) {
  const pad = 0.06;
  const osmUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - pad}%2C${lat - pad}%2C${lng + pad}%2C${lat + pad}&layer=mapnik&marker=${lat}%2C${lng}`;

  return (
    <div className="vault-map">
      <iframe
        title="Device location map"
        src={osmUrl}
        style={{
          width: "100%",
          height,
          border: 0,
          borderRadius: "var(--radius)",
        }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <p className="muted mono" style={{ marginTop: "0.5rem" }}>
        {lat.toFixed(5)}, {lng.toFixed(5)} · from encrypted Drive vault
      </p>
      <a
        className="btn"
        style={{ marginTop: "0.5rem", display: "inline-flex" }}
        href={`https://www.google.com/maps?q=${lat},${lng}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open in Google Maps
      </a>
    </div>
  );
}
