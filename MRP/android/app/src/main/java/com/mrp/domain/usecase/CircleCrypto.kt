package com.mrp.domain.usecase

import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * AES-GCM for Circle live points. Group key is random; shared via circle directory.
 * Invite-code fallback derives a key when groupKey is missing (legacy).
 */
object CircleCrypto {
    private const val GCM_TAG_BITS = 128
    private const val IV_BYTES = 12

    fun generateGroupKey(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    fun keyFromInviteCode(inviteCode: String): ByteArray {
        return MessageDigest.getInstance("SHA-256")
            .digest(inviteCode.trim().uppercase().toByteArray(Charsets.UTF_8))
    }

    fun keyFromGroupKey(groupKeyB64: String): ByteArray {
        return Base64.decode(groupKeyB64, Base64.NO_WRAP)
    }

    fun encryptLatLng(lat: Double, lng: Double, key: ByteArray): Pair<String, String> {
        val iv = ByteArray(IV_BYTES)
        SecureRandom().nextBytes(iv)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(GCM_TAG_BITS, iv))
        val plain = "$lat,$lng".toByteArray(Charsets.UTF_8)
        val ct = cipher.doFinal(plain)
        return Base64.encodeToString(iv, Base64.NO_WRAP) to Base64.encodeToString(ct, Base64.NO_WRAP)
    }

    fun decryptLatLng(ivB64: String, ctB64: String, key: ByteArray): Pair<Double, Double>? {
        return try {
            val iv = Base64.decode(ivB64, Base64.NO_WRAP)
            val ct = Base64.decode(ctB64, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(GCM_TAG_BITS, iv))
            val plain = String(cipher.doFinal(ct), Charsets.UTF_8)
            val parts = plain.split(",")
            if (parts.size != 2) return null
            parts[0].toDouble() to parts[1].toDouble()
        } catch (_: Exception) {
            null
        }
    }
}
