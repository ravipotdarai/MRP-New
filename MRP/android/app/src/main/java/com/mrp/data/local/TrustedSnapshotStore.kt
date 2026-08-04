package com.mrp.data.local

import android.content.Context
import android.os.SystemClock
import org.json.JSONObject

/**
 * Durable + in-memory [TrustedSnapshot] for [com.mrp.domain.usecase.LocationEngine].
 * Survives process death; process cache age uses elapsed realtime separately in the engine.
 */
object TrustedSnapshotStore {

    private const val PREFS = "mrp_trusted_snapshot"
    private const val KEY_JSON = "snapshot_json"

    @Volatile
    private var memory: Snapshot? = null

    data class Snapshot(
        val latitude: Double,
        val longitude: Double,
        val accuracyM: Float,
        val fixMs: Long,
        val tier: String,
        val quality: String,
        val insideFence: Boolean,
        val fenceId: String?,
        val zoneName: String?,
        val awayM: Double?,
        val distanceToCenterM: Double?,
        val address: String?,
        /** ElapsedRealtime when this snapshot was published (process-local). */
        val publishedElapsedMs: Long
    ) {
        fun ageWallMs(nowMs: Long = System.currentTimeMillis()): Long =
            (nowMs - fixMs).coerceAtLeast(0L)

        fun toJson(): JSONObject = JSONObject()
            .put("latitude", latitude)
            .put("longitude", longitude)
            .put("accuracyM", accuracyM.toDouble())
            .put("fixMs", fixMs)
            .put("tier", tier)
            .put("quality", quality)
            .put("insideFence", insideFence)
            .put("fenceId", fenceId)
            .put("zoneName", zoneName)
            .put("awayM", awayM)
            .put("distanceToCenterM", distanceToCenterM)
            .put("address", address)
            .put("publishedElapsedMs", publishedElapsedMs)

        companion object {
            fun fromJson(o: JSONObject): Snapshot? {
                if (!o.has("latitude") || !o.has("longitude")) return null
                return Snapshot(
                    latitude = o.getDouble("latitude"),
                    longitude = o.getDouble("longitude"),
                    accuracyM = o.optDouble("accuracyM", 999.0).toFloat(),
                    fixMs = o.optLong("fixMs", 0L),
                    tier = o.optString("tier", "unknown"),
                    quality = o.optString("quality", "NONE"),
                    insideFence = o.optBoolean("insideFence", false),
                    fenceId = o.optString("fenceId").takeIf { it.isNotBlank() },
                    zoneName = o.optString("zoneName").takeIf { it.isNotBlank() },
                    awayM = if (o.has("awayM") && !o.isNull("awayM")) o.getDouble("awayM") else null,
                    distanceToCenterM = if (o.has("distanceToCenterM") && !o.isNull("distanceToCenterM")) {
                        o.getDouble("distanceToCenterM")
                    } else {
                        null
                    },
                    address = o.optString("address").takeIf { it.isNotBlank() },
                    publishedElapsedMs = o.optLong("publishedElapsedMs", 0L)
                )
            }
        }
    }

    fun read(context: Context): Snapshot? {
        memory?.let { return it }
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_JSON, null) ?: return null
        return try {
            Snapshot.fromJson(JSONObject(raw))?.also { memory = it }
        } catch (_: Exception) {
            null
        }
    }

    fun write(context: Context, snapshot: Snapshot) {
        memory = snapshot
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_JSON, snapshot.toJson().toString())
            .apply()
    }

    fun clearMemory() {
        memory = null
    }
}
