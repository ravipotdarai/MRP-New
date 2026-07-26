/**
 * Google Drive appData only — same scope as mobile (P5-10 / P6-12).
 * Never requests drive / drive.readonly / drive.file.
 */

export const DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export const BACKUP_FILE_NAME = "mrp_vault_backup.v1.enc";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("GIS only in browser"));
      return;
    }
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-gis="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("GIS load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.dataset.gis = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("GIS load failed"));
    document.head.appendChild(s);
  });
}

export async function requestDriveAppDataToken(): Promise<string> {
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
        resolve(resp.access_token);
      },
    });
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
  if (!latest) throw new Error("No MRP vault backup in Drive app data");
  const blob = await downloadDriveFile(accessToken, latest.id);
  return { file: latest, blob };
}
