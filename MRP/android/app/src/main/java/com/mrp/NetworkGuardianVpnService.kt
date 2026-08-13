package com.mrp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import androidx.core.app.NotificationCompat
import com.mrp.domain.guardian.DomainListManager
import com.mrp.domain.guardian.GuardianActivityStore
import com.mrp.domain.guardian.GuardianStatsStore
import com.mrp.domain.guardian.NetworkGuardianEngine
import com.mrp.domain.model.EventTypes
import com.mrp.domain.usecase.TimelineEventLogger

class NetworkGuardianVpnService : android.net.VpnService() {

    private var engine: NetworkGuardianEngine? = null
    private var listManager: DomainListManager? = null
    private var statsStore: GuardianStatsStore? = null

    override fun onBind(intent: Intent?): IBinder? {
        return super.onBind(intent)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_ENABLE -> enableGuardian()
            ACTION_DISABLE -> disableGuardian()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        engine?.stop()
        engine = null
        super.onDestroy()
    }

    override fun onRevoke() {
        clearDnsReady(this)
        setEnabled(this, false)
        engine?.stop()
        engine = null
        TimelineEventLogger(this).logEvent(
            EventTypes.NETWORK_GUARDIAN_DISABLED,
            "revoked",
            mapOf("source" to "network_guardian", "reason" to "vpn_revoked"),
        )
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        super.onRevoke()
    }

    private fun enableGuardian() {
        // #region agent log
        com.mrp.domain.guardian.AgentDebugLog.init(filesDir)
        com.mrp.domain.guardian.AgentDebugLog.log(
            "A",
            "NetworkGuardianVpnService.enableGuardian:enter",
            "enableGuardian called",
            mapOf(
                "engineRunning" to (engine?.isRunning() == true),
                "prefEnabled" to isEnabled(this),
                "privateDns" to detectPrivateDns(this),
            ),
        )
        // #endregion
        if (engine?.isRunning() == true) {
            val stats = statsStore ?: GuardianStatsStore(this).also { statsStore = it }
            val blockedTotal = stats.snapshot()["blockedTotal"] ?: 0L
            createChannel()
            startForeground(NOTIFICATION_ID, buildNotification(true, blockedTotal))
            setEnabled(this, true)
            setDnsReady(this, true)
            clearLastError(this)
            // #region agent log
            com.mrp.domain.guardian.AgentDebugLog.log(
                "A",
                "NetworkGuardianVpnService.enableGuardian:alreadyRunning",
                "engine already running; refreshed foreground state",
                mapOf("blockedTotal" to blockedTotal),
            )
            // #endregion
            return
        }

        createChannel()
        startForeground(NOTIFICATION_ID, buildNotification(false, 0L))

        val lists = listManager ?: DomainListManager(this).also { listManager = it }
        val stats = statsStore ?: GuardianStatsStore(this).also { statsStore = it }
        val eng = NetworkGuardianEngine(this, lists, stats, TimelineEventLogger(this))
        if (!eng.start()) {
            setLastError(this, "Could not start DNS filtering. Guardian disabled to avoid breaking connectivity.")
            // #region agent log
            com.mrp.domain.guardian.AgentDebugLog.log(
                "A",
                "NetworkGuardianVpnService.enableGuardian:startFailed",
                "engine.start failed",
                emptyMap(),
            )
            // #endregion
            failEnable("engine_start_failed")
            return
        }

        engine = eng
        setEnabled(this, true)
        setDnsReady(this, true)
        clearLastError(this)

        val blockedTotal = stats.snapshot()["blockedTotal"] ?: 0L
        startForeground(NOTIFICATION_ID, buildNotification(true, blockedTotal))

        TimelineEventLogger(this).logEvent(
            EventTypes.NETWORK_GUARDIAN_ENABLED,
            "enabled",
            mapOf(
                "source" to "network_guardian",
                "mode" to "dns_filter",
                "listVersion" to lists.listVersion(),
            ),
        )
    }

    private fun failEnable(reason: String) {
        setEnabled(this, false)
        setDnsReady(this, false)
        engine?.stop()
        engine = null
        TimelineEventLogger(this).logEvent(
            EventTypes.NETWORK_GUARDIAN_DISABLED,
            "failed",
            mapOf("source" to "network_guardian", "reason" to reason),
        )
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun disableGuardian() {
        if (engine == null && !isEnabled(this)) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return
        }
        engine?.stop()
        engine = null
        setEnabled(this, false)
        setDnsReady(this, false)
        TimelineEventLogger(this).logEvent(
            EventTypes.NETWORK_GUARDIAN_DISABLED,
            "disabled",
            mapOf("source" to "network_guardian"),
        )
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun buildNotification(dnsReady: Boolean, blockedTotal: Long): Notification {
        val openIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stopIntent = Intent(this, NetworkGuardianVpnService::class.java).apply {
            action = ACTION_DISABLE
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val body = if (dnsReady) {
            "DNS filtering active. Blocked $blockedTotal domains so far."
        } else {
            "Starting DNS filtering…"
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle("Network Guardian")
            .setContentText(body)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Disable", stopPendingIntent)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Network Guardian",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "MRP Network Guardian status"
            },
        )
    }

    companion object {
        private const val PREFS = "mrp_network_guardian"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_UPDATED_AT = "updated_at_ms"
        private const val KEY_DNS_READY = "dns_ready"
        private const val KEY_LAST_ERROR = "last_error"
        private const val CHANNEL_ID = "mrp_network_guardian"
        private const val NOTIFICATION_ID = 92121
        const val ACTION_ENABLE = "com.mrp.NETWORK_GUARDIAN_ENABLE"
        const val ACTION_DISABLE = "com.mrp.NETWORK_GUARDIAN_DISABLE"

        fun setEnabled(context: Context, enabled: Boolean) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_ENABLED, enabled)
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .commit()
        }

        private fun setDnsReady(context: Context, ready: Boolean) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_DNS_READY, ready)
                .commit()
        }

        private fun clearDnsReady(context: Context) = setDnsReady(context, false)

        private fun setLastError(context: Context, message: String) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_LAST_ERROR, message)
                .commit()
        }

        private fun clearLastError(context: Context) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_LAST_ERROR)
                .commit()
        }

        fun awaitReady(context: Context, expectEnabled: Boolean, timeoutMs: Long = 10_000L): Map<String, Any?> {
            val deadline = System.currentTimeMillis() + timeoutMs
            while (System.currentTimeMillis() < deadline) {
                val state = state(context)
                if (!expectEnabled) {
                    if (state["enabled"] != true) return state
                } else {
                    val err = state["lastError"] as? String
                    if (!err.isNullOrBlank()) return state
                    if (state["enabled"] == true && state["dnsBlockingReady"] == true) return state
                }
                Thread.sleep(120)
            }
            return state(context)
        }

        fun state(context: Context): Map<String, Any?> {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val consentGranted = prepare(context) == null
            val dnsReady = prefs.getBoolean(KEY_DNS_READY, false)
            val lists = DomainListManager(context)
            val stats = GuardianStatsStore(context).snapshot()
            val listSnap = lists.snapshot()
            return mapOf(
                "enabled" to prefs.getBoolean(KEY_ENABLED, false),
                "updatedAtMs" to prefs.getLong(KEY_UPDATED_AT, 0L),
                "consentGranted" to consentGranted,
                "mode" to if (dnsReady) "dns_filter" else "foundation",
                "dnsBlockingReady" to dnsReady,
                "listVersion" to listSnap["listVersion"],
                "listUpdatedAtMs" to listSnap["listUpdatedAtMs"],
                "categoryAds" to listSnap["categoryAds"],
                "categoryTrackers" to listSnap["categoryTrackers"],
                "categoryMalware" to listSnap["categoryMalware"],
                "categoryPhishing" to listSnap["categoryPhishing"],
                "categoryContent" to listSnap["categoryContent"],
                "allowlist" to listSnap["allowlist"],
                "manifestUrlConfigured" to listSnap["manifestUrlConfigured"],
                "intelVersion" to listSnap["intelVersion"],
                "intelUpdatedAtMs" to listSnap["intelUpdatedAtMs"],
                "intelLastError" to listSnap["intelLastError"],
                "blockedAds" to stats["blockedAds"],
                "blockedTrackers" to stats["blockedTrackers"],
                "blockedMalware" to stats["blockedMalware"],
                "blockedPhishing" to stats["blockedPhishing"],
                "blockedContent" to stats["blockedContent"],
                "blockedTotal" to stats["blockedTotal"],
                "dnsQueries" to stats["dnsQueries"],
                "dnsForwarded" to stats["dnsForwarded"],
                "recentActivity" to GuardianActivityStore(context).recent(15),
                "lastError" to prefs.getString(KEY_LAST_ERROR, null),
                "otherVpnActive" to detectOtherVpn(context, dnsReady),
                "privateDnsActive" to detectPrivateDns(context),
            )
        }

        private fun detectPrivateDns(context: Context): Boolean {
            return try {
                when (Settings.Global.getString(context.contentResolver, "private_dns_mode")?.lowercase()) {
                    "hostname", "opportunistic" -> true
                    else -> false
                }
            } catch (_: Exception) {
                false
            }
        }

        private fun detectOtherVpn(context: Context, ourDnsReady: Boolean): Boolean {
            if (ourDnsReady) return false
            return try {
                val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                val nets = cm.allNetworks ?: emptyArray()
                nets.any { n ->
                    val caps = cm.getNetworkCapabilities(n) ?: return@any false
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
                }
            } catch (_: Exception) {
                false
            }
        }

        fun isEnabled(context: Context): Boolean {
            return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_ENABLED, false)
        }

        fun start(context: Context) {
            val intent = Intent(context, NetworkGuardianVpnService::class.java).apply {
                action = ACTION_ENABLE
            }
            androidx.core.content.ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, NetworkGuardianVpnService::class.java).apply {
                action = ACTION_DISABLE
            }
            context.startService(intent)
        }
    }
}
