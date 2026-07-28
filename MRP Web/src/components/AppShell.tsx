"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/monitoring", label: "Monitoring" },
  { href: "/devices", label: "Devices" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Sync policy" },
  { href: "/admin", label: "Admin", adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, configured, signOut, isAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && configured && !user) {
      router.replace("/login");
    }
  }, [loading, configured, user, router]);

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
    <div className="shell">
      <aside className="shell-nav">
        <div className="shell-brand">
          <span className="shell-mark">MRP</span>
          <span className="shell-sub">Web console</span>
        </div>
        <nav>
          {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={pathname === n.href ? "nav-link active" : "nav-link"}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="shell-user">
          <ThemeSwitcher />
          <p className="mono">{user.email}</p>
          {isAdmin ? <span className="badge badge-alert">Admin</span> : null}
          <button type="button" className="btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="shell-main">{children}</main>
    </div>
  );
}
