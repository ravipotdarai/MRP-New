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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="ds-stat">
      <p className="ds-stat-value mono">{value}</p>
      <p className="ds-stat-label">{label}</p>
    </div>
  );
}

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

  return (
    <div className="ds-page">
      <h1 className="page-title">Digital Safety</h1>
      <p className="page-lead">
        Paste tools run in this browser. Phone Guardian / vault actions sync as timeline events after
        Drive backup.
      </p>

      <section className="panel ds-section">
        <h2>Security Center</h2>
        <p className="muted ds-section-lead">
          Counts from your unlocked backup — not live phone counters.
        </p>
        <div className="ds-stat-grid">
          <Stat label="Ads blocked" value={guardianStats.ads} />
          <Stat label="Trackers" value={guardianStats.trackers} />
          <Stat label="Threats" value={guardianStats.malicious} />
          <Stat label="Safe Link" value={guardianStats.safeLink} />
          <Stat label="Breach watch" value={guardianStats.breach} />
          <Stat label="Cellular" value={guardianStats.cellular} />
          <Stat label="Guardian on" value={guardianStats.guardianOn} />
          <Stat label="Guardian off" value={guardianStats.guardianOff} />
          <Stat label="Emergency Card" value={guardianStats.emergency} />
          <Stat label="Vault events" value={guardianStats.vault} />
          <Stat label="Content filters" value={guardianStats.content} />
        </div>
      </section>

      <div className="ds-tools">
        <section className="panel ds-section">
          <h2>Safe Link</h2>
          <p className="muted ds-section-lead">
            Local heuristics and brand lookalike checks — not a live Safe Browsing lookup.
          </p>
          <div className="ds-form">
            <textarea
              className="input"
              rows={3}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste a URL"
            />
            <button type="button" className="btn btn-primary" onClick={() => setUrlResult(scanUrl(urlInput))}>
              Scan link
            </button>
          </div>
          {urlResult ? (
            <div className="ds-result">
              <span
                className={`badge ${urlResult.score >= 60 ? "badge-alert" : urlResult.score <= 19 ? "badge-safe" : ""}`}
              >
                {urlResult.band} · {urlResult.score}
              </span>
              <ul className="ds-reason-list">
                {urlResult.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="panel ds-section">
          <h2>Scam Check</h2>
          <p className="muted ds-section-lead">Paste suspicious SMS or chat. MRP never reads your inbox.</p>
          <div className="ds-form">
            <textarea
              className="input"
              rows={4}
              value={scamInput}
              onChange={(e) => setScamInput(e.target.value)}
              placeholder="Paste a message"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setScamResult(scanScamText(scamInput))}
            >
              Check message
            </button>
          </div>
          {scamResult ? (
            <div className="ds-result">
              <strong>{scamResult.verdict.replace("_", " ")}</strong>
              <ul className="ds-reason-list">
                {scamResult.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="panel ds-section">
          <h2>Breach email check</h2>
          <p className="muted ds-section-lead">
            Address goes to XposedOrNot only when you confirm — not to MRP servers.
          </p>
          <div className="ds-form ds-form-inline">
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <button
              type="button"
              className="btn btn-primary"
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
          </div>
          {breach ? (
            <div className="ds-result">
              <p>
                <strong>{breach.status.toUpperCase()}</strong> — {breach.message}
              </p>
              <ul className="ds-reason-list">
                {breach.breaches.slice(0, 12).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <section className="panel ds-section">
        <h2>On-device tools</h2>
        <p className="muted ds-section-lead">
          Emergency Card and Secure Vault stay on the phone. This console only shows related timeline
          events after Drive sync.
        </p>
        <div className="ds-stat-grid ds-stat-grid-sm">
          <Stat label="Emergency Card events" value={guardianStats.emergency} />
          <Stat label="Vault events" value={guardianStats.vault} />
        </div>
      </section>

      <section className="panel ds-section">
        <h2>Recent Digital Safety events</h2>
        <p className="muted ds-section-lead">From the unlocked backup.</p>
        {dsRows.length === 0 ? (
          <p className="muted">No Digital Safety events in this snapshot yet.</p>
        ) : (
          <ul className="ds-event-list">
            {dsRows.map((row, i) => (
              <li key={`${eventType(row)}-${i}`}>
                <strong>{formatEventType(eventType(row))}</strong>
                <span className="muted mono">{new Date(eventTimeMs(row)).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
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
