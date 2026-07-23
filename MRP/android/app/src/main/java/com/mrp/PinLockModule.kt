package com.mrp

import android.content.SharedPreferences
import android.util.Base64
import android.util.Log
import androidx.annotation.NonNull
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.*
import com.mrp.auth.RecoveryWords
import java.security.MessageDigest
import java.security.SecureRandom

class PinLockModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PinLock"

    private val masterKey: MasterKey by lazy {
        MasterKey.Builder(reactContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
    }

    private val encryptedPrefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            reactContext,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    @ReactMethod
    fun isPinSet(promise: Promise) {
        try {
            val pinHash = encryptedPrefs.getString(KEY_PIN_HASH, null)
            promise.resolve(pinHash != null)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check PIN status", e)
            promise.reject("CHECK_ERROR", "Failed to check PIN status", e)
        }
    }

    @ReactMethod
    fun setPin(pin: String, promise: Promise) {
        try {
            if (!validatePinFormat(pin, promise)) return

            val salt = generateSalt()
            val pinHash = hashPin(pin, salt)

            encryptedPrefs.edit()
                .putString(KEY_PIN_HASH, pinHash)
                .putString(KEY_SALT, salt)
                .apply()

            Log.d(TAG, "PIN set successfully")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set PIN", e)
            promise.reject("SET_ERROR", "Failed to set PIN", e)
        }
    }

    @ReactMethod
    fun verifyPin(pin: String, promise: Promise) {
        try {
            val storedHash = encryptedPrefs.getString(KEY_PIN_HASH, null)
            val salt = encryptedPrefs.getString(KEY_SALT, null)

            if (storedHash == null || salt == null) {
                promise.reject("NO_PIN", "No PIN has been set")
                return
            }

            val inputHash = hashPin(pin, salt)
            val isValid = inputHash == storedHash

            promise.resolve(isValid)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to verify PIN", e)
            promise.reject("VERIFY_ERROR", "Failed to verify PIN", e)
        }
    }

    @ReactMethod
    fun clearPin(promise: Promise) {
        try {
            encryptedPrefs.edit()
                .remove(KEY_PIN_HASH)
                .remove(KEY_SALT)
                .remove(KEY_RECOVERY_HASH)
                .remove(KEY_RECOVERY_ACK)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear PIN", e)
            promise.reject("CLEAR_ERROR", "Failed to clear PIN", e)
        }
    }

    @ReactMethod
    fun generateRecoveryCode(promise: Promise) {
        try {
            val phrase = RecoveryWords.generatePhrase(12)
            promise.resolve(phrase)
        } catch (e: Exception) {
            promise.reject("RECOVERY_GEN", e.message, e)
        }
    }

    @ReactMethod
    fun saveRecoveryCode(phrase: String, promise: Promise) {
        try {
            val normalized = RecoveryWords.normalizePhrase(phrase)
            if (normalized.split(" ").size < 12) {
                promise.reject("INVALID_CODE", "Recovery code must be 12 words")
                return
            }
            encryptedPrefs.edit()
                .putString(KEY_RECOVERY_HASH, hashRecoveryPhrase(normalized))
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RECOVERY_SAVE", e.message, e)
        }
    }

    @ReactMethod
    fun hasRecoveryCode(promise: Promise) {
        try {
            promise.resolve(encryptedPrefs.getString(KEY_RECOVERY_HASH, null) != null)
        } catch (e: Exception) {
            promise.reject("RECOVERY_CHECK", e.message, e)
        }
    }

    @ReactMethod
    fun setRecoveryCodeAcknowledged(acknowledged: Boolean, promise: Promise) {
        try {
            encryptedPrefs.edit().putBoolean(KEY_RECOVERY_ACK, acknowledged).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RECOVERY_ACK", e.message, e)
        }
    }

    @ReactMethod
    fun hasRecoveryCodeAcknowledged(promise: Promise) {
        try {
            promise.resolve(encryptedPrefs.getBoolean(KEY_RECOVERY_ACK, false))
        } catch (e: Exception) {
            promise.reject("RECOVERY_ACK_CHECK", e.message, e)
        }
    }

    @ReactMethod
    fun resetPinWithRecoveryCode(newPin: String, phrase: String, promise: Promise) {
        try {
            if (!validatePinFormat(newPin, promise)) return
            val normalized = RecoveryWords.normalizePhrase(phrase)
            val stored = encryptedPrefs.getString(KEY_RECOVERY_HASH, null)
            if (stored == null) {
                promise.reject("NO_RECOVERY", "No recovery code was saved")
                return
            }
            if (hashRecoveryPhrase(normalized) != stored) {
                promise.reject("INVALID_CODE", "Recovery code does not match")
                return
            }
            val salt = generateSalt()
            encryptedPrefs.edit()
                .putString(KEY_PIN_HASH, hashPin(newPin, salt))
                .putString(KEY_SALT, salt)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RESET_RECOVERY", e.message, e)
        }
    }

    @ReactMethod
    fun resetPinAfterGoogleAuth(newPin: String, promise: Promise) {
        try {
            if (!validatePinFormat(newPin, promise)) return
            val resetAllowed = encryptedPrefs.getBoolean(KEY_GOOGLE_RESET_ALLOWED, false)
            if (!resetAllowed) {
                promise.reject("GOOGLE_AUTH_REQUIRED", "Sign in with Google first to reset PIN")
                return
            }
            val salt = generateSalt()
            encryptedPrefs.edit()
                .putString(KEY_PIN_HASH, hashPin(newPin, salt))
                .putString(KEY_SALT, salt)
                .remove(KEY_GOOGLE_RESET_ALLOWED)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RESET_GOOGLE", e.message, e)
        }
    }

    @ReactMethod
    fun allowPinResetViaGoogle(promise: Promise) {
        try {
            encryptedPrefs.edit().putBoolean(KEY_GOOGLE_RESET_ALLOWED, true).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RESET_FLAG", e.message, e)
        }
    }

    private fun validatePinFormat(pin: String, promise: Promise): Boolean {
        if (pin.length < 4 || pin.length > 6) {
            promise.reject("INVALID_PIN", "PIN must be 4-6 digits")
            return false
        }
        if (!pin.all { it.isDigit() }) {
            promise.reject("INVALID_PIN", "PIN must contain only digits")
            return false
        }
        return true
    }

    private fun generateSalt(): String {
        val salt = ByteArray(16)
        SecureRandom().nextBytes(salt)
        return Base64.encodeToString(salt, Base64.NO_WRAP)
    }

    private fun hashPin(pin: String, salt: String): String {
        val combined = pin + salt
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(combined.toByteArray())
        return Base64.encodeToString(hash, Base64.NO_WRAP)
    }

    private fun hashRecoveryPhrase(normalized: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(normalized.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(hash, Base64.NO_WRAP)
    }

    companion object {
        private const val TAG = "PinLock"
        private const val PREFS_NAME = "mrp_pin_prefs"
        private const val KEY_PIN_HASH = "pin_hash"
        private const val KEY_SALT = "pin_salt"
        private const val KEY_RECOVERY_HASH = "recovery_hash"
        private const val KEY_RECOVERY_ACK = "recovery_ack"
        private const val KEY_GOOGLE_RESET_ALLOWED = "google_reset_allowed"
    }
}