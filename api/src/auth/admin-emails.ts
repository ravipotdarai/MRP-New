/** Server-side admin allowlist (mirrors NEXT_PUBLIC_ADMIN_EMAILS on web). */
export function parseAdminEmails(): Set<string> {
  const raw =
    process.env.MRP_ADMIN_EMAILS ||
    process.env.ADMIN_EMAILS ||
    process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
    '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowlistedAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().has(email.trim().toLowerCase());
}
