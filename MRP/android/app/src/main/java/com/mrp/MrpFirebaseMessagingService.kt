package com.mrp

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * P8-4 — Circle invite FCM. Notification tap opens mrp:// / https deep link.
 */
class MrpFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        persistToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
        if (data["type"] != "circle_invite") {
            // Still surface notification title/body if present
            val title = message.notification?.title ?: return
            val body = message.notification?.body ?: ""
            showNotification(title, body, null)
            return
        }
        val code = data["inviteCode"]?.trim()?.uppercase().orEmpty()
        val deepLink = data["deepLink"]?.takeIf { it.isNotBlank() }
            ?: if (code.isNotEmpty()) {
                "https://mobileresilienceplatform.web.app/circle/join?code=$code"
            } else null
        val title = data["title"] ?: message.notification?.title ?: "MRP Circle invite"
        val body = data["body"]
            ?: message.notification?.body
            ?: if (code.isNotEmpty()) "Code $code — tap to join" else "Open MRP to join"
        showNotification(title, body, deepLink)
    }

    private fun persistToken(token: String) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        try {
            val deviceId = android.provider.Settings.Secure.getString(
                contentResolver,
                android.provider.Settings.Secure.ANDROID_ID,
            ) ?: "unknown"
            FirebaseDatabase.getInstance(databaseUrl())
                .getReference("devices")
                .child(uid)
                .child("mrp_$deviceId")
                .updateChildren(
                    mapOf(
                        "fcmToken" to token,
                        "updatedAtMs" to System.currentTimeMillis(),
                        "platform" to "android",
                    ),
                )
        } catch (e: Exception) {
            Log.w(TAG, "FCM token RTDB write failed", e)
        }
    }

    private fun showNotification(title: String, body: String, deepLink: String?) {
        ensureChannel()
        val intent = if (!deepLink.isNullOrBlank()) {
            Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)).apply {
                setPackage(packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
        } else {
            Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
        }
        val pi = PendingIntent.getActivity(
            this,
            deepLink?.hashCode() ?: 0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notif = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pi)
            .build()
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notif)
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Circle invites",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "MRP Circle invite notifications"
            },
        )
    }

    private fun databaseUrl(): String {
        return try {
            val fromRes = getString(R.string.firebase_database_url)
            if (fromRes.isNotBlank()) fromRes
            else "https://mobileresilienceplatform-default-rtdb.firebaseio.com"
        } catch (_: Exception) {
            "https://mobileresilienceplatform-default-rtdb.firebaseio.com"
        }
    }

    companion object {
        private const val TAG = "MrpFcm"
        const val CHANNEL_ID = "mrp_circle_invites"
    }
}
