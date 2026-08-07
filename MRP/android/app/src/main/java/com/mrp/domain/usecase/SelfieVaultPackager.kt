package com.mrp.domain.usecase

import android.content.Context
import android.util.Base64
import android.util.Log
import com.mrp.data.local.TimelineStorage
import com.mrp.domain.model.TimelineEntry
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs

/**
 * Links on-device selfie JPEGs to timeline rows and packs them into the Drive vault.
 *
 * Photos are named `<EVENT>_yyyyMMdd_HHmmss.jpg`. Historically they were never written
 * into timeline metadata, so Drive sync had nothing to upload — this linker fixes that.
 */
object SelfieVaultPackager {

    private const val TAG = "SelfieVaultPackager"
    private const val MATCH_WINDOW_MS = 45_000L
    private const val FALLBACK_WINDOW_MS = 120_000L
    const val MAX_SELFIES = 100
    const val MAX_BYTES_TOTAL = 28L * 1024L * 1024L
    /** ~5–8MP JPEG @ q96 typically 1.5–4MB. */
    const val MAX_FILE_BYTES = 5_500_000L

    private val ISO_UTC = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private val PHOTO_NAME_RE = Regex("""^(?:intruder_)?(.+)_\d{8}_\d{6}\.jpg$""", RegexOption.IGNORE_CASE)

    private val NO_SELFIE_EVENTS = setOf(
        "SCREEN_LOCK",
        "SCREEN_UNLOCK",
        "GEOFENCE_ENTER",
        "GEOFENCE_EXIT",
        "APP_MISUSE",
        "DATA_RISK_APP",
        "DEVICE_SHUTDOWN",
        "DEVICE_REBOOT",
        "SIM_LOCKED",
        "UNLOCK_FAILED",
        "SIM_CHANGE",
        "POSTURE_ALERT",
    )

    /** Events that must never trigger capture or vault selfie packing. */
    fun isNoSelfieEvent(eventName: String): Boolean {
        val key = eventName.uppercase(Locale.US)
        if (key in NO_SELFIE_EVENTS) return true
        if (key.startsWith("GEOFENCE_")) return true
        if (key.startsWith("SCREEN_")) return true
        return false
    }

    fun expectedPhotoPrefixes(eventType: String): Set<String> {
        val key = eventType.uppercase(Locale.US)
        if (isNoSelfieEvent(key)) return emptySet()
        return when (key) {
            "WRONG_PASSWORD" -> setOf("WRONG_UNLOCK_ATTEMPT", "WRONG_PASSWORD")
            "WRONG_UNLOCK_ATTEMPT" -> setOf("WRONG_UNLOCK_ATTEMPT", "WRONG_PASSWORD")
            else -> setOf(key)
        }
    }

    /** Attach [photoFile] to the best matching timeline row; returns event id or null. */
    fun attachSelfieToTimeline(context: Context, photoEventName: String, photoFile: File): String? {
        if (!photoFile.exists()) return null
        if (isNoSelfieEvent(photoEventName)) {
            Log.d(TAG, "Skip link — no-selfie event $photoEventName")
            return null
        }
        val storage = TimelineStorage(context)
        val eventId = storage.attachSelfiePath(
            photoEventName = photoEventName,
            photoPath = photoFile.absolutePath,
            photoModifiedMs = photoFile.lastModified(),
        )
        if (eventId != null) {
            Log.i(TAG, "Linked selfie ${photoFile.name} → event $eventId")
        } else {
            Log.w(TAG, "No timeline row matched selfie ${photoFile.name} ($photoEventName)")
        }
        return eventId
    }

    /**
     * Build vault `selfies` array: metadata paths first, then disk match for orphans.
     * Newest events preferred; size + count capped for Drive appData limits.
     */
    fun collectSelfieBlobs(context: Context, entries: List<TimelineEntry>): JSONArray {
        val arr = JSONArray()
        var count = 0
        var bytes = 0L
        val usedPaths = HashSet<String>()

        fun tryAdd(eventId: String, eventType: String, atMs: Long, file: File): Boolean {
            if (isNoSelfieEvent(eventType)) return false
            if (count >= MAX_SELFIES || bytes >= MAX_BYTES_TOTAL) return false
            val path = file.absolutePath
            if (!usedPaths.add(path)) return false
            if (!file.exists() || file.length() <= 0 || file.length() > MAX_FILE_BYTES) return false
            return try {
                val raw = file.readBytes()
                if (bytes + raw.size > MAX_BYTES_TOTAL) return false
                arr.put(
                    JSONObject()
                        .put("eventId", eventId)
                        .put("eventType", eventType)
                        .put("atMs", atMs)
                        .put("fileName", file.name)
                        .put("mime", "image/jpeg")
                        .put("dataBase64", Base64.encodeToString(raw, Base64.NO_WRAP)),
                )
                bytes += raw.size
                count++
                true
            } catch (ex: Exception) {
                Log.w(TAG, "selfie skip $path", ex)
                false
            }
        }

        // Timeline is newest-first from SQLite.
        for (e in entries) {
            if (count >= MAX_SELFIES) break
            if (isNoSelfieEvent(e.eventType)) continue
            val path = metadataPath(e) ?: continue
            val at = parseEventMs(e.timestamp)
            tryAdd(e.id, e.eventType, at, File(path))
        }

        // Backfill: match leftover JPEGs on disk to events missing selfie_path.
        val photosDir = TimelineStorage(context).getPhotosDirectory()
        val photos = photosDir.listFiles()
            ?.filter { it.isFile && it.extension.lowercase() in listOf("jpg", "jpeg", "png") }
            ?.sortedByDescending { it.lastModified() }
            ?: emptyList()

        for (photo in photos) {
            if (count >= MAX_SELFIES) break
            if (usedPaths.contains(photo.absolutePath)) continue
            val match = matchPhotoToEntry(photo, entries) ?: continue
            if (isNoSelfieEvent(match.eventType)) continue
            tryAdd(match.id, match.eventType, parseEventMs(match.timestamp), photo)
            // Persist link for next sync / local UI
            if (metadataPath(match).isNullOrBlank()) {
                TimelineStorage(context).attachSelfiePath(
                    photoEventName = match.eventType,
                    photoPath = photo.absolutePath,
                    photoModifiedMs = photo.lastModified(),
                    preferredEventId = match.id,
                )
            }
        }

        Log.i(TAG, "Packed $count selfies ($bytes bytes) for Drive vault")
        return arr
    }

    fun photoPrefixFromName(name: String): String? {
        val m = PHOTO_NAME_RE.matchEntire(name) ?: return null
        return m.groupValues[1].uppercase(Locale.US)
    }

    private fun metadataPath(e: TimelineEntry): String? {
        val raw = e.metadata["selfie_path"] ?: e.metadata["photo_path"] ?: e.metadata["photoPath"]
        return raw?.toString()?.takeIf { it.isNotBlank() }
    }

    private fun matchPhotoToEntry(photo: File, entries: List<TimelineEntry>): TimelineEntry? {
        val pref = photoPrefixFromName(photo.name) ?: return null
        if (isNoSelfieEvent(pref)) return null
        val photoMs = photo.lastModified()
        var best: TimelineEntry? = null
        var bestDiff = MATCH_WINDOW_MS
        for (e in entries) {
            val expected = expectedPhotoPrefixes(e.eventType)
            if (expected.isEmpty()) continue
            if (!expected.any { prefixesMatch(pref, it) }) continue
            if (!metadataPath(e).isNullOrBlank()) continue
            val diff = abs(parseEventMs(e.timestamp) - photoMs)
            if (diff < bestDiff) {
                bestDiff = diff
                best = e
            }
        }
        if (best != null) return best
        // Wider fallback for slow camera wake
        bestDiff = FALLBACK_WINDOW_MS
        for (e in entries) {
            val expected = expectedPhotoPrefixes(e.eventType)
            if (expected.isEmpty()) continue
            if (!expected.any { prefixesMatch(pref, it) }) continue
            val diff = abs(parseEventMs(e.timestamp) - photoMs)
            if (diff < bestDiff) {
                bestDiff = diff
                best = e
            }
        }
        return best
    }

    private fun prefixesMatch(photoPref: String, expected: String): Boolean {
        if (photoPref == expected) return true
        return photoPref.replace("_", "") == expected.replace("_", "")
    }

    fun parseEventMs(timestamp: String): Long {
        return try {
            ISO_UTC.parse(timestamp)?.time ?: 0L
        } catch (_: Exception) {
            timestamp.toLongOrNull() ?: 0L
        }
    }
}
