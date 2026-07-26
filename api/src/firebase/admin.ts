import * as admin from 'firebase-admin';

let initialized = false;

/**
 * Optional Firebase Admin for Nest device_config writes.
 * Set FIREBASE_DATABASE_URL + either GOOGLE_APPLICATION_CREDENTIALS
 * or FIREBASE_SERVICE_ACCOUNT_JSON (stringified JSON).
 */
export function getAdminApp(): admin.app.App | null {
  if (initialized) {
    return admin.apps.length ? admin.app() : null;
  }
  initialized = true;

  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ||
    process.env.PUBLIC_FIREBASE_DATABASE_URL ||
    'https://mobileresilienceplatform-default-rtdb.firebaseio.com';

  try {
    if (admin.apps.length) {
      return admin.app();
    }

    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (json) {
      const cred = JSON.parse(json) as admin.ServiceAccount;
      admin.initializeApp({
        credential: admin.credential.cert(cred),
        databaseURL,
      });
      return admin.app();
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL,
      });
      return admin.app();
    }

    // Project id only — works on GCP with ADC; local without creds stays null
    const projectId =
      process.env.PUBLIC_FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      'mobileresilienceplatform';
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL,
        projectId,
      });
      return admin.app();
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export function getAdminDb(): admin.database.Database | null {
  const app = getAdminApp();
  return app ? admin.database(app) : null;
}

export function isAdminSdkConfigured(): boolean {
  return getAdminApp() !== null;
}
