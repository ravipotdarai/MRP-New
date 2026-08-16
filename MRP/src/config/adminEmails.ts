/** Keep in sync with OpsAdmin.kt, RTDB rules, and NEXT_PUBLIC_ADMIN_EMAILS. */
export const ADMIN_EMAILS = ['ravipotdarai@gmail.com'];

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
