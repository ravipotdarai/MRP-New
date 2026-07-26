package com.mrp.domain.usecase

import android.util.Base64
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * P5 vault backup crypto — AES-256-GCM with PIN-derived key (PBKDF2).
 * Salt + IV travel with the ciphertext; plaintext never uploaded.
 */
object VaultBackupCrypto {

    private const val ITERATIONS = 120_000
    private const val KEY_LEN_BITS = 256
    private const val SALT_LEN = 16
    private const val IV_LEN = 12
    private const val GCM_TAG_BITS = 128
    private const val MAGIC = "MRP1"

    fun encryptUtf8(plain: String, pin: String): ByteArray {
        val salt = ByteArray(SALT_LEN).also { SecureRandom().nextBytes(it) }
        val key = deriveKey(pin, salt)
        val iv = ByteArray(IV_LEN).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
        val ct = cipher.doFinal(plain.toByteArray(StandardCharsets.UTF_8))
        val magic = MAGIC.toByteArray(StandardCharsets.US_ASCII)
        return ByteBuffer.allocate(magic.size + 1 + SALT_LEN + IV_LEN + ct.size)
            .put(magic)
            .put(1) // version
            .put(salt)
            .put(iv)
            .put(ct)
            .array()
    }

    fun decryptUtf8(blob: ByteArray, pin: String): String {
        require(blob.size > MAGIC.length + 1 + SALT_LEN + IV_LEN) { "Backup file too small" }
        val buf = ByteBuffer.wrap(blob)
        val magicBytes = ByteArray(MAGIC.length)
        buf.get(magicBytes)
        require(String(magicBytes, StandardCharsets.US_ASCII) == MAGIC) { "Not an MRP backup" }
        val version = buf.get().toInt() and 0xff
        require(version == 1) { "Unsupported backup version $version" }
        val salt = ByteArray(SALT_LEN).also { buf.get(it) }
        val iv = ByteArray(IV_LEN).also { buf.get(it) }
        val ct = ByteArray(buf.remaining()).also { buf.get(it) }
        val key = deriveKey(pin, salt)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
        val plain = cipher.doFinal(ct)
        return String(plain, StandardCharsets.UTF_8)
    }

    fun toBase64(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.NO_WRAP)

    fun fromBase64(b64: String): ByteArray =
        Base64.decode(b64, Base64.NO_WRAP)

    private fun deriveKey(pin: String, salt: ByteArray): SecretKeySpec {
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val spec = PBEKeySpec(pin.toCharArray(), salt, ITERATIONS, KEY_LEN_BITS)
        val raw = factory.generateSecret(spec).encoded
        return SecretKeySpec(raw, "AES")
    }
}
