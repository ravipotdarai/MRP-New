/** NestJS control plane client (optional). */

const base = () =>
  (process.env.NEXT_PUBLIC_MRP_API_BASE_URL || "http://localhost:3000/v1").replace(
    /\/$/,
    "",
  );

export async function apiHealth(): Promise<{ ok: boolean; status?: number; body?: unknown }> {
  try {
    const res = await fetch(`${base()}/health`, { cache: "no-store" });
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
  try {
    const res = await fetch(`${base()}${path.startsWith("/") ? path : `/${path}`}`, {
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
  try {
    const res = await fetch(`${base()}${path.startsWith("/") ? path : `/${path}`}`, {
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
