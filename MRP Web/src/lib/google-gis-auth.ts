/**
 * Google sign-in via Identity Services (GIS) — avoids Firebase Auth popup
 * redirect_uri_mismatch / popup-closed issues between web.app and firebaseapp.com.
 */

import {
  GoogleAuthProvider,
  signInWithCredential,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase";
import {
  DRIVE_APPDATA_SCOPE,
  cacheDriveAccessToken,
} from "./drive-appdata";

const GIS_SCOPES = [
  "openid",
  "email",
  "profile",
  DRIVE_APPDATA_SCOPE,
].join(" ");

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: {
              access_token?: string;
              error?: string;
              error_description?: string;
              expires_in?: number;
            }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => {
            requestAccessToken: (opts?: { prompt?: string }) => void;
          };
        };
        id?: {
          initialize: (cfg: Record<string, unknown>) => void;
          prompt: (cb?: (n: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
          renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function loadGoogleIdentityServices(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Google sign-in only works in the browser"));
      return;
    }
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-gis="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.dataset.gis = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
}

/**
 * Sign in to Firebase with a Google access token from GIS, and cache Drive scope.
 */
export async function signInWithGoogleIdentity(): Promise<User> {
  const clientId = (process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || "").trim();
  if (!clientId) {
    throw new Error("NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing from the web build");
  }

  await loadGoogleIdentityServices();
  const auth = getFirebaseAuth();

  const accessToken = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    try {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GIS_SCOPES,
        callback: (resp) => {
          if (resp.error || !resp.access_token) {
            finish(() =>
              reject(
                new Error(
                  resp.error_description ||
                    resp.error ||
                    "Google sign-in was cancelled or denied",
                ),
              ),
            );
            return;
          }
          const expiresIn = Number(resp.expires_in) || 3200;
          cacheDriveAccessToken(resp.access_token, expiresIn);
          finish(() => resolve(resp.access_token!));
        },
        error_callback: (err) => {
          finish(() =>
            reject(
              new Error(
                err?.message ||
                  err?.type ||
                  "Google sign-in was closed before finishing",
              ),
            ),
          );
        },
      });
      // Force account chooser so the same phone Google account can be picked.
      client.requestAccessToken({ prompt: "select_account" });
    } catch (e) {
      finish(() =>
        reject(e instanceof Error ? e : new Error("Google sign-in failed to start")),
      );
    }
  });

  const credential = GoogleAuthProvider.credential(null, accessToken);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}
