package com.mrp.domain.usecase

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.mrp.data.local.DeviceTrackingPrefs
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Idle-only trail breadcrumb (no GPS). Active stamps come from events/heartbeat.
 */
object GpsTrailIdleTicker {

    private const val TAG = "GpsTrailIdleTicker"
    private const val FIRST_DELAY_MS = 90_000L

    private val running = AtomicBoolean(false)
    private var handler: Handler? = null
    private var runnable: Runnable? = null
    private var intervalMs = DevicePowerMode.TRAIL_IDLE_MS
    private val worker = Executors.newSingleThreadExecutor { r ->
        Thread(r, "GpsTrailIdleTicker").apply { isDaemon = true }
    }

    fun start(context: Context, interval: Long = DevicePowerMode.TRAIL_IDLE_MS) {
        val app = context.applicationContext
        if (running.get()) {
            stop()
        }
        intervalMs = interval
        if (!running.compareAndSet(false, true)) return
        val h = Handler(Looper.getMainLooper())
        handler = h
        val r = object : Runnable {
            override fun run() {
                if (!running.get()) return
                worker.execute {
                    try {
                        if (DevicePowerMode.isIdle(app) &&
                            (DeviceTrackingPrefs.isEventSyncEnabled(app) ||
                                DeviceTrackingPrefs.isEmergencyTracking(app) ||
                                DeviceTrackingPrefs.isBackgroundTracking(app))
                        ) {
                            GpsTrailWriter.enqueueStamp(app, GpsTrailWriter.StampReason.IDLE_TICK)
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "tick", e)
                    }
                }
                h.postDelayed(this, intervalMs)
            }
        }
        runnable = r
        h.postDelayed(r, FIRST_DELAY_MS)
        Log.i(TAG, "Idle trail stamp every ${intervalMs / 1000}s")
    }

    fun stop() {
        running.set(false)
        runnable?.let { handler?.removeCallbacks(it) }
        runnable = null
        handler = null
    }
}
