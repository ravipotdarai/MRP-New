package com.mrp.domain.usecase

import android.Manifest
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log

/**
 * On-demand scan of non-system apps by sensitive permission groups.
 * Intended for Safety UI + vault snapshot — not continuous monitoring.
 */
class SensitivePermissionScanner(private val context: Context) {

    data class AppPerm(
        val packageName: String,
        val appName: String,
        val permissions: List<String>,
    )

    private val pm: PackageManager = context.packageManager

    fun appsWithSms(): List<AppPerm> = scan(
        setOf(
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.RECEIVE_SMS,
        )
    )

    fun appsWithCamera(): List<AppPerm> = scan(setOf(Manifest.permission.CAMERA))

    fun appsWithMicrophone(): List<AppPerm> = scan(setOf(Manifest.permission.RECORD_AUDIO))

    /** Sideloaded / high-risk apps with SMS+Contacts or SMS+Camera combos (for timeline rules). */
    fun dataRiskCandidates(limit: Int = 40): List<AppPerm> {
        return try {
            val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            apps.asSequence()
                .filter { (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 }
                .filter { (it.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0 }
                .filter { it.packageName != context.packageName }
                .mapNotNull { ai ->
                    val perms = requested(ai.packageName)
                    val interesting = mutableListOf<String>()
                    if (Manifest.permission.SEND_SMS in perms || Manifest.permission.READ_SMS in perms) {
                        interesting += "SMS"
                    }
                    if (Manifest.permission.CAMERA in perms) interesting += "CAMERA"
                    if (Manifest.permission.RECORD_AUDIO in perms) interesting += "MICROPHONE"
                    if (Manifest.permission.READ_CONTACTS in perms) interesting += "CONTACTS"
                    if (Manifest.permission.READ_EXTERNAL_STORAGE in perms ||
                        (Build.VERSION.SDK_INT >= 33 &&
                            "android.permission.READ_MEDIA_IMAGES" in perms)
                    ) {
                        interesting += "STORAGE"
                    }
                    val combo =
                        ("SMS" in interesting && "CONTACTS" in interesting) ||
                            ("SMS" in interesting && "CAMERA" in interesting) ||
                            ("CAMERA" in interesting && "MICROPHONE" in interesting && "STORAGE" in interesting)
                    if (!combo && interesting.size < 2) return@mapNotNull null
                    AppPerm(ai.packageName, label(ai), interesting.distinct())
                }
                .take(limit)
                .toList()
        } catch (e: Exception) {
            Log.w(TAG, "dataRiskCandidates limited", e)
            emptyList()
        }
    }

    private fun scan(wanted: Set<String>): List<AppPerm> {
        return try {
            val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            apps.asSequence()
                .filter { (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 }
                .filter { (it.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0 }
                .filter { it.packageName != context.packageName }
                .mapNotNull { ai ->
                    val hit = requested(ai.packageName).intersect(wanted)
                    if (hit.isEmpty()) null
                    else AppPerm(ai.packageName, label(ai), hit.sorted())
                }
                .sortedBy { it.appName.lowercase() }
                .toList()
        } catch (e: Exception) {
            Log.w(TAG, "scan failed (package visibility?)", e)
            emptyList()
        }
    }

    private fun requested(packageName: String): Set<String> {
        return try {
            val pi = pm.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS)
            pi.requestedPermissions?.toSet() ?: emptySet()
        } catch (_: Exception) {
            emptySet()
        }
    }

    private fun label(ai: ApplicationInfo): String {
        return try {
            pm.getApplicationLabel(ai).toString()
        } catch (_: Exception) {
            ai.packageName
        }
    }

    companion object {
        private const val TAG = "SensitivePermScan"
    }
}
