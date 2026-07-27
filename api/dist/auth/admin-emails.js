"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAdminEmails = parseAdminEmails;
exports.isAllowlistedAdmin = isAllowlistedAdmin;
function parseAdminEmails() {
    const raw = process.env.MRP_ADMIN_EMAILS ||
        process.env.ADMIN_EMAILS ||
        process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
        '';
    return new Set(raw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean));
}
function isAllowlistedAdmin(email) {
    if (!email)
        return false;
    return parseAdminEmails().has(email.trim().toLowerCase());
}
//# sourceMappingURL=admin-emails.js.map