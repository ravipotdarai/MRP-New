package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.mrp.data.local.IntruderStorage
import com.mrp.data.local.SettingsStorage
import com.mrp.data.local.SimRecoveryStorage
import com.mrp.data.local.TimelineStorage
import com.mrp.service.MrpMonitorService
import org.json.JSONObject
import java.io.File

/**
 * Owner-phone soft wipe: erase MRP local protection data without Device Admin wipeData().
 * Does not factory-reset the device or clear the app PIN / Google account.
 */
class SoftWipeHelper(private val context: Context) {

    fun perform(confirmToken: String): JSONObject {
        if (confirmToken.trim().uppercase() != CONFIRM_TOKEN) {
            return JSONObject().apply {
                put("ok", false)
                put("reason", "confirm_required")
                put("message", "Type WIPE to confirm")
            }
        }

        val cleared = mutableListOf<String>()
        try {
            MrpMonitorService.stopService(context)
            cleared.add("monitoring_stopped")
        } catch (e: Exception) {
            Log.w(TAG, "stop monitoring", e)
        }

        try {
            val settings = SettingsStorage(context)
            val current = settings.getSettings()
            settings.saveSettings(current.copy(isMonitoringEnabled = false))
            cleared.add("monitoring_disabled")
        } catch (e: Exception) {
            Log.w(TAG, "settings", e)
        }

        try {
            TimelineStorage(context).clearAllTimeline()
            cleared.add("timeline")
        } catch (e: Exception) {
            Log.w(TAG, "timeline", e)
        }

        try {
            val photosDir = File(context.getExternalFilesDir(null), "MRP")
            if (photosDir.exists()) {
                photosDir.listFiles()?.forEach { it.delete() }
            }
            cleared.add("photos")
        } catch (e: Exception) {
            Log.w(TAG, "photos", e)
        }

        try {
            IntruderStorage(context).let { store ->
                store.getIntruders().forEach { store.deleteIntruder(it.id) }
            }
            cleared.add("intruders")
        } catch (e: Exception) {
            Log.w(TAG, "intruders", e)
        }

        try {
            SimRecoveryStorage(context).clearAllSensitive()
            cleared.add("sim_recovery")
        } catch (e: Exception) {
            Log.w(TAG, "sim_recovery", e)
        }

        try {
            context.getSharedPreferences(UI_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_CIRCLE_LOCAL_JSON, "[]")
                .apply()
            cleared.add("circles")
        } catch (e: Exception) {
            Log.w(TAG, "circles", e)
        }

        return JSONObject().apply {
            put("ok", true)
            put("cleared", cleared.joinToString(","))
            put("message", "MRP local data erased. Device lock PIN and factory wipe are unchanged.")
        }
    }

    companion object {
        private const val TAG = "SoftWipeHelper"
        const val CONFIRM_TOKEN = "WIPE"
        private const val UI_PREFS = "mrp_ui"
        private const val KEY_CIRCLE_LOCAL_JSON = "circle_local_json"
    }
}
