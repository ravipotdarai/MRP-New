package com.mrp.security

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import com.mrp.BuildConfig
import com.mrp.domain.model.EventTypes
import com.mrp.domain.model.StatusValues
import com.mrp.domain.usecase.TimelineEventLogger
import java.security.MessageDigest

/**
 * Best-effort anti-clone / tamper signals (Phase 5–6).
 * Does not hard-crash monitoring. Set [BuildConfig.EXPECTED_SIGNING_CERT_SHA256]
 * to the release cert SHA-256 (hex, no colons) once Play signing is fixed.
 */
object RuntimeIntegrityChecker {

    private const val TAG = "RuntimeIntegrity"
    private const val PREFS = "mrp_integrity"
    private const val KEY_LAST_SHA = "last_signing_sha256"
    private const val KEY_LAST_TAMPER_AT = "last_tamper_at_ms"
    private const val TAMPER_COOLDOWN_MS = 12L * 60L * 60L * 1000L

    fun runAsync(context: Context) {
        Thread({
            try {
                evaluate(context.applicationContext)
            } catch (e: Exception) {
                Log.w(TAG, "integrity check failed: ${e.message}")
            }
        }, "mrp-integrity").start()
    }

    private fun evaluate(context: Context) {
        val pkg = context.packageName
        val sha = signingCertSha256(context) ?: ""
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_LAST_SHA, sha).apply()

        val expected = BuildConfig.EXPECTED_SIGNING_CERT_SHA256.trim()
        val packageOk = pkg == "com.mrp"
        val certOk = expected.isEmpty() || expected.equals(sha, ignoreCase = true)
        val debuggable =
            (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

        if (!packageOk || !certOk) {
            maybeLogTamper(
                context,
                prefs,
                reason = when {
                    !packageOk -> "package_mismatch"
                    else -> "signing_cert_mismatch"
                },
                sha = sha,
                expected = expected,
            )
        } else if (debuggable && !BuildConfig.DEBUG) {
            // Release binary marked debuggable — unusual for store builds.
            maybeLogTamper(
                context,
                prefs,
                reason = "debuggable_release",
                sha = sha,
                expected = expected,
            )
        } else {
            Log.i(TAG, "ok package=$pkg sha=${sha.take(12)}… expectedSet=${expected.isNotEmpty()}")
        }
    }

    private fun maybeLogTamper(
        context: Context,
        prefs: android.content.SharedPreferences,
        reason: String,
        sha: String,
        expected: String,
    ) {
        val now = System.currentTimeMillis()
        val last = prefs.getLong(KEY_LAST_TAMPER_AT, 0L)
        if (now - last < TAMPER_COOLDOWN_MS) {
            Log.w(TAG, "tamper signal suppressed (cooldown): $reason")
            return
        }
        prefs.edit().putLong(KEY_LAST_TAMPER_AT, now).apply()
        Log.w(TAG, "tamper signal: $reason sha=${sha.take(16)}…")
        try {
            TimelineEventLogger(context).logEvent(
                EventTypes.SECURITY_TAMPER,
                StatusValues.FAILED,
                mapOf(
                    "reason" to reason,
                    "package" to context.packageName,
                    "signing_sha256_prefix" to sha.take(16),
                    "expected_configured" to expected.isNotEmpty(),
                ),
            )
        } catch (e: Exception) {
            Log.w(TAG, "could not write SECURITY_TAMPER: ${e.message}")
        }
    }

    fun signingCertSha256(context: Context): String? {
        return try {
            val pm = context.packageManager
            val packageName = context.packageName
            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val info = pm.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                val signingInfo = info.signingInfo ?: return null
                if (signingInfo.hasMultipleSigners()) {
                    signingInfo.apkContentsSigners
                } else {
                    signingInfo.signingCertificateHistory
                }
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(packageName, PackageManager.GET_SIGNATURES).signatures
            }
            val first = signatures?.firstOrNull() ?: return null
            val digest = MessageDigest.getInstance("SHA-256").digest(first.toByteArray())
            digest.joinToString("") { b -> "%02x".format(b) }
        } catch (e: Exception) {
            Log.w(TAG, "signingCertSha256: ${e.message}")
            null
        }
    }
}
