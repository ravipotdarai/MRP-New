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

        val batteryExempt = try {
            OemBatteryMitigation.isIgnoringBatteryOptimizations(context)
        } catch (_: Exception) {
            false
        }
        // Optimized is a valid choice. Treating Unrestricted as required causes
        // REQUEST_IGNORE → Pixel locks App battery usage greyed ON.
        checks += PostureCheck(
            id = "battery_exempt",
            title = "MRP App battery usage",
            ok = true,
            detail = if (batteryExempt) {
                "Unrestricted — often locked by Android while Device Admin is ON"
            } else {
                "Optimized / editable when Device Admin is off"
            },
            severity = "info"
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

        // --- Security Advisor extensions (local heuristics) ---
        checks += checkRoot()
        checks += checkWirelessAdb()
        checks += checkVpnActive()
        checks += checkSystemProxy()
        checks += checkHotspot()
        checks += checkWifiCrypto()
        checks += checkLockScreenNotifications()
        checks += checkPlayProtectHints()

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

    private fun checkRoot(): PostureCheck {
        val tags = Build.TAGS ?: ""
        val testKeys = tags.contains("test-keys")
        val paths = listOf(
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/sbin/.magisk",
            "/data/adb/magisk",
        )
        val found = paths.any { java.io.File(it).exists() }
        val risky = testKeys || found
        return PostureCheck(
            id = "root_magisk",
            title = "Root / Magisk signals",
            ok = !risky,
            detail = when {
                found -> "Su/Magisk paths present — elevated risk if phone is lost"
                testKeys -> "Build has test-keys"
                else -> "No common root markers found"
            },
            severity = if (risky) "attention" else "info"
        )
    }

    private fun checkWirelessAdb(): PostureCheck {
        val on = if (Build.VERSION.SDK_INT >= 30) {
            Settings.Global.getInt(context.contentResolver, "adb_wifi_enabled", 0) == 1
        } else {
            false
        }
        return PostureCheck(
            id = "wireless_adb",
            title = "Wireless debugging",
            ok = !on,
            detail = if (on) "ADB over Wi‑Fi is ON" else if (Build.VERSION.SDK_INT < 30) "N/A on this Android version" else "Off",
            severity = if (on) "attention" else "info"
        )
    }

    private fun checkVpnActive(): PostureCheck {
        val active = try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
            val nets = cm.allNetworks ?: emptyArray()
            nets.any { n ->
                val caps = cm.getNetworkCapabilities(n) ?: return@any false
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN)
            }
        } catch (_: Exception) {
            false
        }
        return PostureCheck(
            id = "vpn_active",
            title = "VPN active",
            ok = true, // informational — VPN can be legitimate
            detail = if (active) "A VPN network is active" else "No VPN transport detected",
            severity = "info"
        )
    }

    private fun checkSystemProxy(): PostureCheck {
        val proxy = Settings.Global.getString(context.contentResolver, Settings.Global.HTTP_PROXY)
        val set = !proxy.isNullOrBlank() && proxy != ":0"
        return PostureCheck(
            id = "http_proxy",
            title = "System HTTP proxy",
            ok = !set,
            detail = if (set) "Proxy configured: $proxy" else "None",
            severity = if (set) "attention" else "info"
        )
    }

    private fun checkHotspot(): PostureCheck {
        val on = try {
            val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
            val method = wifi.javaClass.getDeclaredMethod("isWifiApEnabled")
            method.isAccessible = true
            method.invoke(wifi) as Boolean
        } catch (_: Exception) {
            false
        }
        return PostureCheck(
            id = "hotspot_active",
            title = "Wi‑Fi hotspot",
            ok = !on,
            detail = if (on) "Hotspot appears ON" else "Off (or undetectable)",
            severity = if (on) "info" else "info"
        )
    }

    private fun checkWifiCrypto(): PostureCheck {
        return try {
            val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
            @Suppress("DEPRECATION")
            val info = wifi.connectionInfo
            val ssid = info?.ssid?.trim('"') ?: ""
            if (ssid.isBlank() || ssid == "<unknown ssid>" || info.networkId == -1) {
                return PostureCheck(
                    id = "wifi_crypto",
                    title = "Wi‑Fi encryption",
                    ok = true,
                    detail = "Not connected to Wi‑Fi",
                    severity = "info"
                )
            }
            // Best-effort: infer from scan results for current BSSID/SSID
            @Suppress("DEPRECATION")
            val results = try {
                wifi.scanResults
            } catch (_: SecurityException) {
                emptyList()
            }
            val match = results.firstOrNull {
                it.SSID == ssid || it.BSSID.equals(info.bssid, ignoreCase = true)
            }
            val caps = match?.capabilities ?: ""
            val open = caps.contains("ESS") && !caps.contains("WPA") && !caps.contains("WEP") &&
                !caps.contains("PSK") && !caps.contains("EAP") && !caps.contains("SAE")
            val wep = caps.contains("WEP")
            val weak = open || wep
            val grade = when {
                caps.contains("SAE") || caps.contains("WPA3") -> "WPA3"
                caps.contains("WPA2") || caps.contains("RSN") || caps.contains("PSK") -> "WPA2"
                wep -> "WEP"
                open -> "Open"
                caps.isBlank() -> "Unknown"
                else -> "Secured"
            }
            PostureCheck(
                id = "wifi_crypto",
                title = "Wi‑Fi encryption",
                ok = !weak,
                detail = if (caps.isBlank()) "Connected ($ssid) — crypto unknown without scan access"
                else "$ssid · $grade",
                severity = when {
                    open -> "attention"
                    wep -> "attention"
                    else -> "info"
                }
            )
        } catch (_: Exception) {
            PostureCheck(
                id = "wifi_crypto",
                title = "Wi‑Fi encryption",
                ok = true,
                detail = "Unable to read Wi‑Fi security",
                severity = "info"
            )
        }
    }

    private fun checkLockScreenNotifications(): PostureCheck {
        // 0 = show all, 1 = hide sensitive content when locked (varies by OEM)
        val raw = Settings.Secure.getInt(
            context.contentResolver,
            "lock_screen_allow_private_notifications",
            1
        )
        // Also check notification redaction style when available
        val showSensitive = raw == 1
        return PostureCheck(
            id = "lock_screen_notifs",
            title = "Lock-screen notifications",
            ok = true,
            detail = if (showSensitive) "Private content may show on lock screen — review in system Settings"
            else "Sensitive content likely hidden when locked",
            severity = "info"
        )
    }

    private fun checkPlayProtectHints(): PostureCheck {
        val verifier = Settings.Global.getInt(
            context.contentResolver,
            "package_verifier_enable",
            1
        ) == 1
        val playProtectPkg = try {
            context.packageManager.getPackageInfo("com.google.android.gms", 0)
            true
        } catch (_: Exception) {
            false
        }
        return PostureCheck(
            id = "play_protect",
            title = "Play Protect / package verify",
            ok = verifier,
            detail = when {
                !playProtectPkg -> "Play services not found"
                verifier -> "Package verification enabled (Play Protect typically on)"
                else -> "Package verification disabled"
            },
            severity = if (verifier) "info" else "attention"
        )
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
