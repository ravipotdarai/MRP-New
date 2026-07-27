export type AuthUser = {
    uid: string;
    email: string | null;
    isAdmin: boolean;
};
export declare const AUTH_USER_KEY = "user";
