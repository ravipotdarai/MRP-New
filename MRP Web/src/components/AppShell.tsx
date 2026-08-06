"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

type NavItem = {
  href: string;
  label: string;
  group: string;
  icon: string;
  adminOnly?: boolean;
  exact?: boolean;
};

/** Compact stroke icons — operational console, not marketing glyphs. */
const ICONS: Record<string, ReactNode> = {
  overview: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    </svg>
  ),
  locate: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="8" />
    </svg>
  ),
  travel: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 16c4-8 12-8 16 0" />
      <circle cx="6" cy="16" r="2" />
      <circle cx="18" cy="16" r="2" />
    </svg>
  ),
  media: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="12" r="2.5" />
      <path d="M14 16l3-3 4 4" />
    </svg>
  ),
  fence: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 3l8 5v11H4V8l8-5z" />
      <path d="M9 19v-6h6v6" />
    </svg>
  ),
  drive: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 14h16l-2.5-7h-11L4 14z" />
      <path d="M4 14v4h16v-4" />
    </svg>
  ),
  sim: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M7 3h7l5 5v13H7V3z" />
      <path d="M10 11h4M10 15h4" />
    </svg>
  ),
  devices: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  ),
  policy: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  apps: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
  report: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M6 3h9l5 5v13H6V3z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  ),
  safety: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 2l3 6h6l-5 4 2 7-6-4-6 4 2-7-5-4h6l3-6z" />
    </svg>
  ),
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", group: "Home", icon: "overview", exact: true },
  { href: "/profile", label: "Profile", group: "Home", icon: "profile" },

  { href: "/monitoring", label: "Locate & Timeline", group: "Security", icon: "locate" },
  { href: "/travel", label: "Travel", group: "Security", icon: "travel" },
  { href: "/media", label: "Media", group: "Security", icon: "media" },

  { href: "/geofences", label: "Geofence", group: "Hub", icon: "fence" },
  { href: "/drive-sync", label: "Drive Sync", group: "Hub", icon: "drive" },
  { href: "/sim-recovery", label: "SIM Recovery", group: "Hub", icon: "sim" },
  { href: "/devices", label: "Devices", group: "Hub", icon: "devices" },
  { href: "/settings", label: "Sync Policy", group: "Hub", icon: "policy" },

  { href: "/app-usage", label: "Dashboard", group: "App Usage", icon: "apps" },
  { href: "/app-usage?tab=timeline", label: "Timeline", group: "App Usage", icon: "locate" },
  { href: "/app-usage?tab=reports", label: "Reports", group: "App Usage", icon: "report" },
  { href: "/app-usage?tab=safety", label: "Safety", group: "App Usage", icon: "safety" },

  { href: "/admin", label: "Admin", group: "Admin", icon: "admin", adminOnly: true },
];

const GROUP_ORDER = ["Home", "Security", "Hub", "App Usage", "Admin"];

function pathActive(pathname: string, search: string, item: NavItem): boolean {
  const [base, qs] = item.href.split("?");
  const itemTab = qs ? new URLSearchParams(qs).get("tab") : null;
  const currentTab = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(
    "tab",
  );

  if (itemTab) {
    return pathname === base && currentTab === itemTab;
  }
  if (base === "/app-usage") {
    return pathname === "/app-usage" && (!currentTab || currentTab === "dashboard");
  }
  if (item.exact) return pathname === base;
  return pathname === base || pathname.startsWith(base + "/");
}

function ShellNav({ links }: { links: NavItem[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const grouped = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const n of links) {
      const list = map.get(n.group) || [];
      list.push(n);
      map.set(n.group, list);
    }
    return GROUP_ORDER.filter((g) => (map.get(g) || []).length > 0).map((g) => ({
      group: g,
      items: map.get(g)!,
    }));
  }, [links]);

  return (
    <nav className="shell-nav-list" aria-label="Console">
      {grouped.map(({ group, items }) => (
        <div key={group} className="nav-group">
          <p className="nav-group-label">{group}</p>
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={pathActive(pathname, search, n) ? "nav-link active" : "nav-link"}
            >
              <span className="nav-ico">{ICONS[n.icon]}</span>
              <span className="nav-label">{n.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, configured, signOut, isAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && configured && !user) {
      router.replace("/login/");
    }
  }, [loading, configured, user, router]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const links = useMemo(() => NAV.filter((n) => !n.adminOnly || isAdmin), [isAdmin]);

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

  return (
    <div className={`shell ${navOpen ? "shell-nav-open" : ""}`}>
      <header className="shell-top">
        <button
          type="button"
          className="btn btn-sm shell-menu-btn"
          aria-label="Toggle navigation"
          onClick={() => setNavOpen((v) => !v)}
        >
          Menu
        </button>
        <div className="shell-top-brand">
          <span className="shell-mark">PathSync</span>
          <span className="shell-sub shell-sub-by">by Ravi Potdar</span>
        </div>
        <div className="shell-top-actions">
          <ThemeSwitcher />
          <button type="button" className="btn btn-sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <aside className="shell-nav">
        <div className="shell-brand">
          <span className="shell-mark">PathSync</span>
          <span className="shell-sub shell-sub-by">by Ravi Potdar</span>
        </div>
        <Suspense fallback={<nav className="muted">…</nav>}>
          <ShellNav links={links} />
        </Suspense>
        <div className="shell-user">
          <p className="mono shell-email">{user.email}</p>
          {isAdmin ? <span className="badge badge-alert">Admin</span> : null}
          <div className="shell-user-actions">
            <ThemeSwitcher />
            <button type="button" className="btn btn-sm" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="shell-main">
        {children}
      </main>
      {navOpen ? (
        <button type="button" className="shell-backdrop" aria-label="Close menu" onClick={() => setNavOpen(false)} />
      ) : null}
    </div>
  );
}
