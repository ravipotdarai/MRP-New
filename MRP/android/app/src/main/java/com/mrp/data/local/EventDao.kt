package com.mrp.data.local

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.util.Log
import com.mrp.domain.model.UnifiedEvent
import org.json.JSONObject

class EventDao(private val context: Context) {

    private val dbHelper = DatabaseHelper(context)

    fun insertEvent(event: UnifiedEvent): Long {
        val db = dbHelper.writableDatabase
        val values = ContentValues().apply {
            put(DatabaseHelper.COL_USER_ID, event.userId)
            put(DatabaseHelper.COL_DEVICE_ID, event.deviceId)
            put(DatabaseHelper.COL_EVENT_TYPE, event.eventType)
            put(DatabaseHelper.COL_EVENT_TIME, event.eventTime)
            put(DatabaseHelper.COL_LATITUDE, event.latitude)
            put(DatabaseHelper.COL_LONGITUDE, event.longitude)
            put(DatabaseHelper.COL_ACCURACY, event.accuracy)
            put(DatabaseHelper.COL_ADDRESS, event.address)
            put(DatabaseHelper.COL_INSIDE_GEOFENCE, if (event.insideGeofence) 1 else 0)
            put(DatabaseHelper.COL_GEOFENCE_ID, event.geofenceId)
            put(DatabaseHelper.COL_REFERENCE_ID, event.referenceId)
            put(DatabaseHelper.COL_JSON_DATA, event.jsonData)
            put(DatabaseHelper.COL_SYNC_STATUS, event.syncStatus)
        }
        val id = db.insert(DatabaseHelper.TABLE_EVENTS, null, values)
        db.close()
        return id
    }

    fun getAllEvents(): List<UnifiedEvent> {
        val events = mutableListOf<UnifiedEvent>()
        val db = dbHelper.readableDatabase
        val cursor: Cursor = db.query(
            DatabaseHelper.TABLE_EVENTS,
            null, null, null, null, null,
            "${DatabaseHelper.COL_EVENT_TIME} DESC",
            "1000" // Limit to last 1000 for performance
        )

        try {
            if (cursor.moveToFirst()) {
                do {
                    events.add(cursorToUnifiedEvent(cursor))
                } while (cursor.moveToNext())
            }
        } catch (e: Exception) {
            Log.e("EventDao", "Error reading events", e)
        } finally {
            cursor.close()
            db.close()
        }
        return events
    }

    fun getLastKnownLocation(): Pair<Double, Double>? {
        val db = dbHelper.readableDatabase
        val cursor = db.query(
            DatabaseHelper.TABLE_EVENTS,
            arrayOf(DatabaseHelper.COL_LATITUDE, DatabaseHelper.COL_LONGITUDE),
            "${DatabaseHelper.COL_LATITUDE} IS NOT NULL AND ${DatabaseHelper.COL_LONGITUDE} IS NOT NULL",
            null, null, null,
            "${DatabaseHelper.COL_EVENT_TIME} DESC",
            "1"
        )
        try {
            if (cursor.moveToFirst()) {
                val latIdx = cursor.getColumnIndex(DatabaseHelper.COL_LATITUDE)
                val lngIdx = cursor.getColumnIndex(DatabaseHelper.COL_LONGITUDE)
                if (latIdx >= 0 && lngIdx >= 0) {
                    val lat = cursor.getDouble(latIdx)
                    val lng = cursor.getDouble(lngIdx)
                    if (lat != 0.0 && lng != 0.0) {
                        return Pair(lat, lng)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("EventDao", "Failed to get last known location", e)
        } finally {
            cursor.close()
            db.close()
        }
        return null
    }

    fun clearAllEvents() {
        val db = dbHelper.writableDatabase
        db.delete(DatabaseHelper.TABLE_EVENTS, null, null)
        db.close()
    }

    private fun cursorToUnifiedEvent(cursor: Cursor): UnifiedEvent {
        val idIdx = cursor.getColumnIndex(DatabaseHelper.COL_EVENT_ID)
        val userIdIdx = cursor.getColumnIndex(DatabaseHelper.COL_USER_ID)
        val deviceIdIdx = cursor.getColumnIndex(DatabaseHelper.COL_DEVICE_ID)
        val typeIdx = cursor.getColumnIndex(DatabaseHelper.COL_EVENT_TYPE)
        val timeIdx = cursor.getColumnIndex(DatabaseHelper.COL_EVENT_TIME)
        val latIdx = cursor.getColumnIndex(DatabaseHelper.COL_LATITUDE)
        val lonIdx = cursor.getColumnIndex(DatabaseHelper.COL_LONGITUDE)
        val accIdx = cursor.getColumnIndex(DatabaseHelper.COL_ACCURACY)
        val addrIdx = cursor.getColumnIndex(DatabaseHelper.COL_ADDRESS)
        val inGeoIdx = cursor.getColumnIndex(DatabaseHelper.COL_INSIDE_GEOFENCE)
        val geoIdIdx = cursor.getColumnIndex(DatabaseHelper.COL_GEOFENCE_ID)
        val refIdIdx = cursor.getColumnIndex(DatabaseHelper.COL_REFERENCE_ID)
        val jsonIdx = cursor.getColumnIndex(DatabaseHelper.COL_JSON_DATA)
        val syncIdx = cursor.getColumnIndex(DatabaseHelper.COL_SYNC_STATUS)

        return UnifiedEvent(
            id = if (idIdx >= 0) cursor.getLong(idIdx) else 0,
            userId = if (userIdIdx >= 0) cursor.getString(userIdIdx) else null,
            deviceId = if (deviceIdIdx >= 0) cursor.getString(deviceIdIdx) else null,
            eventType = if (typeIdx >= 0) cursor.getString(typeIdx) else "UNKNOWN",
            eventTime = if (timeIdx >= 0) cursor.getLong(timeIdx) else 0,
            latitude = if (latIdx >= 0 && !cursor.isNull(latIdx)) cursor.getDouble(latIdx) else null,
            longitude = if (lonIdx >= 0 && !cursor.isNull(lonIdx)) cursor.getDouble(lonIdx) else null,
            accuracy = if (accIdx >= 0 && !cursor.isNull(accIdx)) cursor.getFloat(accIdx) else null,
            address = if (addrIdx >= 0) cursor.getString(addrIdx) else null,
            insideGeofence = if (inGeoIdx >= 0) cursor.getInt(inGeoIdx) == 1 else false,
            geofenceId = if (geoIdIdx >= 0) cursor.getString(geoIdIdx) else null,
            referenceId = if (refIdIdx >= 0) cursor.getString(refIdIdx) else null,
            jsonData = if (jsonIdx >= 0) cursor.getString(jsonIdx) else null,
            syncStatus = if (syncIdx >= 0) cursor.getString(syncIdx) ?: "PENDING" else "PENDING"
        )
    }
}
