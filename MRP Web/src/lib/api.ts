/** NestJS control plane client (optional on production). */

function resolveApiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_MRP_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (configured) {
    // Never call http://localhost from a hosted HTTPS page (CSP + mixed content).
    if (
      typeof window !== "undefined" &&
      window.location.protocol === "https:" &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\b/i.test(configured)
    ) {
      return "";
    }
    return configured;
  }
  // Local Next.js only — Nest optional elsewhere.
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:3000/v1";
    }
  }
  return "";
}

const base = () => resolveApiBase();

export async function apiHealth(): Promise<{ ok: boolean; status?: number; body?: unknown }> {
  const b = base();
  if (!b) return { ok: false };
  try {
    const res = await fetch(`${b}/health`, { cache: "no-store" });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false };
  }
}

export async function apiGet<T>(
  path: string,
  token?: string | null,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const b = base();
  if (!b) return { ok: false, error: "API not configured" };
  try {
    const res = await fetch(`${b}${path.startsWith("/") ? path : `/${path}`}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `${res.status} ${res.statusText}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  token?: string | null,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const b = base();
  if (!b) return { ok: false, error: "API not configured" };
  try {
    const res = await fetch(`${b}${path.startsWith("/") ? path : `/${path}`}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, error: `${res.status} ${res.statusText}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
