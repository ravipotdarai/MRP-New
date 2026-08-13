package com.mrp.domain.guardian

import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.IpPrefix
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.system.OsConstants
import android.util.Log
import com.mrp.domain.model.EventTypes
import com.mrp.domain.usecase.TimelineEventLogger
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.net.InetAddress
import java.util.concurrent.atomic.AtomicBoolean

/**
 * DNS-only VPN engine: hijacks system DNS and filters queries.
 * Does not route general traffic (no 0.0.0.0/0). Major consumer apps are
 * excluded from the VPN so they keep normal networking even if DNS filtering
 * misbehaves.
 */
class NetworkGuardianEngine(
    private val vpnService: VpnService,
    private val listManager: DomainListManager,
    private val stats: GuardianStatsStore,
    private val eventLogger: TimelineEventLogger,
) {
    private val running = AtomicBoolean(false)
    private var worker: Thread? = null
    private var tunFd: ParcelFileDescriptor? = null

    fun start(): Boolean {
        if (running.get()) return true
        // DNS-only IPv4 VPN: route only 10.0.0.2/32 into TUN. On API 33+ punch THROW
        // routes for the rest of IPv4 so Android does not install "unreachable default"
        // (which blackholes Chrome and other non-excluded apps).
        val builder = vpnService.Builder()
            .setSession("MRP Network Guardian")
            .setMtu(1500)
            // Interface address and DNS address MUST differ. If they are the same,
            // the kernel delivers DNS to local/lo and the TUN never sees queries.
            .addAddress(VPN_IFACE_V4, 32)
            .addRoute(VPN_DNS_V4, 32)
            .addDnsServer(VPN_DNS_V4)

        // Critical: blocking reads. Non-blocking + FileInputStream often throws and
        // previously killed the DNS loop while the VPN stayed up → every app offline.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setMetered(false)
            builder.setBlocking(true)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.allowFamily(OsConstants.AF_INET)
            builder.allowFamily(OsConstants.AF_INET6)
        }

        val excludedRouteCount = applyIpv4FallthroughExcludes(builder)

        // Bind VPN to the real Wi‑Fi/cellular network so upstream DNS protect() works.
        bindUnderlyingNetwork(builder)

        // Apps that must never lose connectivity (bypass VPN / use normal DNS).
        excludePackages(builder, vpnService)

        // #region agent log
        AgentDebugLog.init(vpnService.filesDir)
        AgentDebugLog.log(
            "B",
            "NetworkGuardianEngine.start:preEstablish",
            "VPN builder configured",
            mapOf(
                "vpnIface" to VPN_IFACE_V4,
                "vpnDns" to VPN_DNS_V4,
                "route" to "$VPN_DNS_V4/32",
                "ipv4FallthroughExcludes" to excludedRouteCount,
                "sdk" to Build.VERSION.SDK_INT,
            ),
        )
        // #endregion

        tunFd = builder.establish() ?: run {
            Log.e(TAG, "VPN establish failed")
            // #region agent log
            AgentDebugLog.log("A", "NetworkGuardianEngine.start:establishFailed", "VPN establish returned null", emptyMap())
            // #endregion
            return false
        }

        val debouncer = GuardianEventDebouncer()
        val activity = GuardianActivityStore(vpnService)
        val handler = DnsPacketHandler(
            listManager,
            stats,
            protectSocket = { socket ->
                val ok = vpnService.protect(socket)
                // #region agent log
                if (!ok) {
                    AgentDebugLog.log("C", "NetworkGuardianEngine.protect", "protect(socket) failed", emptyMap())
                }
                // #endregion
                ok
            },
        ) { category, host ->
            activity.record(category, host)
            // #region agent log
            AgentDebugLog.log(
                "D",
                "NetworkGuardianEngine.onBlocked",
                "domain blocked",
                mapOf("category" to category.name, "host" to host.take(80)),
            )
            // #endregion
            if (!debouncer.shouldEmit(category)) return@DnsPacketHandler
            val eventType = when (category) {
                DomainCategory.AD -> EventTypes.AD_BLOCKED
                DomainCategory.TRACKER -> EventTypes.TRACKER_BLOCKED
                DomainCategory.CONTENT -> EventTypes.CONTENT_DOMAIN_BLOCKED
                DomainCategory.MALWARE, DomainCategory.PHISHING -> EventTypes.MALICIOUS_DOMAIN_BLOCKED
            }
            eventLogger.logEvent(
                eventType,
                "blocked",
                mapOf(
                    "source" to "network_guardian",
                    "category" to category.name.lowercase(),
                    "host" to host.take(64),
                ),
            )
        }

        running.set(true)
        worker = Thread({
            runLoop(tunFd!!, handler)
        }, "NetworkGuardianDns").apply {
            isDaemon = true
            start()
        }
        Log.i(TAG, "Network Guardian VPN started iface=$VPN_IFACE_V4 dns=$VPN_DNS_V4")
        // #region agent log
        AgentDebugLog.log(
            "A",
            "NetworkGuardianEngine.start:ok",
            "VPN started; DNS loop thread launched",
            mapOf(
                "fdValid" to (tunFd?.fileDescriptor?.valid() == true),
                "vpnIface" to VPN_IFACE_V4,
                "vpnDns" to VPN_DNS_V4,
            ),
        )
        // #endregion
        return true
    }

    fun stop() {
        running.set(false)
        worker?.interrupt()
        worker = null
        try {
            tunFd?.close()
        } catch (_: Exception) {
        }
        tunFd = null
    }

    fun isRunning(): Boolean = running.get()

    private fun runLoop(fd: ParcelFileDescriptor, handler: DnsPacketHandler) {
        val input = FileInputStream(fd.fileDescriptor)
        val output = FileOutputStream(fd.fileDescriptor)
        val buffer = ByteArray(32767)
        Log.i(TAG, "DNS guardian loop started")
        // #region agent log
        var packetsIn = 0
        var dnsHandled = 0
        var lastHeartbeatMs = 0L
        AgentDebugLog.log("B", "NetworkGuardianEngine.runLoop:start", "DNS guardian loop started", emptyMap())
        // #endregion
        while (running.get() && !Thread.currentThread().isInterrupted) {
            try {
                val read = input.read(buffer)
                if (read <= 0) {
                    Thread.sleep(5)
                    continue
                }
                // #region agent log
                packetsIn++
                val now = System.currentTimeMillis()
                if (packetsIn <= 8 || now - lastHeartbeatMs > 4000) {
                    lastHeartbeatMs = now
                    val version = (buffer[0].toInt() shr 4) and 0xF
                    val nextOrProto = when (version) {
                        4 -> if (read > 9) buffer[9].toInt() and 0xFF else -1
                        6 -> if (read > 6) buffer[6].toInt() and 0xFF else -1
                        else -> -1
                    }
                    val dstPort = when {
                        version == 4 && read > 22 && nextOrProto == 17 ->
                            ((buffer[20].toInt() and 0xFF) shl 8) or (buffer[21].toInt() and 0xFF)
                        version == 6 && read > 42 && nextOrProto == 17 ->
                            ((buffer[40].toInt() and 0xFF) shl 8) or (buffer[41].toInt() and 0xFF)
                        else -> -1
                    }
                    AgentDebugLog.log(
                        "B",
                        "NetworkGuardianEngine.runLoop:packet",
                        "TUN packet received",
                        mapOf(
                            "packetsIn" to packetsIn,
                            "len" to read,
                            "ipVersion" to version,
                            "proto" to nextOrProto,
                            "dstPort" to dstPort,
                            "dnsHandled" to dnsHandled,
                            "runId" to "post-fix",
                        ),
                    )
                }
                // #endregion
                val result = handler.handleIpPacket(buffer, read)
                if (result.handled && result.responsePacket != null) {
                    // #region agent log
                    dnsHandled++
                    // #endregion
                    output.write(result.responsePacket)
                    output.flush()
                }
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                break
            } catch (e: IOException) {
                if (!running.get()) break
                // TUN closed or transient I/O — keep trying while enabled.
                Log.w(TAG, "DNS loop IO: ${e.message}")
                // #region agent log
                AgentDebugLog.log(
                    "B",
                    "NetworkGuardianEngine.runLoop:io",
                    "DNS loop IO error",
                    mapOf("error" to (e.message ?: e.javaClass.simpleName), "packetsIn" to packetsIn),
                )
                // #endregion
                try {
                    Thread.sleep(50)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
            } catch (e: Exception) {
                if (!running.get()) break
                Log.w(TAG, "DNS loop error (continuing)", e)
                try {
                    Thread.sleep(50)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
            }
        }
        Log.i(TAG, "DNS guardian loop stopped")
        // #region agent log
        AgentDebugLog.log(
            "B",
            "NetworkGuardianEngine.runLoop:stop",
            "DNS guardian loop stopped",
            mapOf("packetsIn" to packetsIn, "dnsHandled" to dnsHandled),
        )
        // #endregion
    }

    private fun bindUnderlyingNetwork(builder: VpnService.Builder) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP_MR1) return
        try {
            val cm = vpnService.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return
            val active = cm.activeNetwork ?: return
            builder.setUnderlyingNetworks(arrayOf(active))
            Log.i(TAG, "bound underlying network $active")
        } catch (e: Exception) {
            Log.w(TAG, "setUnderlyingNetworks failed", e)
        }
    }

    /**
     * API 33+: install THROW (exclude) routes covering all IPv4 except [VPN_DNS_V4]/32
     * so traffic falls through to Wi‑Fi/cellular instead of hitting unreachable default.
     */
    private fun applyIpv4FallthroughExcludes(builder: VpnService.Builder): Int {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return 0
        var count = 0
        try {
            for (prefix in complementaryIpv4Prefixes(VPN_DNS_V4)) {
                builder.excludeRoute(prefix)
                count++
            }
            Log.i(TAG, "installed $count IPv4 fallthrough exclude routes")
        } catch (e: Exception) {
            Log.w(TAG, "excludeRoute fallthrough failed", e)
        }
        return count
    }

    companion object {
        private const val TAG = "NetworkGuardianEngine"
        /** TUN interface address — must not equal [VPN_DNS_V4]. */
        private const val VPN_IFACE_V4 = "10.0.0.1"
        /** DNS hijack address routed into TUN for filtering. */
        private const val VPN_DNS_V4 = "10.0.0.2"

        /**
         * Build CIDR prefixes that cover 0.0.0.0/0 except [keep]/32.
         * Used with VpnService.Builder.excludeRoute (THROW) for DNS-only VPNs.
         */
        fun complementaryIpv4Prefixes(keepIp: String): List<IpPrefix> {
            val keep = ipv4ToLong(keepIp)
            val out = ArrayList<IpPrefix>(32)
            var prefix = 0L
            var bit = 31
            while (bit >= 0) {
                val mask = 1L shl bit
                if ((keep and mask) == 0L) {
                    // Keep goes down the 0-branch; THROW the 1-branch at this bit.
                    val base = prefix or mask
                    val prefixLen = 32 - bit
                    out.add(IpPrefix(longToInet4(base), prefixLen))
                } else {
                    prefix = prefix or mask
                }
                bit--
            }
            return out
        }

        private fun ipv4ToLong(ip: String): Long {
            val p = ip.split('.')
            return ((p[0].toLong() and 0xFF) shl 24) or
                ((p[1].toLong() and 0xFF) shl 16) or
                ((p[2].toLong() and 0xFF) shl 8) or
                (p[3].toLong() and 0xFF)
        }

        private fun longToInet4(value: Long): InetAddress {
            val bytes = byteArrayOf(
                ((value ushr 24) and 0xFF).toByte(),
                ((value ushr 16) and 0xFF).toByte(),
                ((value ushr 8) and 0xFF).toByte(),
                (value and 0xFF).toByte(),
            )
            return InetAddress.getByAddress(bytes)
        }

        /**
         * Packages excluded from the VPN (normal network + DNS). Ad filtering still
         * applies to browsers and other apps that stay on the VPN.
         */
        private val ALWAYS_EXCLUDE = listOf(
            "com.mrp",
            "com.google.android.youtube",
            "com.amazon.mShop.android.shopping",
            "in.amazon.mShop.android.shopping",
            "com.flipkart.android",
            "com.whatsapp",
            "com.whatsapp.w4b",
            "com.instagram.android",
            "com.facebook.katana",
            "com.facebook.orca",
            "com.google.android.gm",
            "com.android.vending",
            "com.google.android.apps.maps",
            "com.google.android.apps.photos",
            "com.google.android.contactkeys",
            "com.google.android.gms",
            "com.google.android.gsf",
            "com.google.android.apps.messaging",
            "com.truecaller",
            "com.phonepe.app",
            "net.one97.paytm",
            "com.google.android.apps.nbu.paisa.user",
            "in.swiggy.android",
            "com.application.zomato",
            "com.olacabs.customer",
            "com.ubercab",
            "com.netflix.mediaclient",
            "com.spotify.music",
            "com.hotstar.android",
            "com.jio.media.ondemand",
        )

        /** Browsers stay on the VPN so DNS ad-blocking still applies there. */
        private fun excludePackages(builder: VpnService.Builder, context: Context) {
            val pm = context.packageManager
            for (pkg in ALWAYS_EXCLUDE) {
                try {
                    pm.getPackageInfo(pkg, 0)
                    builder.addDisallowedApplication(pkg)
                    Log.i(TAG, "excluded from VPN: $pkg")
                } catch (_: PackageManager.NameNotFoundException) {
                    // not installed
                } catch (e: Exception) {
                    Log.w(TAG, "could not exclude $pkg", e)
                }
            }
        }
    }
}
