package com.mrp

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import android.util.Log
import androidx.annotation.NonNull
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.*
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
            if (pin.length < 4 || pin.length > 6) {
                promise.reject("INVALID_PIN", "PIN must be 4-6 digits")
                return
            }

            if (!pin.all { it.isDigit() }) {
                promise.reject("INVALID_PIN", "PIN must contain only digits")
                return
            }

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
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear PIN", e)
            promise.reject("CLEAR_ERROR", "Failed to clear PIN", e)
        }
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

    companion object {
        private const val TAG = "PinLock"
        private const val PREFS_NAME = "mrp_pin_prefs"
        private const val KEY_PIN_HASH = "pin_hash"
        private const val KEY_SALT = "pin_salt"
    }
}