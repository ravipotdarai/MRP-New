package com.mrp.presentation.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.GeofenceStorage
import com.mrp.domain.usecase.EventSyncPublisher
import com.mrp.domain.usecase.GeofenceTimeline
import com.mrp.domain.usecase.LocationEngine

/**
 * OS geofence ENTER/EXIT → [LocationEngine] trusted stamp → immutable timeline row.
 * Overlapping OS noise is resolved by the engine's nearest-inside / Away evaluate.
 *
 * Work runs off the main thread via [goAsync] — [LocationEngine.obtain] blocks on GPS
 * latches and must never run inside [onReceive] on the UI thread (ANR).
 */
class GeofenceTransitionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) return
        if (intent.action != ACTION) return

        val event = GeofencingEvent.fromIntent(intent)
        if (event == null) {
            Log.w(TAG, "null GeofencingEvent")
            return
        }
        if (event.hasError()) {
            Log.w(TAG, "geofence error ${event.errorCode}")
            return
        }

        val transition = event.geofenceTransition
        val osEntered = when (transition) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> true
            Geofence.GEOFENCE_TRANSITION_EXIT -> false
            else -> {
                Log.d(TAG, "ignore transition=$transition")
                return
            }
        }

        val triggering = event.triggeringGeofences ?: emptyList()
        if (triggering.isEmpty()) return

        val app = context.applicationContext
        val zones = GeofenceStorage.list(app).associateBy { it.id }
        val primaryId = triggering.first().requestId
        val primaryName = zones[primaryId]?.name ?: primaryId

        val pending = goAsync()
        Thread({
            try {
                handleTransition(app, osEntered, primaryId, primaryName)
            } catch (e: Exception) {
                Log.e(TAG, "geofence transition failed", e)
            } finally {
                pending.finish()
            }
        }, "GeofenceTransition").start()
    }

    private fun handleTransition(
        context: Context,
        osEntered: Boolean,
        primaryId: String,
        primaryName: String
    ) {
        val prevInside = DeviceTrackingPrefs.lastGeofenceInside(context)
        val prevId = DeviceTrackingPrefs.lastGeofenceId(context)
        if (osEntered && prevInside == true && prevId == primaryId) {
            Log.d(TAG, "skip duplicate ENTER $primaryName (already inside)")
            return
        }
        if (!osEntered && prevInside != true) {
            Log.d(TAG, "skip duplicate EXIT $primaryName (already away)")
            return
        }

        val result = LocationEngine.onOsGeofenceTransition(
            context = context,
            entered = osEntered,
            fenceId = primaryId,
            zoneName = primaryName
        )
        val stamp = result.stamp

        // Prefer engine-chosen zone (nearest inside) over raw OS fence id when TRUSTED.
        val entered = stamp.insideFence
        val zoneName = stamp.zoneName ?: primaryName
        val fenceId = stamp.fenceId ?: primaryId
        val dist = when {
            stamp.insideFence && stamp.distanceToCenterM != null ->
                stamp.distanceToCenterM.toFloat()
            !stamp.insideFence && stamp.awayM != null ->
                stamp.awayM.toFloat()
            else -> Float.NaN
        }

        GeofenceTimeline.emitTransition(
            context = context,
            entered = entered,
            zoneName = zoneName,
            fenceId = fenceId,
            distanceM = dist,
            lat = if (stamp.hasCoords) stamp.latitude else 0.0,
            lng = if (stamp.hasCoords) stamp.longitude else 0.0,
            accuracy = if (stamp.hasCoords) stamp.accuracyM else 0f,
            addressParts = null,
            badgeInside = stamp.insideFence,
            badgeFenceId = stamp.fenceId,
            badgeZoneName = stamp.zoneName,
            addressOverride = stamp.address,
            locationDeferred = stamp.locationDeferred,
            geoStrategy = stamp.strategy
        )

        if (DeviceTrackingPrefs.syncGeofenceChanges(context) &&
            !DeviceTrackingPrefs.isEventSyncEnabled(context)
        ) {
            EventSyncPublisher.onGeofenceChanged(
                context,
                stamp.insideFence,
                stamp.fenceId
            )
        }
        Log.i(
            TAG,
            "OS ${if (osEntered) "ENTER" else "EXIT"} $primaryName → " +
                "engine inside=${stamp.insideFence} zone=${stamp.zoneName} " +
                "deferred=${stamp.locationDeferred} strategy=${stamp.strategy}"
        )
    }

    companion object {
        const val ACTION = "com.mrp.GEOFENCE_TRANSITION"
        private const val TAG = "GeofenceTransitionRx"
    }
}
