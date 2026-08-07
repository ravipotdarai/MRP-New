import { getGoogleMapsApiKey } from "./google-maps-key";

const SCRIPT_ID = "mrp-google-maps-js";

type GoogleNamespace = typeof globalThis extends { google: infer G } ? G : never;

let loadPromise: Promise<GoogleNamespace> | null = null;
let authFailed = false;

export function didGoogleMapsAuthFail(): boolean {
  return authFailed;
}

export function resetGoogleMapsLoader() {
  loadPromise = null;
  authFailed = false;
}

/** Load Maps JavaScript API once (geometry for polyline helpers). */
export function loadGoogleMaps(): Promise<GoogleNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps requires a browser"));
  }
  if (authFailed) {
    return Promise.reject(new Error("Google Maps API key rejected"));
  }

  const w = window as Window & {
    google?: GoogleNamespace;
    gm_authFailure?: () => void;
  };

  if (w.google?.maps?.Map) {
    return Promise.resolve(w.google);
  }
  if (loadPromise) return loadPromise;

  const key = getGoogleMapsApiKey();
  if (!key) {
    return Promise.reject(new Error("Missing Google Maps API key"));
  }

  loadPromise = new Promise((resolve, reject) => {
    const fail = (msg: string) => {
      authFailed = true;
      loadPromise = null;
      reject(new Error(msg));
    };

    w.gm_authFailure = () => {
      fail("Google Maps API key rejected (enable Maps JavaScript API + billing)");
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => {
        if (w.google?.maps) resolve(w.google);
        else fail("Google Maps failed to load");
      });
      existing.addEventListener("error", () => fail("Google Maps script error"));
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&v=weekly&libraries=geometry`;
    script.onload = () => {
      if (w.google?.maps) resolve(w.google);
      else fail("Google Maps failed to initialize");
    };
    script.onerror = () => fail("Google Maps script failed to load");
    document.head.appendChild(script);
  });

  return loadPromise;
}
