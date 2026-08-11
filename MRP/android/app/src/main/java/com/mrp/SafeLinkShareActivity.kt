package com.mrp

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log

/**
 * Receives ACTION_SEND / ACTION_VIEW text shares, extracts a URL, and opens MRP
 * with mrp://safe-link?text=… so RN can show SafeLinkResultScreen.
 */
class SafeLinkShareActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            val text = extractSharedText(intent)
            val target = Intent(this, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse("mrp://safe-link").buildUpon()
                    .appendQueryParameter("text", text.take(2048))
                    .build()
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(target)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to forward share", e)
        } finally {
            finish()
        }
    }

    private fun extractSharedText(intent: Intent?): String {
        if (intent == null) return ""
        val action = intent.action
        if (action == Intent.ACTION_SEND) {
            val extra = intent.getStringExtra(Intent.EXTRA_TEXT)
                ?: intent.getStringExtra(Intent.EXTRA_SUBJECT)
                ?: ""
            return extra.trim()
        }
        if (action == Intent.ACTION_VIEW) {
            return intent.dataString?.trim().orEmpty()
        }
        return intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
    }

    companion object {
        private const val TAG = "SafeLinkShare"
    }
}
