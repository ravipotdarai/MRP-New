package com.mrp.data.local

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.util.Log
import com.mrp.domain.model.AppUsageSession

class AppUsageDao(private val context: Context) {

    private val dbHelper = DatabaseHelper(context)

    fun insertSession(session: AppUsageSession): Long {
        val db = dbHelper.writableDatabase
        val values = ContentValues().apply {
            put(DatabaseHelper.COL_USAGE_USER_ID, session.userId)
            put(DatabaseHelper.COL_USAGE_DEVICE_ID, session.deviceId)
            put(DatabaseHelper.COL_USAGE_PACKAGE, session.packageName)
            put(DatabaseHelper.COL_USAGE_APP_NAME, session.appName)
            put(DatabaseHelper.COL_USAGE_CATEGORY, session.category)
            put(DatabaseHelper.COL_USAGE_START, session.startTime)
            put(DatabaseHelper.COL_USAGE_END, session.endTime)
            put(DatabaseHelper.COL_USAGE_DURATION, session.durationSeconds)
            put(DatabaseHelper.COL_USAGE_LAT, session.latitude)
            put(DatabaseHelper.COL_USAGE_LON, session.longitude)
            put(DatabaseHelper.COL_USAGE_BATTERY, session.batteryLevel)
            put(DatabaseHelper.COL_USAGE_NETWORK, session.networkType)
            put(DatabaseHelper.COL_USAGE_CREATED_AT, session.createdAt)
        }
        val id = db.insert(DatabaseHelper.TABLE_APP_USAGE, null, values)
        db.close()
        return id
    }

    fun getAllSessions(): List<AppUsageSession> {
        val sessions = mutableListOf<AppUsageSession>()
        val db = dbHelper.readableDatabase
        val cursor: Cursor = db.query(
            DatabaseHelper.TABLE_APP_USAGE,
            null, null, null, null, null,
            "${DatabaseHelper.COL_USAGE_START} DESC",
            "5000" // Limit
        )

        try {
            if (cursor.moveToFirst()) {
                do {
                    sessions.add(cursorToSession(cursor))
                } while (cursor.moveToNext())
            }
        } catch (e: Exception) {
            Log.e("AppUsageDao", "Error reading sessions", e)
        } finally {
            cursor.close()
            db.close()
        }
        return sessions
    }

    private fun cursorToSession(cursor: Cursor): AppUsageSession {
        val idIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_ID)
        val userIdIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_USER_ID)
        val deviceIdIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_DEVICE_ID)
        val pkgIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_PACKAGE)
        val nameIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_APP_NAME)
        val catIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_CATEGORY)
        val startIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_START)
        val endIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_END)
        val durIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_DURATION)
        val latIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_LAT)
        val lonIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_LON)
        val batIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_BATTERY)
        val netIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_NETWORK)
        val createdIdx = cursor.getColumnIndex(DatabaseHelper.COL_USAGE_CREATED_AT)

        return AppUsageSession(
            id = if (idIdx >= 0) cursor.getLong(idIdx) else 0,
            userId = if (userIdIdx >= 0) cursor.getString(userIdIdx) else null,
            deviceId = if (deviceIdIdx >= 0) cursor.getString(deviceIdIdx) else null,
            packageName = if (pkgIdx >= 0) cursor.getString(pkgIdx) else "",
            appName = if (nameIdx >= 0) cursor.getString(nameIdx) else null,
            category = if (catIdx >= 0) cursor.getString(catIdx) else null,
            startTime = if (startIdx >= 0) cursor.getLong(startIdx) else 0,
            endTime = if (endIdx >= 0) cursor.getLong(endIdx) else 0,
            durationSeconds = if (durIdx >= 0) cursor.getLong(durIdx) else 0,
            latitude = if (latIdx >= 0 && !cursor.isNull(latIdx)) cursor.getDouble(latIdx) else null,
            longitude = if (lonIdx >= 0 && !cursor.isNull(lonIdx)) cursor.getDouble(lonIdx) else null,
            batteryLevel = if (batIdx >= 0 && !cursor.isNull(batIdx)) cursor.getInt(batIdx) else null,
            networkType = if (netIdx >= 0) cursor.getString(netIdx) else null,
            createdAt = if (createdIdx >= 0) cursor.getLong(createdIdx) else 0
        )
    }
}
