/**
 * Google Drive appData only — same scope as mobile (P5-10 / P6-12).
 * Never requests drive / drive.readonly / drive.file.
 */

export const DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export const BACKUP_FILE_NAME = "mrp_vault_backup.v1.enc";

const TOKEN_KEY = "mrp_drive_access_token_v1";

type CachedToken = { token: string; exp: number };

function readCache(): CachedToken | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedToken;
    if (!parsed?.token || !parsed.exp || Date.now() >= parsed.exp) {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Cache OAuth access token from Firebase Google sign-in (avoids a second Google prompt). */
export function cacheDriveAccessToken(token: string, expiresInSec = 3200) {
  if (typeof window === "undefined" || !token) return;
  const entry: CachedToken = {
    token,
    exp: Date.now() + Math.max(60, expiresInSec) * 1000,
  };
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(entry));
  } catch {
    /* ignore quota */
  }
}

export function clearDriveAccessToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function loadGis(): Promise<void> {
  // Shared loader lives in google-gis-auth; keep a thin local copy for Drive-only calls.
  return import("./google-gis-auth").then((m) => m.loadGoogleIdentityServices());
}

/**
 * Drive appData access token.
 * Prefers token captured during Firebase Google sign-in (one consent).
 * Falls back to GIS only if cache is empty/expired.
 */
export async function requestDriveAppDataToken(): Promise<string> {
  const cached = readCache();
  if (cached?.token) return cached.token;

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!clientId) throw new Error("NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID missing");
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_APPDATA_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || "Drive token denied"));
          return;
        }
        const expiresIn = Number(resp.expires_in) || 3200;
        cacheDriveAccessToken(resp.access_token, expiresIn);
        resolve(resp.access_token);
      },
    });
    // Empty prompt reuses Google session when possible.
    client.requestAccessToken({ prompt: "" });
  });
}

type DriveFile = { id: string; name: string; modifiedTime?: string; size?: string };

/** List only MRP vault files in appDataFolder (never full Drive). */
export async function listMrpVaultFiles(accessToken: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`name='${BACKUP_FILE_NAME}' and trashed=false`);
  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?spaces=appDataFolder` +
    `&fields=files(id,name,modifiedTime,size)` +
    `&q=${q}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive list failed (${res.status})`);
  const body = (await res.json()) as { files?: DriveFile[] };
  return body.files || [];
}

export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
): Promise<ArrayBuffer> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive download failed (${res.status})`);
  return res.arrayBuffer();
}

export async function fetchLatestVaultBlob(accessToken: string): Promise<{
  file: DriveFile;
  blob: ArrayBuffer;
}> {
  const files = await listMrpVaultFiles(accessToken);
  const latest = [...files].sort((a, b) =>
    (b.modifiedTime || "").localeCompare(a.modifiedTime || ""),
  )[0];
  if (!latest) throw new Error("No encrypted device backup found in Drive app data");
  const blob = await downloadDriveFile(accessToken, latest.id);
  return { file: latest, blob };
}
