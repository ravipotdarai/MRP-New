package com.mrp.domain.guardian

import android.util.Log
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Debug-session NDJSON logger (session a8950b). Writes local file + optional ingest POST.
 */
object AgentDebugLog {
    private const val TAG = "MRP_DEBUG_A8950B"
    private const val SESSION = "a8950b"
    private const val INGEST = "http://127.0.0.1:7871/ingest/114dfd9d-216b-4f87-bb65-d5dbefab87ad"
    private val executor = Executors.newSingleThreadExecutor()
    @Volatile private var logFile: File? = null

    fun init(filesDir: File) {
        logFile = File(filesDir, "debug-a8950b.log")
    }

    fun log(hypothesisId: String, location: String, message: String, data: Map<String, Any?> = emptyMap()) {
        val payload = JSONObject()
            .put("sessionId", SESSION)
            .put("runId", "pre-fix")
            .put("hypothesisId", hypothesisId)
            .put("location", location)
            .put("message", message)
            .put("timestamp", System.currentTimeMillis())
            .put("data", JSONObject(data))
        val line = payload.toString()
        Log.i(TAG, line)
        executor.execute {
            try {
                logFile?.appendText(line + "\n")
            } catch (_: Exception) {
            }
            try {
                val conn = (URL(INGEST).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("X-Debug-Session-Id", SESSION)
                    doOutput = true
                    connectTimeout = 800
                    readTimeout = 800
                }
                conn.outputStream.use { it.write(line.toByteArray()) }
                conn.responseCode
                conn.disconnect()
            } catch (_: Exception) {
            }
        }
    }
}
