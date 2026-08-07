package com.mrp.data.local

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.util.Log

/**
 * Dense GPS trail for JPNI day packs (local only until encrypted Drive upload).
 * Retention: 90 days / 200k rows — pruned on insert.
 */
class GpsTrailDao(context: Context) {

    private val dbHelper = DatabaseHelper(context)

    data class TrailPoint(
        val id: Long = 0,
        val capturedAtMs: Long,
        val latitude: Double,
        val longitude: Double,
        val speedMps: Float,
        val headingDeg: Float,
        val accuracyM: Float,
        val altitudeM: Double,
        val batteryPct: Int,
        val networkType: String,
        val gpsOk: Boolean,
        val motion: String,
        val syncStatus: String = "PENDING",
    )

    fun insert(point: TrailPoint): Long {
        val db = dbHelper.writableDatabase
        return try {
            val values = ContentValues().apply {
                put(DatabaseHelper.COL_TRAIL_CAPTURED_AT, point.capturedAtMs)
                put(DatabaseHelper.COL_TRAIL_LATITUDE, point.latitude)
                put(DatabaseHelper.COL_TRAIL_LONGITUDE, point.longitude)
                put(DatabaseHelper.COL_TRAIL_SPEED, point.speedMps.toDouble())
                put(DatabaseHelper.COL_TRAIL_HEADING, point.headingDeg.toDouble())
                put(DatabaseHelper.COL_TRAIL_ACCURACY, point.accuracyM.toDouble())
                put(DatabaseHelper.COL_TRAIL_ALTITUDE, point.altitudeM)
                put(DatabaseHelper.COL_TRAIL_BATTERY, point.batteryPct)
                put(DatabaseHelper.COL_TRAIL_NETWORK, point.networkType)
                put(DatabaseHelper.COL_TRAIL_GPS_OK, if (point.gpsOk) 1 else 0)
                put(DatabaseHelper.COL_TRAIL_MOTION, point.motion)
                put(DatabaseHelper.COL_TRAIL_SYNC_STATUS, point.syncStatus)
            }
            val id = db.insert(DatabaseHelper.TABLE_GPS_TRAIL, null, values)
            pruneOldRows(db)
            id
        } catch (e: Exception) {
            Log.e(TAG, "insert failed", e)
            -1L
        } finally {
            db.close()
        }
    }

    fun lastCapturedAtMs(): Long {
        val db = dbHelper.readableDatabase
        return try {
            db.rawQuery(
                "SELECT MAX(${DatabaseHelper.COL_TRAIL_CAPTURED_AT}) FROM ${DatabaseHelper.TABLE_GPS_TRAIL}",
                null,
            ).use { c ->
                if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else 0L
            }
        } catch (e: Exception) {
            Log.w(TAG, "lastCapturedAtMs", e)
            0L
        } finally {
            db.close()
        }
    }

    /** Distinct local calendar days (yyyy-MM-dd) that have pending points. */
    fun pendingDayKeys(): List<String> {
        val db = dbHelper.readableDatabase
        val out = mutableListOf<String>()
        return try {
            db.rawQuery(
                """
                SELECT DISTINCT strftime('%Y-%m-%d', ${DatabaseHelper.COL_TRAIL_CAPTURED_AT} / 1000, 'unixepoch', 'localtime')
                FROM ${DatabaseHelper.TABLE_GPS_TRAIL}
                WHERE ${DatabaseHelper.COL_TRAIL_SYNC_STATUS} = 'PENDING'
                ORDER BY 1 DESC
                """.trimIndent(),
                null,
            ).use { c ->
                while (c.moveToNext()) {
                    val d = c.getString(0)
                    if (!d.isNullOrBlank()) out.add(d)
                }
            }
            out
        } catch (e: Exception) {
            Log.w(TAG, "pendingDayKeys", e)
            emptyList()
        } finally {
            db.close()
        }
    }

    /** Distinct local calendar days (yyyy-MM-dd) with any trail points. */
    fun allDayKeys(): List<String> {
        val db = dbHelper.readableDatabase
        val out = mutableListOf<String>()
        return try {
            db.rawQuery(
                """
                SELECT DISTINCT strftime('%Y-%m-%d', ${DatabaseHelper.COL_TRAIL_CAPTURED_AT} / 1000, 'unixepoch', 'localtime')
                FROM ${DatabaseHelper.TABLE_GPS_TRAIL}
                ORDER BY 1 DESC
                """.trimIndent(),
                null,
            ).use { c ->
                while (c.moveToNext()) {
                    val d = c.getString(0)
                    if (!d.isNullOrBlank()) out.add(d)
                }
            }
            out
        } catch (e: Exception) {
            Log.w(TAG, "allDayKeys", e)
            emptyList()
        } finally {
            db.close()
        }
    }

    fun pointsForLocalDay(dayKey: String): List<TrailPoint> {
        val db = dbHelper.readableDatabase
        return try {
            db.rawQuery(
                """
                SELECT * FROM ${DatabaseHelper.TABLE_GPS_TRAIL}
                WHERE strftime('%Y-%m-%d', ${DatabaseHelper.COL_TRAIL_CAPTURED_AT} / 1000, 'unixepoch', 'localtime') = ?
                ORDER BY ${DatabaseHelper.COL_TRAIL_CAPTURED_AT} ASC
                """.trimIndent(),
                arrayOf(dayKey),
            ).use { c ->
                val list = mutableListOf<TrailPoint>()
                while (c.moveToNext()) list.add(cursorToPoint(c))
                list
            }
        } catch (e: Exception) {
            Log.w(TAG, "pointsForLocalDay $dayKey", e)
            emptyList()
        } finally {
            db.close()
        }
    }

    fun markDaySynced(dayKey: String) {
        val db = dbHelper.writableDatabase
        try {
            db.execSQL(
                """
                UPDATE ${DatabaseHelper.TABLE_GPS_TRAIL}
                SET ${DatabaseHelper.COL_TRAIL_SYNC_STATUS} = 'SYNCED'
                WHERE strftime('%Y-%m-%d', ${DatabaseHelper.COL_TRAIL_CAPTURED_AT} / 1000, 'unixepoch', 'localtime') = ?
                """.trimIndent(),
                arrayOf(dayKey),
            )
        } catch (e: Exception) {
            Log.w(TAG, "markDaySynced $dayKey", e)
        } finally {
            db.close()
        }
    }

    private fun cursorToPoint(c: Cursor): TrailPoint {
        fun idx(col: String) = c.getColumnIndex(col)
        return TrailPoint(
            id = c.getLong(idx(DatabaseHelper.COL_TRAIL_ID)),
            capturedAtMs = c.getLong(idx(DatabaseHelper.COL_TRAIL_CAPTURED_AT)),
            latitude = c.getDouble(idx(DatabaseHelper.COL_TRAIL_LATITUDE)),
            longitude = c.getDouble(idx(DatabaseHelper.COL_TRAIL_LONGITUDE)),
            speedMps = c.getDouble(idx(DatabaseHelper.COL_TRAIL_SPEED)).toFloat(),
            headingDeg = c.getDouble(idx(DatabaseHelper.COL_TRAIL_HEADING)).toFloat(),
            accuracyM = c.getDouble(idx(DatabaseHelper.COL_TRAIL_ACCURACY)).toFloat(),
            altitudeM = c.getDouble(idx(DatabaseHelper.COL_TRAIL_ALTITUDE)),
            batteryPct = c.getInt(idx(DatabaseHelper.COL_TRAIL_BATTERY)),
            networkType = c.getString(idx(DatabaseHelper.COL_TRAIL_NETWORK)) ?: "",
            gpsOk = c.getInt(idx(DatabaseHelper.COL_TRAIL_GPS_OK)) == 1,
            motion = c.getString(idx(DatabaseHelper.COL_TRAIL_MOTION)) ?: "idle",
            syncStatus = c.getString(idx(DatabaseHelper.COL_TRAIL_SYNC_STATUS)) ?: "PENDING",
        )
    }

    private fun pruneOldRows(db: android.database.sqlite.SQLiteDatabase) {
        val cutoff = System.currentTimeMillis() - RETENTION_MS
        try {
            db.delete(
                DatabaseHelper.TABLE_GPS_TRAIL,
                "${DatabaseHelper.COL_TRAIL_CAPTURED_AT} < ?",
                arrayOf(cutoff.toString()),
            )
            db.execSQL(
                """
                DELETE FROM ${DatabaseHelper.TABLE_GPS_TRAIL}
                WHERE ${DatabaseHelper.COL_TRAIL_ID} NOT IN (
                    SELECT ${DatabaseHelper.COL_TRAIL_ID} FROM ${DatabaseHelper.TABLE_GPS_TRAIL}
                    ORDER BY ${DatabaseHelper.COL_TRAIL_CAPTURED_AT} DESC
                    LIMIT $MAX_ROWS
                )
                """.trimIndent(),
            )
        } catch (e: Exception) {
            Log.w(TAG, "prune failed", e)
        }
    }

    companion object {
        private const val TAG = "GpsTrailDao"
        const val MAX_ROWS = 200_000
        const val RETENTION_MS = 90L * 24 * 60 * 60 * 1000
    }
}
