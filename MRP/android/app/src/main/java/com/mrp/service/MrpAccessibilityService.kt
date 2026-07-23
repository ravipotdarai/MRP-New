package com.mrp.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import com.mrp.data.local.SettingsStorage
import com.mrp.domain.model.*
import com.mrp.domain.usecase.TimelineEventLogger

/**
 * AccessibilityService for optional biometric failure detection and owner Instant Lock
 * via [GLOBAL_ACTION_LOCK_SCREEN] (no Device Admin force-lock policy).
 */
class MrpAccessibilityService : AccessibilityService() {

    private var wasLocked = false
    private var settings: SettingsStorage? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        settings = SettingsStorage(this)

        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                AccessibilityEvent.TYPE_ANNOUNCEMENT
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = 0
            notificationTimeout = 200
        }
        setServiceInfo(info)
        Log.d(TAG, "Accessibility service connected")
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onUnbind(intent: Intent?): Boolean {
        if (instance === this) instance = null
        return super.onUnbind(intent)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            val packageName = event.packageName?.toString() ?: ""
            val className = event.className?.toString() ?: ""

            Log.d(TAG, "Window changed: $packageName / $className")

            val isLockScreen = isLockScreenPackage(packageName, className)

            if (isLockScreen) {
                if (!wasLocked) {
                    wasLocked = true
                    Log.d(TAG, "Device locked: $packageName")
                    handleScreenLock()
                }
            } else if (wasLocked) {
                wasLocked = false
                Log.d(TAG, "Device unlocked: $packageName")
                handleScreenUnlock()
            }
        }

        val packageName = event.packageName?.toString() ?: ""
        val className = event.className?.toString() ?: ""
        val isLockPackage = isLockScreenPackage(packageName, className)
        if (wasLocked || isLockPackage) {
            val textNodes = event.text ?: emptyList()
            val contentDesc = event.contentDescription?.toString() ?: ""
            if (textNodes.isNotEmpty() || contentDesc.isNotEmpty()) {
                val textContent = (textNodes.joinToString(" ") + " " + contentDesc).lowercase()
                Log.d(TAG, "Lock screen text parsed: $textContent")

                val failureKeywords = listOf(
                    "not recognized", "try again", "no match", "fingerprint didn't match",
                    "fingerprint not recognized", "didn't recognize", "couldn't recognize",
                    "incorrect", "wrong fingerprint", "biometric", "face not recognized",
                    "pin incorrect", "pattern incorrect", "password incorrect",
                    "too many attempts", "unlock failed", "failed to unlock",
                    "clean sensor", "partial fingerprint", "couldn't verify",
                    "press harder", "move finger", "wrong", "error", "failed", "mismatch"
                )
                if (failureKeywords.any { textContent.contains(it) }) {
                    Log.d(TAG, "Unlock/Biometric failure detected via Accessibility: $textContent")

                    val currentSettings = try { this.settings?.getSettings() } catch (e: Exception) { null }
                    if (currentSettings?.isMonitoringEnabled == true && currentSettings.captureOnWrongUnlock) {
                        Thread {
                            try {
                                val eventLogger = TimelineEventLogger(this)
                                eventLogger.logEvent(
                                    eventType = EventTypes.WRONG_UNLOCK_ATTEMPT,
                                    status = StatusValues.FAILED,
                                    metadata = mapOf(
                                        "description" to "Biometric unlock failure detected",
                                        "source" to "AccessibilityService",
                                        "detected_text" to textContent
                                    )
                                )
                                Thread.sleep(500)
                                MrpMonitorService.requestPhoto(this, EventTypes.WRONG_UNLOCK_ATTEMPT)
                            } catch (e: Exception) {
                                Log.e(TAG, "Failed to log biometric failure", e)
                            }
                        }.start()
                    }
                }
            }
        }
    }

    override fun onInterrupt() {
        Log.d(TAG, "Accessibility interrupt")
    }

    private fun isLockScreenPackage(packageName: String, className: String): Boolean {
        val lockPackages = listOf(
            "com.android.systemui",
            "com.android.keyguard",
            "com.google.android.keyguard",
            "com.samsung.android.keyguard",
            "com.samsung.android.systemui",
            "miui.lockscreen",
            "com.miui.lockscreen",
            "com.cyanogenmod.keyguard",
            "org.lineageos.keyguard",
            "com.oneplus.keyguard",
            "com.huawei.systemui",
            "com.huawei.android.keyguard"
        )

        val lockClasses = listOf(
            "com.android.systemui.statusbar.phone.LockScreen",
            "com.android.keyguard.KeyguardView",
            "com.android.keyguard.KeyguardViewBase",
            "com.google.android.keyguard.KeyguardView",
            "com.google.android.keyguard.KeyguardViewBase",
            "com.samsung.android.keyguard.secKeyguard",
            "com.miui.lockscreen.LockScreen",
            "com.oneplus.keyguard.OpKeyguardView",
            "com.huawei.android.keyguard.KlmKeyguardView"
        )

        return lockPackages.any { packageName.startsWith(it) } ||
            lockClasses.any { className.startsWith(it) }
    }

    private fun handleScreenLock() {
        // Screen lock is handled by MrpMonitorService via BroadcastReceiver
    }

    private fun handleScreenUnlock() {
        // Screen unlock is handled by MrpMonitorService via BroadcastReceiver
    }

    companion object {
        private const val TAG = "MrpAccessibilityService"

        @Volatile
        private var instance: MrpAccessibilityService? = null

        fun lockScreenNow(): Boolean {
            val service = instance ?: return false
            return try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    service.performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)
                } else {
                    false
                }
            } catch (e: Exception) {
                Log.e(TAG, "lockScreenNow failed", e)
                false
            }
        }

        fun isConnected(): Boolean = instance != null
    }
}
