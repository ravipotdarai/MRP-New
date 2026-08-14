package com.mrp.domain.usecase

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.TrustedSnapshotStore
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Drive live/heartbeat. Active interval follows Hub [DeviceTrackingPrefs.syncFrequencyMinutes].
 * Idle: no GPS; skip Drive if fence/coords unchanged.
 */
object DriveLocationHeartbeat {

    private const val TAG = "DriveLocHeartbeat"
    /** Fallback when prefs unavailable (tests / logs). */
    const val INTERVAL_MS = 10 * 60_000L

    private val running = AtomicBoolean(false)
    private var handler: Handler? = null
    private var runnable: Runnable? = null
    private val worker = Executors.newSingleThreadExecutor { r ->
        Thread(r, "DriveLocHeartbeat").apply { isDaemon = true }
    }

    fun start(context: Context) {
        val app = context.applicationContext
        if (running.get()) {
            stop()
        }
        if (!running.compareAndSet(false, true)) {
            return
        }
        val h = Handler(Looper.getMainLooper())
        handler = h
        val r = object : Runnable {
            override fun run() {
                if (!running.get()) return
                val delay = DevicePowerMode.heartbeatIntervalMs(app)
                worker.execute {
                    try {
                        tick(app)
                    } catch (e: Exception) {
                        Log.w(TAG, "heartbeat", e)
                    }
                }
                h.postDelayed(this, delay)
            }
        }
        runnable = r
        val first = DevicePowerMode.heartbeatIntervalMs(app)
        h.postDelayed(r, first)
        Log.i(TAG, "Drive heartbeat first delay ${first / 60000} min")
    }

    fun stop() {
        running.set(false)
        runnable?.let { handler?.removeCallbacks(it) }
        runnable = null
        handler = null
    }

    private fun tick(app: Context) {
        if (!DeviceTrackingPrefs.isEventSyncEnabled(app) &&
            !DeviceTrackingPrefs.isEmergencyTracking(app)
        ) {
            return
        }
        val idle = DevicePowerMode.isIdle(app)
        if (!idle) {
            LocationEngine.obtain(app, LocationEngine.Demand.DriveHeartbeat)
            GpsTrailWriter.enqueueStamp(app, GpsTrailWriter.StampReason.HEARTBEAT)
            DriveVaultSync.requestSyncAsync(app, "drive_heartbeat")
            remember(app)
            return
        }
        val snap = TrustedSnapshotStore.read(app)
        val lat = snap?.latitude ?: 0.0
        val lng = snap?.longitude ?: 0.0
        val fence = snap?.fenceId ?: DeviceTrackingPrefs.lastGeofenceId(app)
        if (DeviceTrackingPrefs.heartbeatUnchanged(app, fence, lat, lng)) {
            Log.d(TAG, "idle skip Drive — unchanged")
            return
        }
        GpsTrailWriter.enqueueStamp(app, GpsTrailWriter.StampReason.HEARTBEAT)
        DriveVaultSync.requestSyncAsync(app, "drive_heartbeat")
        DeviceTrackingPrefs.markHeartbeatLocation(app, fence, lat, lng)
    }

    private fun remember(app: Context) {
        val snap = TrustedSnapshotStore.read(app)
        DeviceTrackingPrefs.markHeartbeatLocation(
            app,
            snap?.fenceId ?: DeviceTrackingPrefs.lastGeofenceId(app),
            snap?.latitude ?: 0.0,
            snap?.longitude ?: 0.0,
        )
    }
}
