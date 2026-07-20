package com.mrp.data.local

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class DatabaseHelper(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        private const val DATABASE_NAME = "mrp_telemetry.db"
        private const val DATABASE_VERSION = 2

        // Table: events
        const val TABLE_EVENTS = "events"
        const val COL_EVENT_ID = "Id"
        const val COL_USER_ID = "UserId"
        const val COL_DEVICE_ID = "DeviceId"
        const val COL_EVENT_TYPE = "EventType"
        const val COL_EVENT_TIME = "EventTime"
        const val COL_LATITUDE = "Latitude"
        const val COL_LONGITUDE = "Longitude"
        const val COL_ACCURACY = "Accuracy"
        const val COL_ADDRESS = "Address"
        const val COL_INSIDE_GEOFENCE = "InsideGeofence"
        const val COL_GEOFENCE_ID = "GeofenceId"
        const val COL_REFERENCE_ID = "ReferenceId"
        const val COL_JSON_DATA = "JsonData"
        const val COL_SYNC_STATUS = "SyncStatus"

        // Table: app_usage
        const val TABLE_APP_USAGE = "app_usage"
        const val COL_USAGE_ID = "Id"
        const val COL_USAGE_USER_ID = "UserId"
        const val COL_USAGE_DEVICE_ID = "DeviceId"
        const val COL_USAGE_PACKAGE = "PackageName"
        const val COL_USAGE_APP_NAME = "AppName"
        const val COL_USAGE_CATEGORY = "Category"
        const val COL_USAGE_START = "StartTime"
        const val COL_USAGE_END = "EndTime"
        const val COL_USAGE_DURATION = "Duration"
        const val COL_USAGE_LAT = "Latitude"
        const val COL_USAGE_LON = "Longitude"
        const val COL_USAGE_BATTERY = "Battery"
        const val COL_USAGE_NETWORK = "Network"
        const val COL_USAGE_CREATED_AT = "CreatedAt"

        // Table: applications
        const val TABLE_APPLICATIONS = "applications"
        const val COL_APP_ID = "Id"
        const val COL_APP_PACKAGE = "PackageName"
        const val COL_APP_NAME = "AppName"
        const val COL_APP_CATEGORY = "Category"
        const val COL_APP_ICON = "Icon"
        const val COL_APP_IS_SYSTEM = "SystemApp"
        const val COL_APP_INSTALLED = "Installed"
        const val COL_APP_VERSION = "Version"
        const val COL_APP_UPDATED = "LastUpdated"

        // Table: geo_snapshots (lost-device tracking — async side channel)
        const val TABLE_GEO_SNAPSHOTS = "geo_snapshots"
        const val COL_GEO_ID = "Id"
        const val COL_GEO_DEVICE_ID = "DeviceId"
        const val COL_GEO_CAPTURED_AT = "CapturedAtMs"
        const val COL_GEO_LATITUDE = "Latitude"
        const val COL_GEO_LONGITUDE = "Longitude"
        const val COL_GEO_ACCURACY = "AccuracyM"
        const val COL_GEO_ALTITUDE = "AltitudeM"
        const val COL_GEO_PROVIDER = "Provider"
        const val COL_GEO_TIER = "LocationTier"
        const val COL_GEO_ADDRESS = "DetailedAddress"
        const val COL_GEO_INSIDE_FENCE = "InsideGeofence"
        const val COL_GEO_FENCE_ID = "GeofenceId"
        const val COL_GEO_TRIGGER = "TriggerSource"
        const val COL_GEO_REF_ID = "TriggerReferenceId"
        const val COL_GEO_BATTERY = "BatteryPct"
        const val COL_GEO_NETWORK = "NetworkType"
        const val COL_GEO_SYNC_STATUS = "SyncStatus"
        const val COL_GEO_JSON_META = "JsonMeta"
    }

    override fun onCreate(db: SQLiteDatabase) {
        val createEventsTable = """
            CREATE TABLE $TABLE_EVENTS (
                $COL_EVENT_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COL_USER_ID TEXT,
                $COL_DEVICE_ID TEXT,
                $COL_EVENT_TYPE TEXT NOT NULL,
                $COL_EVENT_TIME INTEGER NOT NULL,
                $COL_LATITUDE REAL,
                $COL_LONGITUDE REAL,
                $COL_ACCURACY REAL,
                $COL_ADDRESS TEXT,
                $COL_INSIDE_GEOFENCE INTEGER DEFAULT 0,
                $COL_GEOFENCE_ID TEXT,
                $COL_REFERENCE_ID TEXT,
                $COL_JSON_DATA TEXT,
                $COL_SYNC_STATUS TEXT DEFAULT 'PENDING'
            )
        """.trimIndent()

        val createAppUsageTable = """
            CREATE TABLE $TABLE_APP_USAGE (
                $COL_USAGE_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COL_USAGE_USER_ID TEXT,
                $COL_USAGE_DEVICE_ID TEXT,
                $COL_USAGE_PACKAGE TEXT NOT NULL,
                $COL_USAGE_APP_NAME TEXT,
                $COL_USAGE_CATEGORY TEXT,
                $COL_USAGE_START INTEGER NOT NULL,
                $COL_USAGE_END INTEGER NOT NULL,
                $COL_USAGE_DURATION INTEGER NOT NULL,
                $COL_USAGE_LAT REAL,
                $COL_USAGE_LON REAL,
                $COL_USAGE_BATTERY INTEGER,
                $COL_USAGE_NETWORK TEXT,
                $COL_USAGE_CREATED_AT INTEGER NOT NULL
            )
        """.trimIndent()

        val createApplicationsTable = """
            CREATE TABLE $TABLE_APPLICATIONS (
                $COL_APP_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COL_APP_PACKAGE TEXT UNIQUE NOT NULL,
                $COL_APP_NAME TEXT NOT NULL,
                $COL_APP_CATEGORY TEXT,
                $COL_APP_ICON TEXT,
                $COL_APP_IS_SYSTEM INTEGER DEFAULT 0,
                $COL_APP_INSTALLED INTEGER DEFAULT 1,
                $COL_APP_VERSION TEXT,
                $COL_APP_UPDATED INTEGER
            )
        """.trimIndent()

        db.execSQL(createEventsTable)
        db.execSQL(createAppUsageTable)
        db.execSQL(createApplicationsTable)
        db.execSQL(createGeoSnapshotsTable())
    }

    private fun createGeoSnapshotsTable(): String = """
            CREATE TABLE $TABLE_GEO_SNAPSHOTS (
                $COL_GEO_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COL_GEO_DEVICE_ID TEXT,
                $COL_GEO_CAPTURED_AT INTEGER NOT NULL,
                $COL_GEO_LATITUDE REAL NOT NULL,
                $COL_GEO_LONGITUDE REAL NOT NULL,
                $COL_GEO_ACCURACY REAL,
                $COL_GEO_ALTITUDE REAL,
                $COL_GEO_PROVIDER TEXT,
                $COL_GEO_TIER TEXT,
                $COL_GEO_ADDRESS TEXT,
                $COL_GEO_INSIDE_FENCE INTEGER DEFAULT 0,
                $COL_GEO_FENCE_ID TEXT,
                $COL_GEO_TRIGGER TEXT NOT NULL,
                $COL_GEO_REF_ID TEXT,
                $COL_GEO_BATTERY INTEGER,
                $COL_GEO_NETWORK TEXT,
                $COL_GEO_SYNC_STATUS TEXT DEFAULT 'PENDING',
                $COL_GEO_JSON_META TEXT
            )
        """.trimIndent()

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            db.execSQL(createGeoSnapshotsTable())
        }
    }
}
