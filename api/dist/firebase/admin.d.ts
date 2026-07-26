import * as admin from 'firebase-admin';
export declare function getAdminApp(): admin.app.App | null;
export declare function getAdminDb(): admin.database.Database | null;
export declare function isAdminSdkConfigured(): boolean;
