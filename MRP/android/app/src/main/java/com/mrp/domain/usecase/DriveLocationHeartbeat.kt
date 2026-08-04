package com.mrp.domain.usecase

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.mrp.data.local.DeviceTrackingPrefs
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Every 5 minutes: ensure TrustedSnapshot is fresh enough, then push Drive vault
 * (latest badge + coords + live + timeline). GPS only if snapshot older than
 * [LocationEngine.T_DRIVE_STALE_MS].
 */
object DriveLocationHeartbeat {

    private const val TAG = "DriveLocHeartbeat"
    const val INTERVAL_MS = 5 * 60_000L

    private val running = AtomicBoolean(false)
    private var handler: Handler? = null
    private var runnable: Runnable? = null

    fun start(context: Context) {
        val app = context.applicationContext
        if (!running.compareAndSet(false, true)) return
        val h = Handler(Looper.getMainLooper())
        handler = h
        val r = object : Runnable {
            override fun run() {
                if (!running.get()) return
                try {
                    if (DeviceTrackingPrefs.isEventSyncEnabled(app) ||
                        DeviceTrackingPrefs.isEmergencyTracking(app)
                    ) {
                        LocationEngine.obtain(app, LocationEngine.Demand.DriveHeartbeat)
                        DriveVaultSync.requestSyncAsync(app, "drive_heartbeat")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "heartbeat", e)
                }
                h.postDelayed(this, INTERVAL_MS)
            }
        }
        runnable = r
        h.postDelayed(r, INTERVAL_MS)
        Log.i(TAG, "Drive location heartbeat every ${INTERVAL_MS / 60000} min")
    }

    fun stop() {
        running.set(false)
        runnable?.let { handler?.removeCallbacks(it) }
        runnable = null
        handler = null
    }
}
