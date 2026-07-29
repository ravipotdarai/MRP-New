package com.mrp.presentation.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.data.local.GeofenceStorage
import com.mrp.domain.usecase.AddressParts
import com.mrp.domain.usecase.EventSyncPublisher
import com.mrp.domain.usecase.GeofenceTimeline
import com.mrp.domain.usecase.LocationHelper

/**
 * OS geofence ENTER/EXIT → dedicated timeline rows with address.
 * Owns global inside prefs; never lets EXIT of zone A wipe Inside zone B.
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
        val entered = when (transition) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> true
            Geofence.GEOFENCE_TRANSITION_EXIT -> false
            else -> {
                Log.d(TAG, "ignore transition=$transition")
                return
            }
        }

        val triggering = event.triggeringGeofences ?: emptyList()
        if (triggering.isEmpty()) return

        val loc = event.triggeringLocation
        val lat = loc?.latitude ?: 0.0
        val lng = loc?.longitude ?: 0.0
        val accuracy = loc?.accuracy ?: 0f

        val helper = LocationHelper(context)
        val parts: AddressParts? =
            if (lat != 0.0 || lng != 0.0) helper.reverseGeocodePartsSync(lat, lng) else null

        val zones = GeofenceStorage.list(context).associateBy { it.id }

        for (gf in triggering) {
            val zone = zones[gf.requestId]
            val name = zone?.name ?: gf.requestId
            val dist = if (zone != null && (lat != 0.0 || lng != 0.0)) {
                val results = FloatArray(1)
                android.location.Location.distanceBetween(
                    lat, lng, zone.latitude, zone.longitude, results
                )
                results[0]
            } else {
                Float.NaN
            }

            val badgeInside: Boolean
            val badgeFenceId: String?
            val badgeZoneName: String?

            if (entered) {
                DeviceTrackingPrefs.rememberGeofence(context, true, gf.requestId)
                badgeInside = true
                badgeFenceId = gf.requestId
                badgeZoneName = name
            } else {
                // EXIT of zone A must not clear "inside" if still inside Home (or another zone).
                val stillInside = helper.findContainingZone(
                    latitude = lat,
                    longitude = lng,
                    excludeId = gf.requestId,
                    allowMissingCoords = true,
                    accuracyPad = maxOf(accuracy, 40f),
                )
                if (stillInside != null) {
                    DeviceTrackingPrefs.rememberGeofence(context, true, stillInside.id)
                    badgeInside = true
                    badgeFenceId = stillInside.id
                    badgeZoneName = stillInside.name
                    Log.i(TAG, "EXIT $name but still inside ${stillInside.name}")
                } else {
                    val prevId = DeviceTrackingPrefs.lastGeofenceId(context)
                    val prevInside = DeviceTrackingPrefs.lastGeofenceInside(context)
                    if (prevInside == true && prevId != null && prevId != gf.requestId && zones.containsKey(prevId)) {
                        DeviceTrackingPrefs.rememberGeofence(context, true, prevId)
                        badgeInside = true
                        badgeFenceId = prevId
                        badgeZoneName = zones[prevId]?.name
                        Log.i(TAG, "EXIT $name; kept inside ${zones[prevId]?.name ?: prevId}")
                    } else {
                        DeviceTrackingPrefs.rememberGeofence(context, false, gf.requestId)
                        badgeInside = false
                        badgeFenceId = gf.requestId
                        badgeZoneName = name
                    }
                }
            }

            GeofenceTimeline.emitTransition(
                context = context,
                entered = entered,
                zoneName = name,
                fenceId = gf.requestId,
                distanceM = dist,
                lat = lat,
                lng = lng,
                accuracy = accuracy,
                addressParts = parts,
                badgeInside = badgeInside,
                badgeFenceId = badgeFenceId,
                badgeZoneName = badgeZoneName
            )
            if (DeviceTrackingPrefs.syncGeofenceChanges(context)) {
                val insideNow = DeviceTrackingPrefs.lastGeofenceInside(context) == true
                val idNow = DeviceTrackingPrefs.lastGeofenceId(context)
                EventSyncPublisher.onGeofenceChanged(context, insideNow, idNow)
            }
            Log.i(TAG, "${if (entered) "ENTER" else "EXIT"} $name badge=$badgeZoneName inside=$badgeInside")
        }
    }

    companion object {
        const val ACTION = "com.mrp.GEOFENCE_TRANSITION"
        private const val TAG = "GeofenceTransitionRx"
    }
}
