"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminApp = getAdminApp;
exports.getAdminDb = getAdminDb;
exports.isAdminSdkConfigured = isAdminSdkConfigured;
const admin = require("firebase-admin");
let initialized = false;
let initAttempted = false;
function hasExplicitCredentials() {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
        return true;
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS)
        return true;
    return false;
}
function getAdminApp() {
    if (initialized) {
        return admin.apps.length ? admin.app() : null;
    }
    if (initAttempted) {
        return admin.apps.length ? admin.app() : null;
    }
    initAttempted = true;
    const databaseURL = process.env.FIREBASE_DATABASE_URL ||
        process.env.PUBLIC_FIREBASE_DATABASE_URL ||
        'https://mobileresilienceplatform-default-rtdb.firebaseio.com';
    try {
        if (admin.apps.length) {
            initialized = true;
            return admin.app();
        }
        const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (json) {
            const cred = JSON.parse(json);
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
        initialized = true;
        return null;
    }
    catch {
        initialized = true;
        return null;
    }
}
function getAdminDb() {
    const app = getAdminApp();
    return app ? admin.database(app) : null;
}
function isAdminSdkConfigured() {
    return hasExplicitCredentials() && getAdminApp() !== null;
}
//# sourceMappingURL=admin.js.map