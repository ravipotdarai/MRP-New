"use client";

import { useMemo, useState } from "react";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";
import {
  checkEmailBreaches,
  scanScamText,
  scanUrl,
} from "@/lib/digital-safety";
import {
  asRows,
  eventTimeMs,
  eventType,
  formatEventType,
} from "@/lib/vault-selectors";

const DS_TYPES = [
  "SAFE_LINK",
  "SCAM",
  "QR_",
  "NETWORK_GUARDIAN",
  "AD_BLOCKED",
  "TRACKER_BLOCKED",
  "MALICIOUS",
  "CONTENT_DOMAIN",
  "BREACH_EMAIL",
  "CELLULAR_ANOMALY",
  "EMERGENCY_CARD",
  "VAULT_",
  "AUTOMATION_",
];

function DigitalSafetyBody() {
  const { vault } = useVaultSession();
  const [urlInput, setUrlInput] = useState("");
  const [urlResult, setUrlResult] = useState<ReturnType<typeof scanUrl> | null>(null);
  const [scamInput, setScamInput] = useState("");
  const [scamResult, setScamResult] = useState<ReturnType<typeof scanScamText> | null>(null);
  const [email, setEmail] = useState("");
  const [breachBusy, setBreachBusy] = useState(false);
  const [breach, setBreach] = useState<Awaited<ReturnType<typeof checkEmailBreaches>> | null>(null);

  const dsRows = useMemo(
    () =>
      asRows(vault)
        .filter((row) => {
          const t = eventType(row).toUpperCase();
          return DS_TYPES.some((p) => t.includes(p));
        })
        .sort((a, b) => eventTimeMs(b) - eventTimeMs(a))
        .slice(0, 40),
    [vault],
  );

  const guardianStats = useMemo(() => {
    const rows = asRows(vault);
    const count = (pred: (t: string) => boolean) =>
      rows.filter((r) => pred(eventType(r).toUpperCase())).length;
    return {
      ads: count((t) => t.includes("AD_BLOCKED")),
      trackers: count((t) => t.includes("TRACKER_BLOCKED")),
      malicious: count((t) => t.includes("MALICIOUS")),
      content: count((t) => t.includes("CONTENT_DOMAIN")),
      guardianOn: count((t) => t.includes("NETWORK_GUARDIAN_ENABLED")),
      guardianOff: count((t) => t.includes("NETWORK_GUARDIAN_DISABLED")),
      cellular: count((t) => t.includes("CELLULAR_ANOMALY")),
      emergency: count((t) => t.includes("EMERGENCY_CARD")),
      vault: count((t) => t.startsWith("VAULT_") || t.includes("VAULT_")),
      safeLink: count((t) => t.includes("SAFE_LINK")),
      breach: count((t) => t.includes("BREACH_EMAIL")),
    };
  }, [vault]);

  const hasVault = !!vault;

  return (
    <div>
      <h1 className="page-title">Digital Safety</h1>
      <p className="page-lead">
        Protect · Monitor · Recover · Secure — browser paste tools here; live Guardian / cellular /
        vault CRUD stay on the phone and sync via encrypted Drive vault events.
      </p>

      {!hasVault ? (
        <div className="panel">
          <p className="muted">Unlock your vault to load phone Digital Safety event aggregates.</p>
        </div>
      ) : null}

      <div className="panel">
        <h2>Security Center summary</h2>
        <p className="muted">
          Aggregated from the unlocked vault snapshot — not live phone counters. Guardian DNS blocks
          appear after Drive sync of timeline events.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "0.75rem",
            marginTop: "0.75rem",
          }}
        >
          {[
            ["Guardian on", guardianStats.guardianOn],
            ["Guardian off", guardianStats.guardianOff],
            ["Ads blocked", guardianStats.ads],
            ["Trackers", guardianStats.trackers],
            ["Threats", guardianStats.malicious],
            ["Content", guardianStats.content],
            ["Safe Link", guardianStats.safeLink],
            ["Breach watch", guardianStats.breach],
            ["Cellular", guardianStats.cellular],
            ["Emergency Card", guardianStats.emergency],
            ["Vault events", guardianStats.vault],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              style={{
                border: "1px solid var(--border, #ddd)",
                borderRadius: 8,
                padding: "0.75rem",
              }}
            >
              <div className="muted" style={{ fontSize: 12 }}>
                {label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{value as number}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Safe Link</h2>
        <p className="muted">Local heuristics plus brand lookalike checks. Not a live Safe Browsing lookup.</p>
        <textarea
          className="input"
          rows={3}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Paste a URL"
        />
        <button type="button" className="btn" onClick={() => setUrlResult(scanUrl(urlInput))}>
          Scan link
        </button>
        {urlResult ? (
          <div style={{ marginTop: "0.75rem" }}>
            <p>
              <span
                className={`badge ${urlResult.score >= 60 ? "badge-alert" : urlResult.score <= 19 ? "badge-safe" : ""}`}
              >
                {urlResult.band} · {urlResult.score}
              </span>
            </p>
            <ul>
              {urlResult.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ) : urlInput.trim() ? null : (
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            Paste a URL to scan.
          </p>
        )}
      </div>

      <div className="panel">
        <h2>Scam Check</h2>
        <p className="muted">Paste suspicious SMS or chat text. MRP does not read your inbox.</p>
        <textarea
          className="input"
          rows={4}
          value={scamInput}
          onChange={(e) => setScamInput(e.target.value)}
          placeholder="Paste a message"
        />
        <button type="button" className="btn" onClick={() => setScamResult(scanScamText(scamInput))}>
          Check message
        </button>
        {scamResult ? (
          <div style={{ marginTop: "0.75rem" }}>
            <p>
              <strong>{scamResult.verdict.replace("_", " ")}</strong>
            </p>
            <ul>
              {scamResult.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="panel">
        <h2>Breach email check</h2>
        <p className="muted">
          User-initiated. The address is sent to XposedOrNot, not MRP servers. Scheduled monitoring
          runs on the phone after enrollment (Basic+).
        </p>
        <input
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <button
          type="button"
          className="btn"
          disabled={breachBusy}
          onClick={async () => {
            if (!window.confirm("Send this email to XposedOrNot?")) return;
            setBreachBusy(true);
            try {
              setBreach(await checkEmailBreaches(email));
            } finally {
              setBreachBusy(false);
            }
          }}
        >
          {breachBusy ? "Checking…" : "Check email"}
        </button>
        {breach ? (
          <div style={{ marginTop: "0.75rem" }}>
            <p>
              <strong>{breach.status.toUpperCase()}</strong> — {breach.message}
            </p>
            <ul>
              {breach.breaches.slice(0, 12).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="panel">
        <h2>Emergency Card / Secure Vault</h2>
        <p className="muted">
          Configuration and document CRUD remain on the phone. This console shows related timeline
          events after Drive sync — never plaintext vault contents. Emergency Card lock-screen
          visibility uses Android Emergency Info (MRP opens settings; it does not write the OS
          medical DB).
        </p>
        <p>
          Emergency Card events: <strong>{guardianStats.emergency}</strong> · Vault events:{" "}
          <strong>{guardianStats.vault}</strong>
        </p>
        {guardianStats.emergency === 0 && guardianStats.vault === 0 ? (
          <p className="muted">No Emergency Card or Vault events in this snapshot yet.</p>
        ) : null}
      </div>

      <div className="panel">
        <h2>Phone Digital Safety events</h2>
        <p className="muted">From the unlocked vault. Guardian and vault actions stay device-side.</p>
        {dsRows.length === 0 ? (
          <p className="muted">No Digital Safety events in the current vault snapshot.</p>
        ) : (
          <ul>
            {dsRows.map((row, i) => (
              <li key={`${eventType(row)}-${i}`}>
                {formatEventType(eventType(row))} · {new Date(eventTimeMs(row)).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function DigitalSafetyPage() {
  return (
    <VaultUnlockGate>
      <DigitalSafetyBody />
    </VaultUnlockGate>
  );
}
