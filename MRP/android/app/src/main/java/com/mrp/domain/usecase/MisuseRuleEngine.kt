package com.mrp.domain.usecase

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONObject
import java.util.Calendar

/**
 * Simple misuse rule presets evaluated against app usage sessions.
 */
class MisuseRuleEngine(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val eventLogger = TimelineEventLogger(context)

    data class RulePreset(
        val id: String,
        val title: String,
        val description: String,
        val enabled: Boolean
    )

    fun listPresets(): List<RulePreset> = PRESETS.map {
        RulePreset(it.id, it.title, it.description, isEnabled(it.id))
    }

    fun setEnabled(ruleId: String, enabled: Boolean) {
        prefs.edit().putBoolean(keyEnabled(ruleId), enabled).apply()
    }

    fun isEnabled(ruleId: String): Boolean =
        prefs.getBoolean(keyEnabled(ruleId), PRESETS.firstOrNull { it.id == ruleId }?.defaultOn ?: false)

    /**
     * Evaluate sessions (start/end epoch ms, package, durationSeconds).
     * Fires at most once per rule per [DEBOUNCE_MS].
     */
    fun evaluateSessions(sessions: List<UsageSlice>) {
        val settings = com.mrp.data.local.SettingsStorage(context).getSettings()
        if (!settings.isMonitoringEnabled || !settings.captureOnAppMisuse) return

        val now = System.currentTimeMillis()
        for (preset in PRESETS) {
            if (!isEnabled(preset.id)) continue
            val last = prefs.getLong(keyFired(preset.id), 0L)
            if (now - last < DEBOUNCE_MS) continue

            val hit = when (preset.id) {
                RULE_NIGHT_SOCIAL -> sessions.any { isNight(it.startMs) && isSocialish(it.packageName, it.appName) && it.durationSeconds >= 60 }
                RULE_SOCIAL_CAP -> {
                    val todayStart = startOfDayMs()
                    val total = sessions
                        .filter { it.startMs >= todayStart && isSocialish(it.packageName, it.appName) }
                        .sumOf { it.durationSeconds }
                    total >= 3 * 3600
                }
                RULE_CAMERA_NIGHT -> sessions.any {
                    isNight(it.startMs) && isCameraish(it.packageName, it.appName) && it.durationSeconds >= 30
                }
                else -> false
            }
            if (!hit) continue

            prefs.edit().putLong(keyFired(preset.id), now).apply()
            val sample = sessions.firstOrNull()
            eventLogger.logEvent(
                eventType = "APP_MISUSE",
                status = "alert",
                metadata = mapOf(
                    "rule_id" to preset.id,
                    "rule_title" to preset.title,
                    "package" to (sample?.packageName ?: ""),
                    "app_name" to (sample?.appName ?: "")
                )
            )
            Log.i(TAG, "Misuse rule fired: ${preset.id}")
        }
    }

    data class UsageSlice(
        val packageName: String,
        val appName: String,
        val startMs: Long,
        val durationSeconds: Long
    )

    private fun isNight(epochMs: Long): Boolean {
        val hour = Calendar.getInstance().apply { timeInMillis = epochMs }.get(Calendar.HOUR_OF_DAY)
        return hour in 0..4 || hour >= 23
    }

    private fun startOfDayMs(): Long {
        val cal = Calendar.getInstance()
        cal.set(Calendar.HOUR_OF_DAY, 0)
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }

    private fun isSocialish(pkg: String, name: String): Boolean {
        val p = pkg.lowercase()
        val n = name.lowercase()
        return SOCIAL_HINTS.any { p.contains(it) || n.contains(it) }
    }

    private fun isCameraish(pkg: String, name: String): Boolean {
        val p = pkg.lowercase()
        val n = name.lowercase()
        return CAMERA_HINTS.any { p.contains(it) || n.contains(it) }
    }

    private data class PresetDef(
        val id: String,
        val title: String,
        val description: String,
        val defaultOn: Boolean
    )

    companion object {
        private const val TAG = "MisuseRuleEngine"
        private const val PREFS = "mrp_misuse_rules"
        private const val DEBOUNCE_MS = 60L * 60L * 1000L
        const val RULE_NIGHT_SOCIAL = "night_social"
        const val RULE_SOCIAL_CAP = "social_daily_cap"
        const val RULE_CAMERA_NIGHT = "camera_night"

        private val PRESETS = listOf(
            PresetDef(
                RULE_NIGHT_SOCIAL,
                "Night social apps",
                "Alert when social apps are used between midnight and 5 AM (sessions ≥ 1 min).",
                defaultOn = false
            ),
            PresetDef(
                RULE_SOCIAL_CAP,
                "Social 3h daily cap",
                "Alert when social apps exceed 3 hours today.",
                defaultOn = false
            ),
            PresetDef(
                RULE_CAMERA_NIGHT,
                "Night camera use",
                "Alert when camera apps run between midnight and 5 AM.",
                defaultOn = true
            )
        )

        private val SOCIAL_HINTS = listOf(
            "whatsapp", "instagram", "facebook", "fb.", "tiktok", "snapchat",
            "telegram", "twitter", "x.com", "reddit", "discord", "messenger"
        )
        private val CAMERA_HINTS = listOf("camera", "cameraserver", "gcam", "opencamera")

        private fun keyEnabled(id: String) = "enabled_$id"
        private fun keyFired(id: String) = "fired_$id"
    }
}
