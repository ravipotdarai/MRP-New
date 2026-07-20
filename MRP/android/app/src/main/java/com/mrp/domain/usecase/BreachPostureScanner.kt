package com.mrp.domain.usecase

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityManager
import com.mrp.util.OemBatteryMitigation
import org.json.JSONArray
import org.json.JSONObject

data class PostureCheck(
    val id: String,
    val title: String,
    val ok: Boolean,
    val detail: String,
    val severity: String // info | attention | critical
)

data class PostureReport(
    val scannedAtMs: Long,
    val grade: String, // Healthy | Attention | Critical
    val checks: List<PostureCheck>,
    val newlyFailedIds: List<String>
)

/**
 * On-demand / daily cheap security posture scan (no GPS, no content reading).
 *
 * MRP's own Device Admin / Accessibility are expected privileges for protection —
 * they must never push the grade to Critical. Only unknown third-party admins do.
 */
class BreachPostureScanner(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun scan(emitAlerts: Boolean = true): PostureReport {
        val checks = mutableListOf<PostureCheck>()
        val selfPkg = context.packageName

        // MRP device admin — expected when protection is on
        val mrpAdminOn = listActiveAdminPackages().any { it == selfPkg }
        checks += PostureCheck(
            id = "mrp_device_admin",
            title = "MRP Device Admin",
            ok = true, // never fails the grade; status is informational
            detail = if (mrpAdminOn) "Active (expected for protection)" else "Off — unlock / wipe alerts limited",
            severity = "info"
        )

        // Other Accessibility services (exclude MRP + known a11y helpers)
        val otherA11y = listOtherAccessibilityPackages()
            .filter { it != selfPkg && it !in TRUSTED_A11Y_PACKAGES }
        checks += PostureCheck(
            id = "accessibility_others",
            title = "Other Accessibility services",
            ok = otherA11y.isEmpty(),
            detail = if (otherA11y.isEmpty()) "None beyond MRP / system helpers"
            else "Enabled: ${otherA11y.joinToString()}",
            severity = if (otherA11y.isEmpty()) "info" else "attention"
        )

        // Other Device Admins — split trusted (Find My Device etc.) vs unknown
        val otherAdmins = listActiveAdminPackages().filter { it != selfPkg }
        val unknownAdmins = otherAdmins.filter { it !in TRUSTED_ADMIN_PACKAGES }
        val trustedAdmins = otherAdmins.filter { it in TRUSTED_ADMIN_PACKAGES }
        checks += PostureCheck(
            id = "device_admin_others",
            title = "Other Device Admins",
            ok = unknownAdmins.isEmpty(),
            detail = when {
                unknownAdmins.isNotEmpty() -> "Unknown: ${unknownAdmins.joinToString()}"
                trustedAdmins.isNotEmpty() -> "Trusted only: ${trustedAdmins.joinToString()} (e.g. Find My Device)"
                else -> "Only MRP (or none) active"
            },
            // Unknown third-party admins = Critical; trusted Google/system = info (not a failure)
            severity = if (unknownAdmins.isEmpty()) "info" else "critical"
        )
        // Surface trusted admins as a non-failing note so the UI isn't blank about them
        if (trustedAdmins.isNotEmpty() && unknownAdmins.isEmpty()) {
            checks += PostureCheck(
                id = "device_admin_trusted",
                title = "Trusted system Device Admins",
                ok = true,
                detail = trustedAdmins.joinToString(),
                severity = "info"
            )
        }

        val adb = Settings.Global.getInt(context.contentResolver, Settings.Global.ADB_ENABLED, 0) == 1
        checks += PostureCheck(
            id = "usb_debugging",
            title = "USB debugging",
            ok = !adb,
            detail = if (adb) "ADB is ON — risk if phone is lost" else "Off",
            severity = if (adb) "attention" else "info"
        )

        val devOpts = Settings.Global.getInt(
            context.contentResolver,
            Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,
            0
        ) == 1
        checks += PostureCheck(
            id = "developer_options",
            title = "Developer options",
            ok = !devOpts,
            detail = if (devOpts) "Developer options enabled" else "Off",
            severity = "info"
        )

        val batteryOk = try {
            OemBatteryMitigation.isIgnoringBatteryOptimizations(context)
        } catch (_: Exception) {
            false
        }
        checks += PostureCheck(
            id = "battery_exempt",
            title = "MRP battery unrestricted",
            ok = batteryOk,
            detail = if (batteryOk) "Exempt from battery optimization" else "May be killed by OEM",
            severity = if (batteryOk) "info" else "attention"
        )

        val notifOk = if (Build.VERSION.SDK_INT >= 33) {
            androidx.core.app.ActivityCompat.checkSelfPermission(
                context,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        } else true
        checks += PostureCheck(
            id = "notifications",
            title = "MRP notifications",
            ok = notifOk,
            detail = if (notifOk) "Allowed" else "Blocked — FGS may be limited",
            severity = if (notifOk) "info" else "attention"
        )

        val grade = when {
            checks.any { !it.ok && it.severity == "critical" } -> "Critical"
            checks.any { !it.ok && it.severity == "attention" } -> "Attention"
            else -> "Healthy"
        }

        val prevFailed = prefs.getStringSet(KEY_FAILED, emptySet()) ?: emptySet()
        val nowFailed = checks.filter { !it.ok }.map { it.id }.toSet()
        val newlyFailed = nowFailed.filter { it !in prevFailed }

        // commit() so an immediate JS reload sees the new scan (apply() is async and raced)
        prefs.edit()
            .putStringSet(KEY_FAILED, nowFailed)
            .putLong(KEY_LAST_SCAN, System.currentTimeMillis())
            .putString(KEY_LAST_GRADE, grade)
            .putString(KEY_LAST_JSON, toJson(checks, grade))
            .commit()

        if (emitAlerts && newlyFailed.isNotEmpty()) {
            try {
                val logger = TimelineEventLogger(context)
                newlyFailed.forEach { id ->
                    val check = checks.first { it.id == id }
                    logger.logEvent(
                        eventType = "POSTURE_ALERT",
                        status = "attention",
                        metadata = mapOf(
                            "check_id" to id,
                            "title" to check.title,
                            "detail" to check.detail,
                            "severity" to check.severity
                        )
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to log posture alerts", e)
            }
        }

        return PostureReport(
            scannedAtMs = System.currentTimeMillis(),
            grade = grade,
            checks = checks,
            newlyFailedIds = newlyFailed
        )
    }

    fun lastGrade(): String = prefs.getString(KEY_LAST_GRADE, "Unknown") ?: "Unknown"

    fun lastScanJson(): String? = prefs.getString(KEY_LAST_JSON, null)

    fun lastScanAt(): Long = prefs.getLong(KEY_LAST_SCAN, 0L)

    private fun listOtherAccessibilityPackages(): List<String> {
        return try {
            val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
            am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
                .mapNotNull { it.resolveInfo?.serviceInfo?.packageName }
                .distinct()
        } catch (_: Exception) {
            val enabled = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: return emptyList()
            enabled.split(':').mapNotNull { entry ->
                entry.substringBefore('/').takeIf { it.isNotBlank() }
            }.distinct()
        }
    }

    private fun listActiveAdminPackages(): List<String> {
        return try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            dpm.activeAdmins?.map { it.packageName }?.distinct() ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun toJson(checks: List<PostureCheck>, grade: String): String {
        val arr = JSONArray()
        checks.forEach { c ->
            arr.put(
                JSONObject()
                    .put("id", c.id)
                    .put("title", c.title)
                    .put("ok", c.ok)
                    .put("detail", c.detail)
                    .put("severity", c.severity)
            )
        }
        return JSONObject()
            .put("grade", grade)
            .put("scannedAtMs", System.currentTimeMillis())
            .put("checks", arr)
            .toString()
    }

    companion object {
        private const val TAG = "BreachPosture"
        private const val PREFS = "mrp_posture"
        private const val KEY_FAILED = "failed_ids"
        private const val KEY_LAST_SCAN = "last_scan_ms"
        private const val KEY_LAST_GRADE = "last_grade"
        private const val KEY_LAST_JSON = "last_json"

        /** System / Google admins that are normal on Pixel — not a breach signal. */
        private val TRUSTED_ADMIN_PACKAGES = setOf(
            "com.google.android.gms",
            "com.google.android.apps.work.clouddpc",
            "com.android.managedprovisioning",
            "com.google.android.apps.work.clouddpc.arc",
        )

        private val TRUSTED_A11Y_PACKAGES = setOf(
            "com.google.android.marvin.talkback",
            "com.android.talkback",
            "com.google.android.accessibility.switchaccess",
            "com.google.android.apps.accessibility.voiceaccess",
            "com.google.android.apps.accessibility.auditor",
        )
    }
}
