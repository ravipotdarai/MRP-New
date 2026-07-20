package com.mrp.domain.usecase

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import com.mrp.data.local.SettingsStorage
import com.mrp.service.MrpMonitorService

/**
 * Handles PACKAGE_ADDED / PACKAGE_REPLACED for App Safety alerts.
 * Must be registered dynamically with data scheme "package".
 */
class PackageChangeHandler(private val context: Context) {

    private val scorer = AppRiskScorer(context)
    private val eventLogger = TimelineEventLogger(context)

    val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent == null) return
            val action = intent.action ?: return
            if (action != Intent.ACTION_PACKAGE_ADDED && action != Intent.ACTION_PACKAGE_REPLACED) return
            // Ignore updates that are part of the same replace flow when EXTRA_REPLACING on ADDED
            if (action == Intent.ACTION_PACKAGE_ADDED && intent.getBooleanExtra(Intent.EXTRA_REPLACING, false)) {
                return
            }
            val pkg = intent.data?.schemeSpecificPart ?: return
            if (pkg == context.packageName) return
            handlePackageChange(pkg, isUpdate = action == Intent.ACTION_PACKAGE_REPLACED)
        }
    }

    fun intentFilter(): IntentFilter = IntentFilter().apply {
        addAction(Intent.ACTION_PACKAGE_ADDED)
        addAction(Intent.ACTION_PACKAGE_REPLACED)
        addDataScheme("package")
    }

    fun handlePackageChange(packageName: String, isUpdate: Boolean) {
        try {
            val settings = SettingsStorage(context).getSettings()
            if (!settings.isMonitoringEnabled || !settings.captureOnAppInstall) return

            val report = scorer.scorePackage(packageName) ?: return
            val eventType = if (isUpdate) "APP_UPDATED" else "APP_INSTALLED"
            eventLogger.logEvent(
                eventType = eventType,
                status = report.riskLevel.name.lowercase(),
                metadata = mapOf(
                    "package" to report.packageName,
                    "app_name" to report.appName,
                    "installer" to report.installer,
                    "risk_level" to report.riskLevel.name,
                    "risk_score" to report.score,
                    "reasons" to report.reasons.joinToString("; "),
                    "has_device_admin" to report.hasDeviceAdmin,
                    "has_accessibility" to report.hasAccessibility
                )
            )
            Log.i(TAG, "$eventType ${report.packageName} risk=${report.riskLevel}")

            val highRisk = report.riskLevel == AppRiskLevel.HIGH ||
                report.riskLevel == AppRiskLevel.CRITICAL
            if (highRisk && settings.captureOnRiskyAppInstall) {
                MrpMonitorService.requestPhoto(context, eventType)
            }
        } catch (e: Exception) {
            Log.e(TAG, "handlePackageChange failed", e)
        }
    }

    companion object {
        private const val TAG = "PackageChangeHandler"
    }
}
