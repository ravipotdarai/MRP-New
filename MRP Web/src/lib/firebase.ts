import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";

/**
 * Always use the Firebase Auth domain from env (*.firebaseapp.com).
 * Using the Hosting hostname (*.web.app) as authDomain causes Google
 * Error 400 redirect_uri_mismatch unless that exact
 * https://<host>/__/auth/handler is added to the OAuth web client.
 */
function firebaseConfig() {
  return {
    apiKey: (process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "").trim(),
    authDomain: (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "").trim(),
    projectId: (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim(),
    storageBucket: (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim(),
    messagingSenderId: (process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "").trim(),
    appId: (process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "").trim(),
    databaseURL: (process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "").trim(),
  };
}

export function isFirebaseConfigured(): boolean {
  const c = firebaseConfig();
  return Boolean(c.apiKey && c.projectId && c.authDomain);
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Database | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase env missing — copy .env.example to .env.local");
  }
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig());
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    const firebaseApp = getFirebaseApp();
    try {
      auth = initializeAuth(firebaseApp, {
        persistence: browserLocalPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      });
    } catch {
      auth = getAuth(firebaseApp);
    }
  }
  return auth;
}

export function getFirebaseDb(): Database {
  if (!db) db = getDatabase(getFirebaseApp());
  return db;
}
