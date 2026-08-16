package com.mrp.domain.usecase

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.presentation.receiver.ActivityTransitionReceiver
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Idle = screen off AND Activity Recognition STILL (permission granted).
 * Denied recognition → always active (do not pretend idle).
 */
object DevicePowerMode {

    const val ACTIVITY_STILL = "STILL"
    const val ACTIVITY_MOVING = "MOVING"
    const val ACTIVITY_UNKNOWN = "UNKNOWN"

    /** After this with no AR callback and permission granted, assume STILL. */
    const val STILL_DEFAULT_MS = 3 * 60_000L

    const val GEOFENCE_IDLE_MS = 10 * 60_000
    const val GEOFENCE_ACTIVE_MS = 45_000
    const val HEARTBEAT_IDLE_MS = 20 * 60_000L
    const val TRAIL_IDLE_MS = 12 * 60_000L

    private const val TAG = "DevicePowerMode"
    private const val PI_CODE = 7742
    private val started = AtomicBoolean(false)

    fun evaluate(
        screenOn: Boolean,
        activity: String,
        emergency: Boolean,
        recognitionGranted: Boolean,
        stillDefaultElapsed: Boolean,
    ): Boolean {
        if (emergency) return false
        if (!recognitionGranted) return false
        val still = activity == ACTIVITY_STILL ||
            (activity == ACTIVITY_UNKNOWN && stillDefaultElapsed)
        return !screenOn && still
    }

    fun isIdle(context: Context): Boolean {
        val app = context.applicationContext
        if (DeviceTrackingPrefs.isEmergencyTracking(app)) return false
        val granted = hasActivityRecognition(app)
        if (!granted) return false
        val screenOn = isScreenOn(app)
        val activity = DeviceTrackingPrefs.lastActivityType(app)
        val lastMs = DeviceTrackingPrefs.lastActivityElapsedMs(app)
        val now = SystemClock.elapsedRealtime()
        val stillDefault = lastMs <= 0L || now - lastMs >= STILL_DEFAULT_MS
        return evaluate(screenOn, activity, false, true, stillDefault)
    }

    fun isActive(context: Context): Boolean = !isIdle(context)

    fun geofenceResponsivenessMs(context: Context): Int =
        if (isIdle(context)) GEOFENCE_IDLE_MS else GEOFENCE_ACTIVE_MS

    fun heartbeatIntervalMs(context: Context): Long {
        if (isIdle(context)) return HEARTBEAT_IDLE_MS
        return DeviceTrackingPrefs.syncFrequencyMinutes(context) * 60_000L
    }

    fun start(context: Context) {
        val app = context.applicationContext
        started.set(true)
        requestTransitions(app)
        applyLoops(app)
    }

    fun stop(context: Context) {
        started.set(false)
        removeTransitions(context.applicationContext)
        DriveLocationHeartbeat.stop()
        GpsTrailIdleTicker.stop()
    }

    fun onScreenChanged(context: Context, screenOn: Boolean) {
        DeviceTrackingPrefs.setScreenInteractive(context, screenOn)
        applyLoops(context.applicationContext)
    }

    fun onActivity(context: Context, moving: Boolean) {
        val type = if (moving) ACTIVITY_MOVING else ACTIVITY_STILL
        DeviceTrackingPrefs.setLastActivity(context, type)
        applyLoops(context.applicationContext)
    }

    fun applyLoops(context: Context) {
        val app = context.applicationContext
        val idle = isIdle(app)
        val prevIdle = DeviceTrackingPrefs.lastAppliedIdle(app)
        val wantBeat = DeviceTrackingPrefs.isEventSyncEnabled(app) ||
            DeviceTrackingPrefs.isEmergencyTracking(app)
        if (wantBeat) {
            DriveLocationHeartbeat.start(app)
        } else {
            DriveLocationHeartbeat.stop()
        }
        if (idle && wantBeat) {
            GpsTrailIdleTicker.start(app, TRAIL_IDLE_MS)
        } else {
            GpsTrailIdleTicker.stop()
        }
        if (prevIdle == null || prevIdle != idle) {
            NativeGeofenceRegistrar.sync(app, fireInitialTrigger = false)
            DeviceTrackingPrefs.setLastAppliedIdle(app, idle)
            Log.i(TAG, "mode idle=$idle geofenceMs=${geofenceResponsivenessMs(app)}")
        }
    }

    fun hasActivityRecognition(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < 29) return true
        return ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.ACTIVITY_RECOGNITION
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun isScreenOn(context: Context): Boolean {
        val stored = DeviceTrackingPrefs.screenInteractive(context)
        if (stored != null) return stored
        return try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            pm.isInteractive
        } catch (_: Exception) {
            true
        }
    }

    private fun requestTransitions(context: Context) {
        if (!hasActivityRecognition(context)) {
            Log.i(TAG, "ACTIVITY_RECOGNITION denied — stay active")
            return
        }
        try {
            val transitions = listOf(
                DetectedActivity.STILL,
                DetectedActivity.WALKING,
                DetectedActivity.ON_FOOT,
                DetectedActivity.RUNNING,
                DetectedActivity.IN_VEHICLE,
                DetectedActivity.ON_BICYCLE,
            ).flatMap { type ->
                listOf(
                    ActivityTransition.Builder()
                        .setActivityType(type)
                        .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
                        .build(),
                    ActivityTransition.Builder()
                        .setActivityType(type)
                        .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
                        .build(),
                )
            }
            val req = ActivityTransitionRequest(transitions)
            ActivityRecognition.getClient(context)
                .requestActivityTransitionUpdates(req, pendingIntent(context))
                .addOnSuccessListener { Log.i(TAG, "activity transitions registered") }
                .addOnFailureListener { e -> Log.w(TAG, "activity transitions failed", e) }
        } catch (e: SecurityException) {
            Log.w(TAG, "activity transitions security", e)
        } catch (e: Exception) {
            Log.w(TAG, "activity transitions", e)
        }
    }

    private fun removeTransitions(context: Context) {
        try {
            ActivityRecognition.getClient(context)
                .removeActivityTransitionUpdates(pendingIntent(context))
        } catch (e: Exception) {
            Log.w(TAG, "remove transitions", e)
        }
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, ActivityTransitionReceiver::class.java).apply {
            action = ActivityTransitionReceiver.ACTION
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_MUTABLE else 0
        return PendingIntent.getBroadcast(context, PI_CODE, intent, flags)
    }
}
