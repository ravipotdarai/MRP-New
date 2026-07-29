package com.mrp.domain.usecase

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.mrp.data.local.GeofenceStorage
import com.mrp.presentation.receiver.GeofenceTransitionReceiver

/**
 * Registers Hub zones with Play Services Geofencing so ENTER/EXIT fire
 * without continuous fused location updates.
 */
object NativeGeofenceRegistrar {

    private const val TAG = "NativeGeofence"
    private const val REQ_CODE = 7741

    fun sync(context: Context) {
        val app = context.applicationContext
        if (!hasFineLocation(app)) {
            Log.w(TAG, "skip sync — no fine location permission")
            return
        }
        val client = LocationServices.getGeofencingClient(app)
        val pi = pendingIntent(app)
        // Clear previous, then re-add enabled zones
        client.removeGeofences(pi).addOnCompleteListener {
            val zones = GeofenceStorage.list(app).filter { it.enabled }
            if (zones.isEmpty()) {
                Log.i(TAG, "no enabled zones")
                return@addOnCompleteListener
            }
            val geofences = zones.map { z ->
                Geofence.Builder()
                    .setRequestId(z.id)
                    .setCircularRegion(z.latitude, z.longitude, z.radiusMeters.coerceIn(50f, 5000f))
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(
                        Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT
                    )
                    .setNotificationResponsiveness(5_000)
                    .build()
            }
            val request = GeofencingRequest.Builder()
                .setInitialTrigger(
                    GeofencingRequest.INITIAL_TRIGGER_ENTER or
                        GeofencingRequest.INITIAL_TRIGGER_EXIT
                )
                .addGeofences(geofences)
                .build()
            try {
                if (ActivityCompat.checkSelfPermission(app, Manifest.permission.ACCESS_FINE_LOCATION)
                    != PackageManager.PERMISSION_GRANTED
                ) {
                    return@addOnCompleteListener
                }
                client.addGeofences(request, pi)
                    .addOnSuccessListener { Log.i(TAG, "registered ${geofences.size} geofences") }
                    .addOnFailureListener { e -> Log.e(TAG, "addGeofences failed", e) }
            } catch (e: SecurityException) {
                Log.e(TAG, "addGeofences security", e)
            }
        }
    }

    fun clear(context: Context) {
        try {
            LocationServices.getGeofencingClient(context.applicationContext)
                .removeGeofences(pendingIntent(context.applicationContext))
        } catch (e: Exception) {
            Log.w(TAG, "clear", e)
        }
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, GeofenceTransitionReceiver::class.java).apply {
            action = GeofenceTransitionReceiver.ACTION
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_MUTABLE else 0
        return PendingIntent.getBroadcast(context, REQ_CODE, intent, flags)
    }

    private fun hasFineLocation(context: Context): Boolean =
        ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
}
