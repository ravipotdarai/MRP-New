package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.mrp.data.local.GpsTrailDao
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Builds encrypted GPS day packs for Drive appData:
 * - mrp_gps_{YYYY-MM-DD}_index.enc
 * - mrp_gps_{YYYY-MM-DD}_{HH}.enc
 *
 * Same PIN crypto as vault ([VaultBackupCrypto]).
 */
object GpsDayPackWriter {

    private const val TAG = "GpsDayPackWriter"
    private const val PACK_VERSION = 1

    fun uploadDirtyDays(context: Context, pin: String, accessToken: String): Int {
        val dao = GpsTrailDao(context.applicationContext)
        val days = dao.pendingDayKeys()
        if (days.isEmpty()) return 0
        val client = DriveAppDataClient(accessToken)
        var uploaded = 0
        for (day in days) {
            try {
                if (uploadDay(dao, client, pin, day)) {
                    dao.markDaySynced(day)
                    uploaded++
                }
            } catch (e: Exception) {
                Log.w(TAG, "upload day $day failed", e)
            }
        }
        if (uploaded > 0) {
            Log.i(TAG, "GPS day packs uploaded=$uploaded of ${days.size}")
        }
        return uploaded
    }

    private fun uploadDay(
        dao: GpsTrailDao,
        client: DriveAppDataClient,
        pin: String,
        dayKey: String,
    ): Boolean {
        val points = dao.pointsForLocalDay(dayKey)
        if (points.isEmpty()) return false

        val byHour = points.groupBy { hourOf(it.capturedAtMs) }
        val hours = byHour.keys.sorted()

        for (hour in hours) {
            val hourPts = byHour[hour] ?: continue
            val chunk = JSONObject()
                .put("version", PACK_VERSION)
                .put("date", dayKey)
                .put("hour", hour)
                .put("points", pointsToJson(hourPts))
            val name = hourFileName(dayKey, hour)
            val existing = client.listAppDataFiles(name).maxByOrNull { it.modifiedTime ?: "" }
            val bytes = VaultBackupCrypto.encryptUtf8(chunk.toString(), pin)
            client.uploadOrReplace(name, bytes, existing?.id)
        }

        val index = buildIndex(dayKey, points, hours)
        val indexName = indexFileName(dayKey)
        val existingIndex = client.listAppDataFiles(indexName).maxByOrNull { it.modifiedTime ?: "" }
        val indexBytes = VaultBackupCrypto.encryptUtf8(index.toString(), pin)
        client.uploadOrReplace(indexName, indexBytes, existingIndex?.id)
        return true
    }

    private fun buildIndex(
        dayKey: String,
        points: List<GpsTrailDao.TrailPoint>,
        hours: List<Int>,
    ): JSONObject {
        var minLat = Double.POSITIVE_INFINITY
        var maxLat = Double.NEGATIVE_INFINITY
        var minLng = Double.POSITIVE_INFINITY
        var maxLng = Double.NEGATIVE_INFINITY
        var distanceM = 0.0
        var movingMs = 0L
        var idleMs = 0L
        var maxSpeed = 0f
        var speedSum = 0.0
        var stopCount = 0
        var geofenceVisitCount = 0
        var prev: GpsTrailDao.TrailPoint? = null
        var idleStreak = false

        for (p in points) {
            minLat = minOf(minLat, p.latitude)
            maxLat = maxOf(maxLat, p.latitude)
            minLng = minOf(minLng, p.longitude)
            maxLng = maxOf(maxLng, p.longitude)
            maxSpeed = maxOf(maxSpeed, p.speedMps)
            speedSum += p.speedMps
            if (p.motion == "idle") {
                if (!idleStreak) {
                    stopCount++
                    idleStreak = true
                }
            } else {
                idleStreak = false
            }
            prev?.let { last ->
                val dt = (p.capturedAtMs - last.capturedAtMs).coerceAtLeast(0L)
                distanceM += haversineM(last.latitude, last.longitude, p.latitude, p.longitude)
                if (p.motion == "idle") idleMs += dt else movingMs += dt
            }
            prev = p
        }

        val journeyStart = points.first().capturedAtMs
        val journeyEnd = points.last().capturedAtMs
        val avgSpeed = if (points.isNotEmpty()) speedSum / points.size else 0.0
        val checksum = "${points.size}:$journeyStart:$journeyEnd:${"%.1f".format(Locale.US, distanceM)}"

        return JSONObject()
            .put("version", PACK_VERSION)
            .put("date", dayKey)
            .put("journeyStart", journeyStart)
            .put("journeyEnd", journeyEnd)
            .put("hours", JSONArray(hours))
            .put(
                "bbox",
                JSONArray()
                    .put(minLng)
                    .put(minLat)
                    .put(maxLng)
                    .put(maxLat),
            )
            .put("distanceM", distanceM)
            .put("movingMs", movingMs)
            .put("idleMs", idleMs)
            .put("maxSpeed", maxSpeed.toDouble())
            .put("avgSpeed", avgSpeed)
            .put("stopCount", stopCount)
            .put("geofenceVisitCount", geofenceVisitCount)
            .put("mediaCount", 0)
            .put("pointCount", points.size)
            .put("checksum", checksum)
    }

    private fun pointsToJson(points: List<GpsTrailDao.TrailPoint>): JSONArray {
        val arr = JSONArray()
        for (p in points) {
            arr.put(
                JSONObject()
                    .put("t", p.capturedAtMs)
                    .put("lat", p.latitude)
                    .put("lng", p.longitude)
                    .put("s", p.speedMps.toDouble())
                    .put("h", p.headingDeg.toDouble())
                    .put("a", p.accuracyM.toDouble())
                    .put("alt", p.altitudeM)
                    .put("b", p.batteryPct)
                    .put("n", p.networkType)
                    .put("g", p.gpsOk)
                    .put("m", p.motion),
            )
        }
        return arr
    }

    private fun hourOf(ms: Long): Int {
        val cal = Calendar.getInstance(TimeZone.getDefault())
        cal.timeInMillis = ms
        return cal.get(Calendar.HOUR_OF_DAY)
    }

    private fun haversineM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6_371_000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
            sin(dLng / 2) * sin(dLng / 2)
        return 2 * r * atan2(sqrt(a), sqrt(1 - a))
    }

    fun indexFileName(dayKey: String): String = "mrp_gps_${dayKey}_index.enc"

    fun hourFileName(dayKey: String, hour: Int): String =
        "mrp_gps_${dayKey}_${hour.toString().padStart(2, '0')}.enc"

    const val GPS_NAME_PREFIX = "mrp_gps_"
}
