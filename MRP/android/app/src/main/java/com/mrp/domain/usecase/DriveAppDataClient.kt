package com.mrp.domain.usecase

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.DataOutputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * Google Drive appDataFolder client via REST (scope: drive.appdata only).
 */
class DriveAppDataClient(private val accessToken: String) {

    data class RemoteFile(val id: String, val name: String, val modifiedTime: String?, val size: Long?)

    fun listAppDataFiles(nameEquals: String? = null): List<RemoteFile> {
        val q = if (nameEquals.isNullOrBlank()) {
            "trashed=false"
        } else {
            "name='$nameEquals' and trashed=false"
        }
        return listAppDataQuery(q)
    }

    /** List by name prefix (Drive `name contains`); never downloads file bodies. */
    fun listAppDataFilesContaining(nameContains: String): List<RemoteFile> {
        val safe = nameContains.replace("'", "\\'")
        return listAppDataQuery("name contains '$safe' and trashed=false")
    }

    private fun listAppDataQuery(q: String): List<RemoteFile> {
        val out = mutableListOf<RemoteFile>()
        var pageToken: String? = null
        do {
            val url =
                "https://www.googleapis.com/drive/v3/files" +
                    "?spaces=appDataFolder" +
                    "&pageSize=1000" +
                    "&fields=nextPageToken,files(id,name,modifiedTime,size)" +
                    "&q=${java.net.URLEncoder.encode(q, "UTF-8")}" +
                    (if (pageToken != null) "&pageToken=${java.net.URLEncoder.encode(pageToken, "UTF-8")}" else "")
            val body = httpJson("GET", url, null)
            val files = body.optJSONArray("files") ?: JSONArray()
            for (i in 0 until files.length()) {
                val f = files.getJSONObject(i)
                out.add(
                    RemoteFile(
                        id = f.getString("id"),
                        name = f.optString("name"),
                        modifiedTime = f.optString("modifiedTime", null),
                        size = if (f.has("size")) f.optLong("size") else null
                    )
                )
            }
            pageToken = body.optString("nextPageToken").takeIf { it.isNotBlank() }
        } while (pageToken != null)
        return out
    }

    /**
     * Delete other MRP vault backup objects in appDataFolder, keeping [keepFileId].
     * Only touches names that start with [BACKUP_NAME_PREFIX] (never arbitrary Drive files).
     */
    fun deleteOldMrpBackups(keepFileId: String): Int {
        var deleted = 0
        for (f in listAppDataFiles(null)) {
            if (f.id == keepFileId) continue
            if (!f.name.startsWith(BACKUP_NAME_PREFIX)) continue
            try {
                delete(f.id)
                deleted++
            } catch (e: Exception) {
                Log.w(TAG, "purge ${f.id}", e)
            }
        }
        return deleted
    }

    fun uploadOrReplace(name: String, bytes: ByteArray, existingId: String?): RemoteFile {
        return if (existingId.isNullOrBlank()) {
            multipartCreate(name, bytes)
        } else {
            mediaUpdate(existingId, name, bytes)
        }
    }

    fun download(fileId: String): ByteArray {
        val url = "https://www.googleapis.com/drive/v3/files/$fileId?alt=media"
        return httpBytes("GET", url)
    }

    fun delete(fileId: String) {
        val url = "https://www.googleapis.com/drive/v3/files/$fileId"
        httpJson("DELETE", url, null, allowEmpty = true)
    }

    private fun multipartCreate(name: String, bytes: ByteArray): RemoteFile {
        val boundary = "mrp_" + System.currentTimeMillis()
        val meta = JSONObject()
            .put("name", name)
            .put("parents", JSONArray().put("appDataFolder"))
            .toString()
        val preamble =
            "--$boundary\r\n" +
                "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
                "$meta\r\n" +
                "--$boundary\r\n" +
                "Content-Type: application/octet-stream\r\n\r\n"
        val closing = "\r\n--$boundary--\r\n"
        val preambleBytes = preamble.toByteArray(StandardCharsets.UTF_8)
        val closingBytes = closing.toByteArray(StandardCharsets.UTF_8)
        val body = ByteArray(preambleBytes.size + bytes.size + closingBytes.size)
        System.arraycopy(preambleBytes, 0, body, 0, preambleBytes.size)
        System.arraycopy(bytes, 0, body, preambleBytes.size, bytes.size)
        System.arraycopy(closingBytes, 0, body, preambleBytes.size + bytes.size, closingBytes.size)

        val url =
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size"
        val conn = open(url, "POST")
        conn.setRequestProperty("Content-Type", "multipart/related; boundary=$boundary")
        conn.doOutput = true
        DataOutputStream(conn.outputStream).use { it.write(body) }
        val resp = readResponse(conn)
        val json = JSONObject(resp)
        return RemoteFile(
            id = json.getString("id"),
            name = json.optString("name", name),
            modifiedTime = json.optString("modifiedTime", null),
            size = if (json.has("size")) json.optLong("size") else bytes.size.toLong()
        )
    }

    private fun mediaUpdate(fileId: String, name: String, bytes: ByteArray): RemoteFile {
        val url =
            "https://www.googleapis.com/upload/drive/v3/files/$fileId?uploadType=media&fields=id,name,modifiedTime,size"
        val conn = open(url, "PATCH")
        conn.setRequestProperty("Content-Type", "application/octet-stream")
        conn.doOutput = true
        DataOutputStream(conn.outputStream).use { it.write(bytes) }
        val resp = readResponse(conn)
        val json = JSONObject(resp)
        // Best-effort rename
        try {
            httpJson(
                "PATCH",
                "https://www.googleapis.com/drive/v3/files/$fileId?fields=id,name",
                JSONObject().put("name", name).toString()
            )
        } catch (e: Exception) {
            Log.w(TAG, "rename after update", e)
        }
        return RemoteFile(
            id = json.optString("id", fileId),
            name = json.optString("name", name),
            modifiedTime = json.optString("modifiedTime", null),
            size = if (json.has("size")) json.optLong("size") else bytes.size.toLong()
        )
    }

    private fun httpJson(
        method: String,
        url: String,
        jsonBody: String?,
        allowEmpty: Boolean = false
    ): JSONObject {
        val conn = open(url, method)
        if (jsonBody != null) {
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            conn.doOutput = true
            DataOutputStream(conn.outputStream).use {
                it.write(jsonBody.toByteArray(StandardCharsets.UTF_8))
            }
        }
        val resp = readResponse(conn, allowEmpty)
        if (resp.isBlank()) return JSONObject()
        return JSONObject(resp)
    }

    private fun httpBytes(method: String, url: String): ByteArray {
        val conn = open(url, method)
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val bytes = stream?.readBytes() ?: ByteArray(0)
        if (code !in 200..299) {
            throw IllegalStateException("Drive HTTP $code: ${String(bytes).take(300)}")
        }
        return bytes
    }

    private fun open(url: String, method: String): HttpURLConnection {
        val conn = (URL(url).openConnection() as HttpURLConnection)
        conn.requestMethod = method
        conn.connectTimeout = 30_000
        conn.readTimeout = 60_000
        conn.setRequestProperty("Authorization", "Bearer $accessToken")
        return conn
    }

    private fun readResponse(conn: HttpURLConnection, allowEmpty: Boolean = false): String {
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use(BufferedReader::readText) ?: ""
        if (code !in 200..299) {
            throw IllegalStateException("Drive HTTP $code: ${text.take(300)}")
        }
        if (text.isBlank() && !allowEmpty && code != 204) {
            return "{}"
        }
        return text
    }

    companion object {
        private const val TAG = "DriveAppData"
        const val BACKUP_FILE_NAME = "mrp_vault_backup.v1.enc"
        /** Only files with this prefix may be purged (P5-6). */
        const val BACKUP_NAME_PREFIX = "mrp_vault_backup"
        const val SCOPE_APPDATA = "https://www.googleapis.com/auth/drive.appdata"
        /** Allowed OAuth scopes for MRP Drive (P5-1). Never request broader Drive scopes. */
        val ALLOWED_SCOPES = setOf(SCOPE_APPDATA)
    }
}
