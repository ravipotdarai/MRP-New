package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.mrp.data.local.DeviceTrackingPrefs
import com.mrp.domain.model.TimelineEntry

/**
 * Privacy MVP: enqueue Drive sync for events — never Firebase payloads.
 * Selfies ride along in Drive vault for Premium+ when config allows.
 */
object EventSyncPublisher {

    private const val TAG = "EventSync"

    fun publishAsync(context: Context, entry: TimelineEntry, @Suppress("UNUSED_PARAMETER") addressParts: AddressParts?) {
        if (!DeviceTrackingPrefs.isEventSyncEnabled(context)) return
        Log.d(TAG, "queue Drive sync for event ${entry.eventType} (no Firebase payload)")
        // addressParts already on timeline entry / live store — Drive backup includes them
        DriveVaultSync.requestSyncAsync(context, "event:${entry.eventType}")
    }

    fun onGeofenceChanged(context: Context, inside: Boolean, fenceId: String?) {
        if (!DeviceTrackingPrefs.syncGeofenceChanges(context)) return
        DeviceTrackingPrefs.rememberGeofence(context, inside, fenceId)
        DriveVaultSync.requestSyncAsync(
            context,
            if (inside) "geofence:enter" else "geofence:exit"
        )
    }
}
