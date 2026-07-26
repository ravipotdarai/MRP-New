"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminApp = getAdminApp;
exports.getAdminDb = getAdminDb;
exports.isAdminSdkConfigured = isAdminSdkConfigured;
const admin = require("firebase-admin");
let initialized = false;
function getAdminApp() {
    if (initialized) {
        return admin.apps.length ? admin.app() : null;
    }
    initialized = true;
    const databaseURL = process.env.FIREBASE_DATABASE_URL ||
        process.env.PUBLIC_FIREBASE_DATABASE_URL ||
        'https://mobileresilienceplatform-default-rtdb.firebaseio.com';
    try {
        if (admin.apps.length) {
            return admin.app();
        }
        const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (json) {
            const cred = JSON.parse(json);
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
        const projectId = process.env.PUBLIC_FIREBASE_PROJECT_ID ||
            process.env.GCLOUD_PROJECT ||
            'mobileresilienceplatform';
        try {
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                databaseURL,
                projectId,
            });
            return admin.app();
        }
        catch {
            return null;
        }
    }
    catch {
        return null;
    }
}
function getAdminDb() {
    const app = getAdminApp();
    return app ? admin.database(app) : null;
}
function isAdminSdkConfigured() {
    return getAdminApp() !== null;
}
//# sourceMappingURL=admin.js.map