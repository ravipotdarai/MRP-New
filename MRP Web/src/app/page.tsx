import Link from "next/link";

export default function HomePage() {
  return (
    <div className="hero-landing">
      <div className="rise">
        <p className="hero-kicker">Mobile Resilience Platform</p>
        <h1>Your vault stays yours.</h1>
        <p className="page-lead" style={{ marginBottom: 0 }}>
          MRP keeps security data on <strong>your device</strong>. With backup on, an encrypted copy
          lives only in <strong>your private Google Drive app folder</strong>, unlocked with your
          PIN. MRP does not sell your data and does not keep a readable vault on MRP servers.
          MRP holds sync policy only — never location or selfies.
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
      <div className="hero-card rise rise-delay-2">
        <span className="badge badge-safe">Drive-only locate</span>
        <h2 style={{ fontFamily: "var(--font-display)", marginTop: "1rem", fontSize: "1.35rem" }}>
          Two apps, one project
        </h2>
        <ul>
          <li>
            <strong style={{ color: "var(--text)" }}>MRP</strong> — Android monitoring &amp; Drive
            backup
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>MRP Web</strong> — decrypt vault, map, find
            device, sync policy
          </li>
          <li>
            Drive scope: <code className="mono">drive.appdata</code> only
          </li>
          <li>Admin tools never return vault binaries</li>
        </ul>
      </div>
    </div>
  );
}
