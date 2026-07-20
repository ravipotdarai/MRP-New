package com.mrp.domain.usecase

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log

enum class AppRiskLevel {
    LOW, MEDIUM, HIGH, CRITICAL
}

data class AppRiskReport(
    val packageName: String,
    val appName: String,
    val installer: String,
    val isSystemApp: Boolean,
    val riskLevel: AppRiskLevel,
    val score: Int,
    val reasons: List<String>,
    val hasDeviceAdmin: Boolean,
    val hasAccessibility: Boolean,
    val hasOverlay: Boolean,
    val hasSendSms: Boolean
)

/**
 * Local heuristics only — not an antivirus. Scores installed apps by
 * dangerous permission / privilege combinations and install source.
 */
class AppRiskScorer(private val context: Context) {

    private val pm: PackageManager = context.packageManager

    fun scorePackage(packageName: String): AppRiskReport? {
        if (packageName == context.packageName) return null
        return try {
            val appInfo = pm.getApplicationInfo(packageName, 0)
            val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
            val appName = try {
                pm.getApplicationLabel(appInfo).toString()
            } catch (_: Exception) {
                packageName
            }
            val installer = resolveInstaller(packageName)
            val reasons = mutableListOf<String>()
            var score = 0

            val hasAdmin = isDeviceAdmin(packageName)
            val hasA11y = hasAccessibilityService(packageName)
            val perms = requestedPermissions(packageName)
            val hasOverlay = Manifest.permission.SYSTEM_ALERT_WINDOW in perms
            val hasSms = Manifest.permission.SEND_SMS in perms
            val hasContacts = Manifest.permission.READ_CONTACTS in perms
            val hasUsage = "android.permission.PACKAGE_USAGE_STATS" in perms
            val hasQueryAll = "android.permission.QUERY_ALL_PACKAGES" in perms

            val playInstallers = setOf(
                "com.android.vending",
                "com.google.android.packageinstaller",
                "com.google.android.apps.play.store"
            )
            val sideloaded = installer.isBlank() ||
                installer == "null" ||
                (!playInstallers.contains(installer) && !isSystem)

            if (!isSystem && sideloaded) {
                score += 35
                reasons.add("Installed from unknown / non-Play source ($installer)")
            }
            if (hasAdmin) {
                score += 50
                reasons.add("Has Device Admin privilege")
            }
            if (hasA11y) {
                score += 40
                reasons.add("Provides an Accessibility service")
            }
            if (hasOverlay && hasSms) {
                score += 30
                reasons.add("Overlay + SMS permissions together")
            } else {
                if (hasOverlay) {
                    score += 15
                    reasons.add("Can draw over other apps")
                }
                if (hasSms) {
                    score += 15
                    reasons.add("Can send SMS")
                }
            }
            if (hasOverlay && hasContacts) {
                score += 10
                reasons.add("Overlay + Contacts")
            }
            if (hasUsage || hasQueryAll) {
                score += 10
                reasons.add("Can query installed apps / usage")
            }

            val level = when {
                score >= 70 || hasAdmin -> AppRiskLevel.CRITICAL
                score >= 45 -> AppRiskLevel.HIGH
                score >= 25 -> AppRiskLevel.MEDIUM
                else -> AppRiskLevel.LOW
            }
            if (reasons.isEmpty()) reasons.add("No elevated risk signals")

            AppRiskReport(
                packageName = packageName,
                appName = appName,
                installer = installer.ifBlank { "unknown" },
                isSystemApp = isSystem,
                riskLevel = level,
                score = score.coerceAtMost(100),
                reasons = reasons,
                hasDeviceAdmin = hasAdmin,
                hasAccessibility = hasA11y,
                hasOverlay = hasOverlay,
                hasSendSms = hasSms
            )
        } catch (e: Exception) {
            Log.w(TAG, "scorePackage failed for $packageName", e)
            null
        }
    }

    fun scanInstalledApps(limit: Int = 80): List<AppRiskReport> {
        val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
        return apps.asSequence()
            .filter { (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 }
            .mapNotNull { scorePackage(it.packageName) }
            .sortedByDescending { it.score }
            .take(limit)
            .toList()
    }

    private fun resolveInstaller(packageName: String): String {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val info = pm.getInstallSourceInfo(packageName)
                info.installingPackageName
                    ?: info.initiatingPackageName
                    ?: ""
            } else {
                @Suppress("DEPRECATION")
                pm.getInstallerPackageName(packageName) ?: ""
            }
        } catch (_: Exception) {
            ""
        }
    }

    private fun requestedPermissions(packageName: String): Set<String> {
        return try {
            val pi = pm.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS)
            pi.requestedPermissions?.toSet() ?: emptySet()
        } catch (_: Exception) {
            emptySet()
        }
    }

    private fun isDeviceAdmin(packageName: String): Boolean {
        return try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            dpm.activeAdmins?.any { it.packageName == packageName } == true
        } catch (_: Exception) {
            false
        }
    }

    private fun hasAccessibilityService(packageName: String): Boolean {
        return try {
            val enabled = android.provider.Settings.Secure.getString(
                context.contentResolver,
                android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: return false
            enabled.split(':').any { it.startsWith("$packageName/") }
        } catch (_: Exception) {
            false
        }
    }

    companion object {
        private const val TAG = "AppRiskScorer"
    }
}
