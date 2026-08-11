package com.mrp.domain.usecase

import android.content.Context
import android.util.Log
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.common.api.Scope
import com.mrp.data.local.SecureVaultStorage
import com.mrp.domain.model.EventTypes
import com.mrp.domain.model.StatusValues

/**
 * Encrypted secrets vault backup to Drive appData (mrp_secrets_vault.v1.enc).
 * Never uploads plaintext.
 */
object SecureVaultDriveSync {

    private const val TAG = "SecureVaultDriveSync"

    fun backup(context: Context, pin: String): Map<String, Any?> {
        return try {
            val token = obtainToken(context) ?: return mapOf("ok" to false, "error" to "not_signed_in")
            val client = DriveAppDataClient(token)
            val store = SecureVaultStorage(context)
            val blob = store.exportEncryptedBackup(pin)
            val existing = client.listAppDataFiles(SecureVaultStorage.DRIVE_FILE_NAME).firstOrNull()
            val remote = client.uploadOrReplace(SecureVaultStorage.DRIVE_FILE_NAME, blob, existing?.id)
            TimelineEventLogger(context).logEvent(
                EventTypes.VAULT_BACKUP_CREATED,
                StatusValues.ENABLED,
                mapOf(
                    "source" to "secure_vault",
                    "bytes" to blob.size,
                    "file_id_hash" to remote.id.take(8),
                ),
            )
            mapOf("ok" to true, "bytes" to blob.size, "fileId" to remote.id)
        } catch (e: Exception) {
            Log.e(TAG, "backup failed", e)
            TimelineEventLogger(context).logEvent(
                EventTypes.VAULT_BACKUP_FAILED,
                StatusValues.FAILED,
                mapOf("source" to "secure_vault", "error" to (e.message?.take(80) ?: "error")),
            )
            mapOf("ok" to false, "error" to (e.message ?: "backup_failed"))
        }
    }

    fun restore(context: Context, pin: String): Map<String, Any?> {
        return try {
            val token = obtainToken(context) ?: return mapOf("ok" to false, "error" to "not_signed_in")
            val client = DriveAppDataClient(token)
            val remote = client.listAppDataFiles(SecureVaultStorage.DRIVE_FILE_NAME).firstOrNull()
                ?: return mapOf("ok" to false, "error" to "no_backup")
            val blob = client.download(remote.id)
            val count = SecureVaultStorage(context).importEncryptedBackup(pin, blob, merge = true)
            TimelineEventLogger(context).logEvent(
                EventTypes.VAULT_BACKUP_RESTORED,
                StatusValues.ENABLED,
                mapOf("source" to "secure_vault", "count" to count),
            )
            mapOf("ok" to true, "count" to count)
        } catch (e: Exception) {
            Log.e(TAG, "restore failed", e)
            TimelineEventLogger(context).logEvent(
                EventTypes.VAULT_BACKUP_FAILED,
                StatusValues.FAILED,
                mapOf("source" to "secure_vault", "error" to (e.message?.take(80) ?: "error")),
            )
            mapOf("ok" to false, "error" to (e.message ?: "restore_failed"))
        }
    }

    private fun obtainToken(context: Context): String? {
        val account = GoogleSignIn.getLastSignedInAccount(context) ?: return null
        if (!GoogleSignIn.hasPermissions(account, Scope(DriveAppDataClient.SCOPE_APPDATA))) {
            return null
        }
        return try {
            val scopes = "oauth2:${DriveAppDataClient.SCOPE_APPDATA}"
            @Suppress("DEPRECATION")
            com.google.android.gms.auth.GoogleAuthUtil.getToken(context, account.account!!, scopes)
        } catch (e: Exception) {
            Log.w(TAG, "token", e)
            null
        }
    }
}
