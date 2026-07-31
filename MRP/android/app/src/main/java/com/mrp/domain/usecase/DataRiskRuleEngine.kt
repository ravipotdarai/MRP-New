package com.mrp.domain.usecase

import android.content.Context
import android.content.SharedPreferences
import android.util.Log

/**
 * Timeline alerts for apps with sensitive permission combinations.
 * No selfie. Debounced. Runs on package change / vault build / optional RN refresh — not a poller.
 */
class DataRiskRuleEngine(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val eventLogger = TimelineEventLogger(context)

    data class RulePreset(
        val id: String,
        val title: String,
        val description: String,
        val enabled: Boolean,
    )

    fun listPresets(): List<RulePreset> = PRESETS.map {
        RulePreset(it.id, it.title, it.description, isEnabled(it.id))
    }

    fun setEnabled(ruleId: String, enabled: Boolean) {
        prefs.edit().putBoolean(keyEnabled(ruleId), enabled).apply()
    }

    fun isEnabled(ruleId: String): Boolean =
        prefs.getBoolean(keyEnabled(ruleId), PRESETS.firstOrNull { it.id == ruleId }?.defaultOn ?: false)

    /** Scan once; at most one timeline row per rule per [DEBOUNCE_MS]. */
    fun evaluateInstalled() {
        val settings = com.mrp.data.local.SettingsStorage(context).getSettings()
        if (!settings.isMonitoringEnabled) return

        val now = System.currentTimeMillis()
        val candidates = SensitivePermissionScanner(context).dataRiskCandidates(50)
        if (candidates.isEmpty()) return

        for (preset in PRESETS) {
            if (!isEnabled(preset.id)) continue
            val last = prefs.getLong(keyFired(preset.id), 0L)
            if (now - last < DEBOUNCE_MS) continue

            val hit = when (preset.id) {
                RULE_SMS_CONTACTS -> candidates.firstOrNull {
                    "SMS" in it.permissions && "CONTACTS" in it.permissions
                }
                RULE_SMS_CAMERA -> candidates.firstOrNull {
                    "SMS" in it.permissions && "CAMERA" in it.permissions
                }
                RULE_CAM_MIC_STORAGE -> candidates.firstOrNull {
                    "CAMERA" in it.permissions &&
                        "MICROPHONE" in it.permissions &&
                        "STORAGE" in it.permissions
                }
                else -> null
            } ?: continue

            prefs.edit().putLong(keyFired(preset.id), now).apply()
            eventLogger.logEvent(
                eventType = "DATA_RISK_APP",
                status = "alert",
                metadata = mapOf(
                    "rule_id" to preset.id,
                    "rule_title" to preset.title,
                    "package_name" to hit.packageName,
                    "package" to hit.packageName,
                    "app_name" to hit.appName,
                    "application_name" to hit.appName,
                    "permissions" to hit.permissions.joinToString(","),
                    "event_time_ms" to now,
                    "note" to "Permission-risk heuristic — not live traffic proof",
                ),
            )
            Log.i(TAG, "DATA_RISK_APP ${preset.id} → ${hit.appName}")
        }
    }

    private fun keyEnabled(id: String) = "enabled_$id"
    private fun keyFired(id: String) = "fired_$id"

    private data class PresetDef(
        val id: String,
        val title: String,
        val description: String,
        val defaultOn: Boolean,
    )

    companion object {
        private const val TAG = "DataRiskRuleEngine"
        private const val PREFS = "mrp_data_risk_rules"
        private const val DEBOUNCE_MS = 6L * 60L * 60L * 1000L // 6h per rule
        private const val RULE_SMS_CONTACTS = "sms_contacts"
        private const val RULE_SMS_CAMERA = "sms_camera"
        private const val RULE_CAM_MIC_STORAGE = "cam_mic_storage"

        private val PRESETS = listOf(
            PresetDef(
                RULE_SMS_CONTACTS,
                "SMS + Contacts",
                "Non-system app requests SMS and Contacts together (data-exfil risk).",
                true,
            ),
            PresetDef(
                RULE_SMS_CAMERA,
                "SMS + Camera",
                "Non-system app requests SMS and Camera together.",
                true,
            ),
            PresetDef(
                RULE_CAM_MIC_STORAGE,
                "Camera + Mic + Storage",
                "Non-system app can capture media and read storage.",
                false,
            ),
        )
    }
}
