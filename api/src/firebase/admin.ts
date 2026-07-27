import * as admin from 'firebase-admin';

let initialized = false;
let initAttempted = false;

function hasExplicitCredentials(): boolean {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
  return false;
}

/**
 * Optional Firebase Admin for Nest device_config / FCM / TTL purge.
 * Set FIREBASE_DATABASE_URL + either GOOGLE_APPLICATION_CREDENTIALS
 * or FIREBASE_SERVICE_ACCOUNT_JSON (stringified JSON).
 *
 * Does **not** fall back to bare applicationDefault() without an explicit
 * credential path — that reports "configured" then hangs on RTDB/Auth.
 */
export function getAdminApp(): admin.app.App | null {
  if (initialized) {
    return admin.apps.length ? admin.app() : null;
  }
  if (initAttempted) {
    return admin.apps.length ? admin.app() : null;
  }
  initAttempted = true;

  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ||
    process.env.PUBLIC_FIREBASE_DATABASE_URL ||
    'https://mobileresilienceplatform-default-rtdb.firebaseio.com';

  try {
    if (admin.apps.length) {
      initialized = true;
      return admin.app();
    }

    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (json) {
      const cred = JSON.parse(json) as admin.ServiceAccount;
      admin.initializeApp({
        credential: admin.credential.cert(cred),
        databaseURL,
      });
      initialized = true;
      return admin.app();
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL,
      });
      initialized = true;
      return admin.app();
    }

    // No explicit credentials — stay null (JWT verify / RTDB Admin unavailable)
    initialized = true;
    return null;
  } catch {
    initialized = true;
    return null;
  }
}

export function getAdminDb(): admin.database.Database | null {
  const app = getAdminApp();
  return app ? admin.database(app) : null;
}

export function isAdminSdkConfigured(): boolean {
  return hasExplicitCredentials() && getAdminApp() !== null;
}
