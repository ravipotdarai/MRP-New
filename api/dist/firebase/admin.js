"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminApp = getAdminApp;
exports.getAdminDb = getAdminDb;
exports.isAdminSdkConfigured = isAdminSdkConfigured;
const admin = __importStar(require("firebase-admin"));
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