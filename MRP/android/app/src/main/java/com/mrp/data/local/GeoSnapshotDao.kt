package com.mrp.data.local

import android.content.ContentValues
import android.content.Context
import android.util.Log

/**
 * Append-only geo history for lost-device tracking (future web sync).
 * Retention: 10k rows / 180 days — pruned on insert.
 */
class GeoSnapshotDao(context: Context) {

    private val dbHelper = DatabaseHelper(context)

    data class GeoSnapshot(
        val deviceId: String,
        val capturedAtMs: Long,
        val latitude: Double,
        val longitude: Double,
        val accuracyM: Float,
        val altitudeM: Double,
        val provider: String,
        val locationTier: String,
        val detailedAddress: String?,
        val insideGeofence: Boolean,
        val geofenceId: String?,
        val triggerSource: String,
        val triggerReferenceId: String?,
        val batteryPct: Int,
        val networkType: String,
        val jsonMeta: String?
    )

    fun insert(snapshot: GeoSnapshot): Long {
        val db = dbHelper.writableDatabase
        return try {
            val values = ContentValues().apply {
                put(DatabaseHelper.COL_GEO_DEVICE_ID, snapshot.deviceId)
                put(DatabaseHelper.COL_GEO_CAPTURED_AT, snapshot.capturedAtMs)
                put(DatabaseHelper.COL_GEO_LATITUDE, snapshot.latitude)
                put(DatabaseHelper.COL_GEO_LONGITUDE, snapshot.longitude)
                put(DatabaseHelper.COL_GEO_ACCURACY, snapshot.accuracyM.toDouble())
                put(DatabaseHelper.COL_GEO_ALTITUDE, snapshot.altitudeM)
                put(DatabaseHelper.COL_GEO_PROVIDER, snapshot.provider)
                put(DatabaseHelper.COL_GEO_TIER, snapshot.locationTier)
                put(DatabaseHelper.COL_GEO_ADDRESS, snapshot.detailedAddress)
                put(DatabaseHelper.COL_GEO_INSIDE_FENCE, if (snapshot.insideGeofence) 1 else 0)
                put(DatabaseHelper.COL_GEO_FENCE_ID, snapshot.geofenceId)
                put(DatabaseHelper.COL_GEO_TRIGGER, snapshot.triggerSource)
                put(DatabaseHelper.COL_GEO_REF_ID, snapshot.triggerReferenceId)
                put(DatabaseHelper.COL_GEO_BATTERY, snapshot.batteryPct)
                put(DatabaseHelper.COL_GEO_NETWORK, snapshot.networkType)
                put(DatabaseHelper.COL_GEO_SYNC_STATUS, "PENDING")
                put(DatabaseHelper.COL_GEO_JSON_META, snapshot.jsonMeta)
            }
            val id = db.insert(DatabaseHelper.TABLE_GEO_SNAPSHOTS, null, values)
            pruneOldRows(db)
            id
        } catch (e: Exception) {
            Log.e(TAG, "insert failed", e)
            -1L
        } finally {
            db.close()
        }
    }

    private fun pruneOldRows(db: android.database.sqlite.SQLiteDatabase) {
        val cutoff = System.currentTimeMillis() - RETENTION_MS
        try {
            db.delete(
                DatabaseHelper.TABLE_GEO_SNAPSHOTS,
                "${DatabaseHelper.COL_GEO_CAPTURED_AT} < ?",
                arrayOf(cutoff.toString())
            )
            db.execSQL(
                """
                DELETE FROM ${DatabaseHelper.TABLE_GEO_SNAPSHOTS}
                WHERE ${DatabaseHelper.COL_GEO_ID} NOT IN (
                    SELECT ${DatabaseHelper.COL_GEO_ID} FROM ${DatabaseHelper.TABLE_GEO_SNAPSHOTS}
                    ORDER BY ${DatabaseHelper.COL_GEO_CAPTURED_AT} DESC
                    LIMIT $MAX_ROWS
                )
                """.trimIndent()
            )
        } catch (e: Exception) {
            Log.w(TAG, "prune failed", e)
        }
    }

    companion object {
        private const val TAG = "GeoSnapshotDao"
        const val MAX_ROWS = 10_000
        const val RETENTION_MS = 180L * 24 * 60 * 60 * 1000
    }
}
