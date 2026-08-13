package com.mrp.domain.guardian

import android.util.Log
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

/**
 * Minimal DNS query parser/responder for UDP port 53 inside the VPN tunnel.
 * Blocks matched domains with NXDOMAIN/0.0.0.0; forwards others to upstream DNS.
 */
class DnsPacketHandler(
    private val listManager: DomainListManager,
    private val stats: GuardianStatsStore,
    private val protectSocket: (DatagramSocket) -> Boolean,
    private val upstreamDns: String = "8.8.8.8",
    private val onBlocked: ((DomainCategory, String) -> Unit)? = null,
) {

    data class DnsHandleResult(
        val handled: Boolean,
        val responsePacket: ByteArray? = null,
    )

    /**
     * Process raw IP packet from TUN. Returns response IP packet bytes if this was a handled DNS query.
     */
    fun handleIpPacket(packet: ByteArray, length: Int): DnsHandleResult {
        if (length < 20) return DnsHandleResult(false)
        val version = (packet[0].toInt() shr 4) and 0xF
        return when (version) {
            4 -> handleIpv4Dns(packet, length)
            6 -> handleIpv6Dns(packet, length)
            else -> DnsHandleResult(false)
        }
    }

    private fun handleIpv4Dns(packet: ByteArray, length: Int): DnsHandleResult {
        val ihl = (packet[0].toInt() and 0xF) * 4
        if (length < ihl + 8) return DnsHandleResult(false)
        val protocol = packet[9].toInt() and 0xFF
        if (protocol != 17) return DnsHandleResult(false) // UDP only

        val totalLength = ((packet[2].toInt() and 0xFF) shl 8) or (packet[3].toInt() and 0xFF)
        val ipLen = minOf(totalLength, length)
        if (ipLen < ihl + 8) return DnsHandleResult(false)

        val srcPort = readUint16(packet, ihl)
        val dstPort = readUint16(packet, ihl + 2)
        if (dstPort != 53) return DnsHandleResult(false)

        val udpLen = readUint16(packet, ihl + 4)
        val dnsOffset = ihl + 8
        val dnsLen = udpLen - 8
        if (dnsLen < 12 || dnsOffset + dnsLen > ipLen) return DnsHandleResult(false)

        val responseDns = processDnsQuery(packet, dnsOffset, dnsLen) ?: return DnsHandleResult(false)
        val responseIp = buildUdpIpResponse(packet, ihl, srcPort, dstPort, responseDns)
        return DnsHandleResult(true, responseIp)
    }

    private fun handleIpv6Dns(packet: ByteArray, length: Int): DnsHandleResult {
        // Basic IPv6 header only (no extension headers) — VPN DNS is UDP/53.
        if (length < 40 + 8) return DnsHandleResult(false)
        val nextHeader = packet[6].toInt() and 0xFF
        if (nextHeader != 17) return DnsHandleResult(false) // UDP
        val payloadLen = readUint16(packet, 4)
        val ipLen = minOf(40 + payloadLen, length)
        val udpOff = 40
        if (ipLen < udpOff + 8) return DnsHandleResult(false)
        val srcPort = readUint16(packet, udpOff)
        val dstPort = readUint16(packet, udpOff + 2)
        if (dstPort != 53) return DnsHandleResult(false)
        val udpLen = readUint16(packet, udpOff + 4)
        val dnsOffset = udpOff + 8
        val dnsLen = udpLen - 8
        if (dnsLen < 12 || dnsOffset + dnsLen > ipLen) return DnsHandleResult(false)

        val responseDns = processDnsQuery(packet, dnsOffset, dnsLen) ?: return DnsHandleResult(false)
        val responseIp = buildUdpIp6Response(packet, srcPort, dstPort, responseDns)
        return DnsHandleResult(true, responseIp)
    }

    private fun processDnsQuery(packet: ByteArray, dnsOffset: Int, dnsLen: Int): ByteArray? {
        val qnameEnd = findQNameEnd(packet, dnsOffset + 12, dnsOffset + dnsLen) ?: return null
        val qname = parseQName(packet, dnsOffset + 12, dnsOffset + dnsLen) ?: return null
        val qtype = if (qnameEnd + 2 <= dnsOffset + dnsLen) {
            readUint16(packet, qnameEnd)
        } else {
            1
        }

        stats.incrementDnsQueries()
        val match = listManager.match(qname)
        val dnsPayload = packet.copyOfRange(dnsOffset, dnsOffset + dnsLen)

        return if (match != null) {
            stats.increment(match.category)
            onBlocked?.invoke(match.category, qname)
            // #region agent log
            AgentDebugLog.log(
                "D",
                "DnsPacketHandler.processDnsQuery:block",
                "blocking DNS name",
                mapOf("qname" to qname.take(80), "qtype" to qtype, "category" to match.category.name),
            )
            // #endregion
            buildBlockedResponse(dnsPayload, qtype)
        } else {
            stats.incrementDnsForwarded()
            val forwarded = forwardDnsWithFallback(dnsPayload)
            // #region agent log
            AgentDebugLog.log(
                "C",
                "DnsPacketHandler.processDnsQuery:forward",
                "forwarded DNS name",
                mapOf(
                    "qname" to qname.take(80),
                    "qtype" to qtype,
                    "respLen" to forwarded.size,
                    "rcode" to (if (forwarded.size > 3) forwarded[3].toInt() and 0x0F else -1),
                ),
            )
            // #endregion
            forwarded
        }
    }

    /** Try configured upstream, then public resolvers; never drop a valid DNS query. */
    private fun forwardDnsWithFallback(query: ByteArray): ByteArray {
        val resolvers = listOf(upstreamDns) + UPSTREAM_DNS.filter { it != upstreamDns }
        for (resolver in resolvers) {
            forwardDnsTo(query, resolver)?.let { return it }
        }
        // Fail-open: SERVFAIL makes every app look offline. Prefer empty NOERROR so
        // clients retry / use another path instead of treating the network as dead.
        Log.w(TAG, "all upstream DNS resolvers failed — returning empty NOERROR (fail-open)")
        return buildEmptyNoErrorResponse(query)
    }

    private fun buildEmptyNoErrorResponse(query: ByteArray): ByteArray {
        if (query.size < 12) return query
        val resp = query.copyOf()
        resp[2] = 0x81.toByte()
        resp[3] = 0x80.toByte() // QR=1, RA=1, RCODE=0
        resp[6] = 0
        resp[7] = 0
        return resp
    }

    private fun forwardDnsTo(query: ByteArray, resolver: String): ByteArray? {
        var socket: DatagramSocket? = null
        return try {
            socket = DatagramSocket()
            if (!protectSocket(socket)) {
                Log.w(TAG, "could not protect upstream DNS socket for $resolver")
                return null
            }
            socket.soTimeout = 4000
            // Numeric IPs only — never resolve resolver names through the VPN DNS.
            val upstream = inetLiteral(resolver) ?: return null
            socket.send(DatagramPacket(query, query.size, upstream, 53))
            val buf = ByteArray(4096)
            val resp = DatagramPacket(buf, buf.size)
            socket.receive(resp)
            if (resp.length < 12) return null
            buf.copyOf(resp.length)
        } catch (e: Exception) {
            Log.w(TAG, "upstream DNS forward failed ($resolver): ${e.message}")
            null
        } finally {
            try {
                socket?.close()
            } catch (_: Exception) {
            }
        }
    }

    private fun inetLiteral(ip: String): InetAddress? {
        return try {
            val parts = ip.split('.')
            if (parts.size != 4) return null
            val bytes = ByteArray(4) { i ->
                parts[i].toInt().coerceIn(0, 255).toByte()
            }
            InetAddress.getByAddress(bytes)
        } catch (_: Exception) {
            null
        }
    }

    private fun buildServFailResponse(query: ByteArray): ByteArray {
        if (query.size < 12) return query
        val resp = query.copyOf()
        resp[2] = 0x81.toByte()
        resp[3] = 0x82.toByte() // QR=1, RA=1, RCODE=2 (SERVFAIL)
        resp[6] = 0
        resp[7] = 0
        return resp
    }

    private fun buildBlockedResponse(query: ByteArray, qtype: Int): ByteArray {
        if (query.size < 12) return query
        // AAAA / IPv6: empty NOERROR — app falls back or treats as unreachable
        if (qtype == 28) {
            val resp = query.copyOf()
            resp[2] = 0x81.toByte()
            resp[3] = 0x80.toByte()
            resp[6] = 0
            resp[7] = 0
            return resp
        }
        // A record → 0.0.0.0 sinkhole
        val answer = byteArrayOf(
            0xC0.toByte(), 0x0C,
            0x00, 0x01,
            0x00, 0x01,
            0x00, 0x00, 0x00, 0x3C,
            0x00, 0x04,
            0x00, 0x00, 0x00, 0x00,
        )
        val resp = ByteArray(query.size + answer.size)
        System.arraycopy(query, 0, resp, 0, query.size)
        resp[2] = 0x81.toByte()
        resp[3] = 0x80.toByte()
        resp[6] = 0x00
        resp[7] = 0x01
        System.arraycopy(answer, 0, resp, query.size, answer.size)
        return resp
    }

    private fun buildUdpIpResponse(
        requestIp: ByteArray,
        ihl: Int,
        srcPort: Int,
        dstPort: Int,
        dnsPayload: ByteArray,
    ): ByteArray {
        val udpLen = 8 + dnsPayload.size
        val totalLen = ihl + udpLen
        val out = ByteArray(totalLen)

        System.arraycopy(requestIp, 0, out, 0, ihl)
        System.arraycopy(requestIp, 12, out, 16, 4) // dst -> new src (client)
        System.arraycopy(requestIp, 16, out, 12, 4) // src -> new dst (our DNS)
        out[2] = ((totalLen shr 8) and 0xFF).toByte()
        out[3] = (totalLen and 0xFF).toByte()
        out[8] = 64 // TTL
        out[10] = 0
        out[11] = 0
        val ipChecksum = ipChecksum(out, ihl)
        out[10] = ((ipChecksum shr 8) and 0xFF).toByte()
        out[11] = (ipChecksum and 0xFF).toByte()

        writeUint16(out, ihl, dstPort)
        writeUint16(out, ihl + 2, srcPort)
        writeUint16(out, ihl + 4, udpLen)
        out[ihl + 6] = 0
        out[ihl + 7] = 0

        System.arraycopy(dnsPayload, 0, out, ihl + 8, dnsPayload.size)

        val udpChecksum = udpChecksum(out, ihl, udpLen)
        out[ihl + 6] = ((udpChecksum shr 8) and 0xFF).toByte()
        out[ihl + 7] = (udpChecksum and 0xFF).toByte()
        return out
    }

    private fun buildUdpIp6Response(
        requestIp: ByteArray,
        srcPort: Int,
        dstPort: Int,
        dnsPayload: ByteArray,
    ): ByteArray {
        val udpLen = 8 + dnsPayload.size
        val totalLen = 40 + udpLen
        val out = ByteArray(totalLen)
        // Copy IPv6 header then swap src/dst
        System.arraycopy(requestIp, 0, out, 0, 40)
        System.arraycopy(requestIp, 8, out, 24, 16) // old src -> new dst
        System.arraycopy(requestIp, 24, out, 8, 16) // old dst -> new src
        writeUint16(out, 4, udpLen) // payload length
        out[6] = 17 // next header UDP
        out[7] = 64 // hop limit

        writeUint16(out, 40, dstPort)
        writeUint16(out, 42, srcPort)
        writeUint16(out, 44, udpLen)
        out[46] = 0
        out[47] = 0
        System.arraycopy(dnsPayload, 0, out, 48, dnsPayload.size)

        val sum = udpChecksumIpv6(out, udpLen)
        out[46] = ((sum shr 8) and 0xFF).toByte()
        out[47] = (sum and 0xFF).toByte()
        return out
    }

    private fun udpChecksumIpv6(ip: ByteArray, udpLen: Int): Int {
        var sum = 0
        // Pseudo-header: src + dst
        for (i in 8 until 40 step 2) {
            sum += ((ip[i].toInt() and 0xFF) shl 8) or (ip[i + 1].toInt() and 0xFF)
        }
        sum += udpLen ushr 16
        sum += udpLen and 0xFFFF
        sum += 17 // next header
        var i = 40
        while (i < 40 + udpLen) {
            if (i == 46) {
                i += 2
                continue
            }
            if (i + 1 >= ip.size) {
                if (i < ip.size) sum += (ip[i].toInt() and 0xFF) shl 8
                break
            }
            sum += ((ip[i].toInt() and 0xFF) shl 8) or (ip[i + 1].toInt() and 0xFF)
            i += 2
        }
        while (sum shr 16 != 0) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }
        val checksum = sum.inv() and 0xFFFF
        return if (checksum == 0) 0xFFFF else checksum
    }

    private fun findQNameEnd(packet: ByteArray, offset: Int, end: Int): Int? {
        var pos = offset
        var jumps = 0
        while (pos < end && jumps < 8) {
            val len = packet[pos].toInt() and 0xFF
            if (len == 0) return pos + 1
            if (len and 0xC0 == 0xC0) return pos + 2
            if (len > 63 || pos + 1 + len > end) return null
            pos += 1 + len
        }
        return null
    }

    private fun parseQName(packet: ByteArray, offset: Int, end: Int): String? {
        var pos = offset
        val labels = mutableListOf<String>()
        var jumps = 0
        while (pos < end && jumps < 8) {
            val len = packet[pos].toInt() and 0xFF
            if (len == 0) break
            if (len and 0xC0 == 0xC0) {
                if (pos + 1 >= end) return null
                val pointer = ((len and 0x3F) shl 8) or (packet[pos + 1].toInt() and 0xFF)
                pos = pointer
                jumps++
                continue
            }
            if (len > 63 || pos + 1 + len > end) return null
            labels.add(String(packet, pos + 1, len, Charsets.US_ASCII))
            pos += 1 + len
        }
        if (labels.isEmpty()) return null
        return labels.joinToString(".")
    }

    private fun readUint16(data: ByteArray, offset: Int): Int {
        return ((data[offset].toInt() and 0xFF) shl 8) or (data[offset + 1].toInt() and 0xFF)
    }

    private fun writeUint16(data: ByteArray, offset: Int, value: Int) {
        data[offset] = ((value shr 8) and 0xFF).toByte()
        data[offset + 1] = (value and 0xFF).toByte()
    }

    private fun ipChecksum(header: ByteArray, length: Int): Int {
        var sum = 0
        var i = 0
        while (i < length) {
            val word = if (i == 10) {
                0
            } else {
                ((header[i].toInt() and 0xFF) shl 8) or (header[i + 1].toInt() and 0xFF)
            }
            sum += word
            i += 2
        }
        while (sum shr 16 != 0) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }
        return sum.inv() and 0xFFFF
    }

    private fun udpChecksum(ip: ByteArray, ihl: Int, udpLen: Int): Int {
        var sum = 0
        for (i in 12 until 20 step 2) {
            sum += ((ip[i].toInt() and 0xFF) shl 8) or (ip[i + 1].toInt() and 0xFF)
        }
        sum += 17 // UDP
        sum += udpLen
        val udpStart = ihl
        var i = udpStart
        while (i < udpStart + udpLen) {
            if (i == udpStart + 6) {
                i += 2
                continue
            }
            if (i + 1 >= ip.size) break
            sum += ((ip[i].toInt() and 0xFF) shl 8) or (ip[i + 1].toInt() and 0xFF)
            i += 2
        }
        if ((udpLen and 1) == 1) {
            sum += (ip[udpStart + udpLen - 1].toInt() and 0xFF) shl 8
        }
        while (sum shr 16 != 0) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }
        val checksum = sum.inv() and 0xFFFF
        return if (checksum == 0) 0xFFFF else checksum
    }

    companion object {
        private const val TAG = "DnsPacketHandler"
        private val UPSTREAM_DNS = arrayOf("8.8.8.8", "1.1.1.1", "8.8.4.4", "1.0.0.1")
    }
}
