"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { GlobalSearch } from "@/components/GlobalSearch";

const NAV = [
  { href: "/dashboard", label: "Overview", group: "Overview" },
  { href: "/monitoring", label: "Locate & Timeline", group: "Locate" },
  { href: "/travel", label: "Travel", group: "Locate" },
  { href: "/media", label: "Media", group: "Evidence" },
  { href: "/geofences", label: "Geofences", group: "Places" },
  { href: "/app-usage", label: "App Usage", group: "Insights" },
  { href: "/reports", label: "Reports", group: "Insights" },
  { href: "/devices", label: "Devices", group: "Account" },
  { href: "/profile", label: "Profile", group: "Account" },
  { href: "/settings", label: "Sync policy", group: "Account" },
  { href: "/admin", label: "Admin", group: "Admin", adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, configured, signOut, isAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && configured && !user) {
      router.replace("/login");
    }
  }, [loading, configured, user, router]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="shell-loading">
        <p className="muted">Checking session…</p>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="shell-loading">
        <p className="muted">
          Firebase not configured. Copy <code className="mono">.env.example</code> →{" "}
          <code className="mono">.env.local</code>.
        </p>
      </div>
    );
  }

  if (!user) return null;

  const links = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className={`shell ${navOpen ? "shell-nav-open" : ""}`}>
      <header className="shell-top">
        <button
          type="button"
          className="btn shell-menu-btn"
          aria-label="Toggle navigation"
          onClick={() => setNavOpen((v) => !v)}
        >
          Menu
        </button>
        <div className="shell-top-brand">
          <span className="shell-mark">PathSync</span>
          <span className="shell-sub">Mobile Resilience Platform</span>
        </div>
        <div className="shell-top-actions">
          <ThemeSwitcher />
          <button type="button" className="btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <aside className="shell-nav">
        <div className="shell-brand">
          <span className="shell-mark">PathSync</span>
          <span className="shell-sub">MRP · pathsync.in</span>
        </div>
        <nav>
          {links.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={pathname === n.href || pathname.startsWith(n.href + "/") ? "nav-link active" : "nav-link"}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="shell-user">
          <p className="mono">{user.email}</p>
          {isAdmin ? <span className="badge badge-alert">Admin</span> : null}
        </div>
      </aside>
      <main className="shell-main">
        <GlobalSearch />
        {children}
      </main>
      {navOpen ? (
        <button type="button" className="shell-backdrop" aria-label="Close menu" onClick={() => setNavOpen(false)} />
      ) : null}
    </div>
  );
}
