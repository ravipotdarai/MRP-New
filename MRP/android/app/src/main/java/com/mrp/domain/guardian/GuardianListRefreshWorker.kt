package com.mrp.domain.guardian

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.mrp.domain.risk.ThreatIntelProvider
import java.util.concurrent.TimeUnit

/**
 * Background refresh for signed Guardian domain lists and threat intel — no user content access.
 */
class GuardianListRefreshWorker(
    context: Context,
    params: androidx.work.WorkerParameters,
) : androidx.work.CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val lists = DomainListManager(applicationContext)
        lists.refreshRemoteManifest()
        ThreatIntelProvider(applicationContext).refreshRemote()
        return Result.success()
    }

    companion object {
        private const val WORK_NAME = "mrp_guardian_list_refresh"

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = PeriodicWorkRequestBuilder<GuardianListRefreshWorker>(24, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context.applicationContext).cancelUniqueWork(WORK_NAME)
        }
    }
}
