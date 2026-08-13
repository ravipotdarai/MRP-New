package com.mrp.domain.usecase

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.mrp.data.local.SecureVaultStorage
import com.mrp.domain.model.EventTypes
import java.util.concurrent.TimeUnit

/**
 * Periodic vault expiry reminders — metadata only (title/category), never body contents.
 */
class VaultExpiryReminderWorker(
    context: Context,
    params: androidx.work.WorkerParameters,
) : androidx.work.CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val leadDays = prefs.getInt(KEY_LEAD_DAYS, DEFAULT_LEAD_DAYS).coerceIn(1, 90)
        val windowMs = leadDays * 24L * 60L * 60L * 1000L
        val items = SecureVaultStorage(applicationContext).itemsExpiringWithin(windowMs)
        if (items.isEmpty()) return Result.success()

        createChannel()
        val nm = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        for (item in items.take(5)) {
            val title = (item["title"] as? String)?.take(40) ?: "Vault item"
            val category = (item["category"] as? String) ?: "document"
            val idHash = (item["id"] as? String)?.take(8) ?: "item"
            val notif = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Vault expiry reminder")
                .setContentText("$title ($category) expires soon")
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .build()
            nm.notify(idHash.hashCode(), notif)
            TimelineEventLogger(applicationContext).logEvent(
                EventTypes.VAULT_EXPIRY_REMINDER,
                "reminded",
                mapOf(
                    "source" to "secure_vault",
                    "category" to category,
                    "lead_days" to leadDays,
                    "item_id_hash" to idHash,
                ),
            )
        }
        return Result.success()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Vault reminders", NotificationManager.IMPORTANCE_DEFAULT),
        )
    }

    companion object {
        private const val WORK_NAME = "mrp_vault_expiry_reminders"
        private const val PREFS = "mrp_vault_expiry"
        private const val KEY_LEAD_DAYS = "lead_days"
        private const val DEFAULT_LEAD_DAYS = 14
        private const val CHANNEL_ID = "mrp_vault_expiry"

        fun leadDays(context: Context): Int =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getInt(KEY_LEAD_DAYS, DEFAULT_LEAD_DAYS)

        fun schedule(context: Context, leadDays: Int = DEFAULT_LEAD_DAYS) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putInt(KEY_LEAD_DAYS, leadDays.coerceIn(1, 90))
                .apply()
            val request = PeriodicWorkRequestBuilder<VaultExpiryReminderWorker>(1, TimeUnit.DAYS)
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request,
            )
        }
    }
}
