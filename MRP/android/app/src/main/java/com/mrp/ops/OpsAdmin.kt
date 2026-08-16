package com.mrp.ops

/** Keep in sync with MRP/src/config/adminEmails.ts, web NEXT_PUBLIC_ADMIN_EMAILS, and RTDB rules. */
object OpsAdmin {
    private val emails = setOf("ravipotdarai@gmail.com")

    fun isAdmin(email: String?): Boolean {
        val e = email?.trim()?.lowercase() ?: return false
        return emails.contains(e)
    }
}
