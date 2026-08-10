package com.mrp.domain.usecase

/**
 * Flat appData naming for append-only Drive chunks (no nested folders).
 */
object DriveChunkNames {
    const val LIVE_FILE = "mrp_live.enc"
    const val EVT_PREFIX = "mrp_evt_"
    const val SELFIE_PREFIX = "mrp_selfie_"
    const val PACK_VERSION = 1

    /** Retention: delete evt/selfie packs older than this many days. */
    const val RETENTION_DAYS = 45

    fun evtFileName(date: String, hour: Int, seq: Long): String =
        "mrp_evt_${date}_${hour.toString().padStart(2, '0')}_$seq.enc"

    fun selfieFileName(eventId: String): String {
        val safe = eventId.replace(Regex("[^A-Za-z0-9._-]"), "_").take(120)
        return "mrp_selfie_$safe.enc"
    }

    fun isEvtPack(name: String): Boolean =
        name.startsWith(EVT_PREFIX) && name.endsWith(".enc")

    fun isSelfiePack(name: String): Boolean =
        name.startsWith(SELFIE_PREFIX) && name.endsWith(".enc")

    fun isLivePack(name: String): Boolean = name == LIVE_FILE
}
