import Link from "next/link";

export default function HomePage() {
  return (
    <div className="hero-landing">
      <div>
        <p className="hero-kicker">Mobile Resilience Platform</p>
        <h1>PathSync</h1>
        <p className="hero-tagline">Your device data stays yours.</p>
        <p className="page-lead" style={{ marginBottom: 0 }}>
          Security data stays on <strong>your device</strong>. Encrypted backup lives only in{" "}
          <strong>your private Google Drive app folder</strong>, unlocked with your PIN. Console:{" "}
          <strong>mobileresilienceplatform.web.app</strong>.
        </p>
        <div className="hero-actions">
          <Link href="/login" className="btn btn-primary">
            Open console
          </Link>
          <Link href="/dashboard" className="btn">
            Dashboard
          </Link>
        </div>
      </div>
      <div className="hero-card">
        <span className="badge badge-safe">Drive-only</span>
        <h2 style={{ fontFamily: "var(--font-display)", marginTop: "1rem", fontSize: "1.35rem" }}>
          Phone + web, one vault
        </h2>
        <ul>
          <li>
            <strong style={{ color: "var(--text)" }}>PathSync</strong> — Android monitoring and
            Drive backup
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>PathSync Web</strong> — decrypt, map, locate,
            sync policy
          </li>
          <li>
            Scope: <code className="mono">drive.appdata</code> only
          </li>
        </ul>
      </div>
    </div>
  );
}
