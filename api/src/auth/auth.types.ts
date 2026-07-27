export type AuthUser = {
  uid: string;
  email: string | null;
  /** True when email is on MRP_ADMIN_EMAILS / ADMIN_EMAILS allowlist. */
  isAdmin: boolean;
};

export const AUTH_USER_KEY = 'user';
