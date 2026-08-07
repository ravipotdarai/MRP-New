package com.mrp.domain.usecase

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.mrp.data.local.DeviceTrackingPrefs
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Once per minute: stamp last trusted location into [GpsTrailWriter] without waking GPS.
 * Keeps idle / same-place breadcrumbs so day packs are never empty when the phone is on.
 */
object GpsTrailIdleTicker {

    private const val TAG = "GpsTrailIdleTicker"

    private val running = AtomicBoolean(false)
    private var handler: Handler? = null
    private var runnable: Runnable? = null
    private val worker = Executors.newSingleThreadExecutor { r ->
        Thread(r, "GpsTrailIdleTicker").apply { isDaemon = true }
    }

    fun start(context: Context) {
        val app = context.applicationContext
        if (!running.compareAndSet(false, true)) return
        val h = Handler(Looper.getMainLooper())
        handler = h
        val r = object : Runnable {
            override fun run() {
                if (!running.get()) return
                worker.execute {
                    try {
                        if (DeviceTrackingPrefs.isEventSyncEnabled(app) ||
                            DeviceTrackingPrefs.isEmergencyTracking(app) ||
                            DeviceTrackingPrefs.isBackgroundTracking(app)
                        ) {
                            GpsTrailWriter.enqueueStamp(app, GpsTrailWriter.StampReason.IDLE_TICK)
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "tick", e)
                    }
                }
                h.postDelayed(this, GpsTrailWriter.IDLE_TICK_MS)
            }
        }
        runnable = r
        h.postDelayed(r, GpsTrailWriter.IDLE_TICK_MS)
        Log.i(TAG, "Idle trail stamp every ${GpsTrailWriter.IDLE_TICK_MS / 1000}s")
    }

    fun stop() {
        running.set(false)
        runnable?.let { handler?.removeCallbacks(it) }
        runnable = null
        handler = null
    }
}
