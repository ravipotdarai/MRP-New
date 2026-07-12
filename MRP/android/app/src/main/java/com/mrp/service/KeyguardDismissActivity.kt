package com.mrp.service

import android.app.Activity
import android.app.KeyguardManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.WindowManager

class KeyguardDismissActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Make the activity show over the lock screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }

        Log.d(TAG, "Keyguard dismiss activity created")

        // Dismiss the keyguard
        dismissKeyguard()
    }

    private fun dismissKeyguard() {
        try {
            val keyguardManager = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    // Android 13+ uses different callback
                    keyguardManager.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
                        override fun onDismissError() {
                            Log.e(TAG, "Keyguard dismiss error")
                            finish()
                        }

                        override fun onDismissSucceeded() {
                            Log.d(TAG, "Keyguard dismissed")
                            finish()
                        }

                        override fun onDismissCancelled() {
                            Log.d(TAG, "Keyguard dismiss cancelled")
                            finish()
                        }
                    })
                } else {
                    @Suppress("DEPRECATION")
                    keyguardManager.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
                        override fun onDismissError() {
                            Log.e(TAG, "Keyguard dismiss error")
                            finish()
                        }

                        override fun onDismissSucceeded() {
                            Log.d(TAG, "Keyguard dismissed")
                            finish()
                        }

                        override fun onDismissCancelled() {
                            Log.d(TAG, "Keyguard dismiss cancelled")
                            finish()
                        }
                    })
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to dismiss keyguard", e)
            finish()
        }
    }

    companion object {
        private const val TAG = "KeyguardDismissActivity"
    }
}