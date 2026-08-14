package com.mrp.presentation.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity
import com.mrp.domain.usecase.DevicePowerMode

class ActivityTransitionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) return
        if (!ActivityTransitionResult.hasResult(intent)) return
        val result = ActivityTransitionResult.extractResult(intent) ?: return
        var moving: Boolean? = null
        for (event in result.transitionEvents) {
            if (event.transitionType != ActivityTransition.ACTIVITY_TRANSITION_ENTER) continue
            moving = when (event.activityType) {
                DetectedActivity.STILL -> false
                DetectedActivity.WALKING,
                DetectedActivity.ON_FOOT,
                DetectedActivity.RUNNING,
                DetectedActivity.IN_VEHICLE,
                DetectedActivity.ON_BICYCLE -> true
                else -> moving
            }
        }
        if (moving != null) {
            Log.i(TAG, "activity moving=$moving")
            DevicePowerMode.onActivity(context.applicationContext, moving)
        }
    }

    companion object {
        const val ACTION = "com.mrp.ACTIVITY_TRANSITION"
        private const val TAG = "ActivityTransitionRx"
    }
}
