package com.mrp

import android.app.Activity
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.*
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import java.security.MessageDigest
import java.util.UUID

/**
 * Google Sign-In session + local device registry (Firestore sync in P6).
 */
class MrpAuthModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var signInPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "MrpAuth"

    private val masterKey: MasterKey by lazy {
        MasterKey.Builder(reactContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
    }

    private val authPrefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            reactContext,
            PREFS_AUTH,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    @ReactMethod
    fun getAuthState(promise: Promise) {
        try {
            promise.resolve(buildAuthMap())
        } catch (e: Exception) {
            promise.reject("AUTH_STATE", e.message, e)
        }
    }

    /**
     * Ensure Firebase Auth session exists (required for RTDB Circle invites).
     * Google Sign-In alone is not enough — RTDB rules need FirebaseAuth.currentUser.
     */
    @ReactMethod
    fun ensureFirebaseAuth(promise: Promise) {
        val existing = FirebaseAuth.getInstance().currentUser
        if (existing != null) {
            promise.resolve(
                Arguments.createMap().apply {
                    putBoolean("ok", true)
                    putString("firebaseUid", existing.uid)
                    putBoolean("restored", false)
                }
            )
            return
        }
        val webClientId = try {
            reactContext.getString(R.string.google_web_client_id)
        } catch (e: Exception) {
            ""
        }
        if (webClientId.isBlank() || webClientId.startsWith("YOUR_")) {
            promise.reject(
                "NOT_CONFIGURED",
                "Google Web client ID missing — cannot link Firebase Auth for Circle."
            )
            return
        }
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestIdToken(webClientId)
            .build()
        val client = GoogleSignIn.getClient(reactContext, gso)
        client.silentSignIn()
            .addOnSuccessListener { account ->
                linkFirebaseWithGoogleAccount(account, promise, restored = true)
            }
            .addOnFailureListener { silentErr ->
                val last = GoogleSignIn.getLastSignedInAccount(reactContext)
                if (last != null && !last.idToken.isNullOrBlank()) {
                    linkFirebaseWithGoogleAccount(last, promise, restored = true)
                } else {
                    Log.w(TAG, "ensureFirebaseAuth: no Google session", silentErr)
                    promise.reject(
                        "NO_FIREBASE_AUTH",
                        "Sign in with Google from Hub → Account, then open Circle again. " +
                            "Invite codes only work after Firebase Auth is linked.",
                        silentErr
                    )
                }
            }
    }

    private fun linkFirebaseWithGoogleAccount(
        account: GoogleSignInAccount,
        promise: Promise,
        restored: Boolean
    ) {
        val idToken = account.idToken
        if (idToken.isNullOrBlank()) {
            promise.reject(
                "NO_ID_TOKEN",
                "Google session has no ID token. Sign out and Sign in again from Hub → Account."
            )
            return
        }
        persistAccount(account)
        registerDeviceLocallySilent()
        val credential = GoogleAuthProvider.getCredential(idToken, null)
        FirebaseAuth.getInstance().signInWithCredential(credential)
            .addOnSuccessListener { result ->
                promise.resolve(
                    Arguments.createMap().apply {
                        putBoolean("ok", true)
                        putString("firebaseUid", result.user?.uid)
                        putBoolean("restored", restored)
                    }
                )
            }
            .addOnFailureListener { e ->
                Log.w(TAG, "Firebase Auth link failed", e)
                promise.reject("FIREBASE_AUTH", e.message ?: "Firebase Auth failed", e)
            }
    }

    @ReactMethod
    fun isGoogleSignInConfigured(promise: Promise) {
        try {
            val id = reactContext.getString(R.string.google_web_client_id)
            val ok = id.isNotBlank() && !id.startsWith("YOUR_")
            promise.resolve(ok)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /** Package + SHA-1 for Firebase / Google Cloud Android OAuth client setup. */
    @ReactMethod
    fun getGoogleSignInDebugInfo(promise: Promise) {
        try {
            val webClientId = try {
                reactContext.getString(R.string.google_web_client_id)
            } catch (e: Exception) {
                ""
            }
            promise.resolve(Arguments.createMap().apply {
                putString("packageName", reactContext.packageName)
                putString("sha1", getSigningCertSha1())
                putString("sha256", getSigningCertSha256())
                putString("webClientId", webClientId)
                putBoolean(
                    "webClientConfigured",
                    webClientId.isNotBlank() && !webClientId.startsWith("YOUR_")
                )
            })
        } catch (e: Exception) {
            promise.reject("DEBUG_INFO", e.message, e)
        }
    }

    @ReactMethod
    fun signInWithGoogle(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity")
            return
        }
        val webClientId = try {
            reactContext.getString(R.string.google_web_client_id)
        } catch (e: Exception) {
            ""
        }
        if (webClientId.isBlank() || webClientId.startsWith("YOUR_")) {
            promise.reject(
                "NOT_CONFIGURED",
                "Set google_web_client_id in android/app/src/main/res/values/strings.xml (Firebase Web client ID)."
            )
            return
        }
        if (signInPromise != null) {
            promise.reject("IN_PROGRESS", "Sign-in already in progress")
            return
        }
        signInPromise = promise
        try {
            val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestEmail()
                .requestIdToken(webClientId)
                .build()
            val client = GoogleSignIn.getClient(activity, gso)
            activity.startActivityForResult(client.signInIntent, RC_SIGN_IN)
        } catch (e: Exception) {
            signInPromise = null
            promise.reject("SIGN_IN_START", e.message, e)
        }
    }

    @ReactMethod
    fun signOut(promise: Promise) {
        val activity = currentActivity
        try {
            authPrefs.edit()
                .remove(KEY_UID)
                .remove(KEY_EMAIL)
                .remove(KEY_DISPLAY_NAME)
                .remove(KEY_LINKED_AT)
                .apply()
            try {
                FirebaseAuth.getInstance().signOut()
            } catch (_: Exception) {
            }
            if (activity != null) {
                val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN).build()
                GoogleSignIn.getClient(activity, gso).signOut()
                    .addOnCompleteListener {
                        promise.resolve(true)
                    }
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("SIGN_OUT", e.message, e)
        }
    }

    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        try {
            promise.resolve(Arguments.createMap().apply {
                putString("deviceId", getOrCreateDeviceId())
                putString("label", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
                putString("model", Build.MODEL ?: "Unknown")
                putString("manufacturer", Build.MANUFACTURER ?: "Unknown")
                putString("osVersion", Build.VERSION.RELEASE ?: "")
                putInt("sdkInt", Build.VERSION.SDK_INT)
            })
        } catch (e: Exception) {
            promise.reject("DEVICE_INFO", e.message, e)
        }
    }

    @ReactMethod
    fun registerDeviceLocally(promise: Promise) {
        try {
            val uid = authPrefs.getString(KEY_UID, null)
            if (uid.isNullOrBlank()) {
                promise.reject("NOT_SIGNED_IN", "Sign in with Google first")
                return
            }
            val deviceId = getOrCreateDeviceId()
            val now = System.currentTimeMillis()
            authPrefs.edit()
                .putString(KEY_DEVICE_REGISTERED_UID, uid)
                .putLong(KEY_DEVICE_REGISTERED_AT, now)
                .apply()
            promise.resolve(Arguments.createMap().apply {
                putString("uid", uid)
                putString("deviceId", deviceId)
                putDouble("registeredAt", now.toDouble())
                putString("label", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
            })
        } catch (e: Exception) {
            promise.reject("REGISTER_DEVICE", e.message, e)
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != RC_SIGN_IN) return
        val promise = signInPromise
        signInPromise = null
        if (promise == null) return
        try {
            val task = GoogleSignIn.getSignedInAccountFromIntent(data)
            val account = task.getResult(ApiException::class.java)
            persistAccount(account)
            registerDeviceLocallySilent()
            val idToken = account.idToken
            if (!idToken.isNullOrBlank()) {
                val credential = GoogleAuthProvider.getCredential(idToken, null)
                FirebaseAuth.getInstance().signInWithCredential(credential)
                    .addOnCompleteListener { authTask ->
                        if (!authTask.isSuccessful) {
                            Log.w(TAG, "Firebase Auth link failed", authTask.exception)
                            promise.reject(
                                "FIREBASE_AUTH",
                                authTask.exception?.message
                                    ?: "Google signed in but Firebase Auth failed — Circle invites will not sync.",
                                authTask.exception
                            )
                        } else {
                            promise.resolve(buildAuthMap())
                        }
                    }
            } else {
                Log.w(TAG, "No Google idToken — Firebase RTDB live share needs requestIdToken")
                promise.reject(
                    "NO_ID_TOKEN",
                    "Google Sign-In returned no ID token. Check google_web_client_id (Web client) and SHA-1 in Firebase."
                )
            }
        } catch (e: ApiException) {
            Log.e(TAG, "Google sign-in failed code=${e.statusCode}", e)
            promise.reject("SIGN_IN_FAILED", mapSignInError(e.statusCode), e)
        } catch (e: Exception) {
            promise.reject("SIGN_IN_FAILED", e.message, e)
        }
    }

    override fun onNewIntent(intent: Intent) {}

    private fun mapSignInError(statusCode: Int): String {
        val pkg = reactContext.packageName
        val sha1 = getSigningCertSha1()
        return when (statusCode) {
            CommonStatusCodes.DEVELOPER_ERROR, 10 ->
                "Google Sign-In error 10 (DEVELOPER_ERROR).\n\n" +
                    "In Firebase Console → Project settings → Your apps → Android (com.mrp):\n" +
                    "1. Add SHA-1 fingerprint:\n   $sha1\n" +
                    "2. Download google-services.json into android/app/\n" +
                    "3. Use the Web client ID (not Android) in google_web_client_id\n\n" +
                    "Package: $pkg"
            CommonStatusCodes.NETWORK_ERROR ->
                "Google Sign-In network error. Check internet and try again."
            GoogleSignInStatusCodes.SIGN_IN_CANCELLED,
            CommonStatusCodes.CANCELED ->
                "Google Sign-In was cancelled."
            else -> "Google sign-in failed ($statusCode)"
        }
    }

    private fun getSigningCertSha1(): String = formatCertDigest("SHA-1")

    private fun getSigningCertSha256(): String = formatCertDigest("SHA-256")

    private fun formatCertDigest(algorithm: String): String {
        return try {
            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val info = reactContext.packageManager.getPackageInfo(
                    reactContext.packageName,
                    PackageManager.GET_SIGNING_CERTIFICATES
                )
                info.signingInfo?.apkContentsSigners ?: emptyArray()
            } else {
                @Suppress("DEPRECATION")
                val info = reactContext.packageManager.getPackageInfo(
                    reactContext.packageName,
                    PackageManager.GET_SIGNATURES
                )
                @Suppress("DEPRECATION")
                info.signatures ?: emptyArray()
            }
            val sig = signatures.firstOrNull() ?: return ""
            val digest = MessageDigest.getInstance(algorithm).digest(sig.toByteArray())
            digest.joinToString(":") { b -> "%02X".format(b) }
        } catch (e: Exception) {
            Log.w(TAG, "Could not read signing cert", e)
            ""
        }
    }

    private fun persistAccount(account: GoogleSignInAccount) {
        val uid = account.id ?: account.email ?: UUID.randomUUID().toString()
        authPrefs.edit()
            .putString(KEY_UID, uid)
            .putString(KEY_EMAIL, account.email ?: "")
            .putString(KEY_DISPLAY_NAME, account.displayName ?: "")
            .putLong(KEY_LINKED_AT, System.currentTimeMillis())
            .apply()
    }

    private fun registerDeviceLocallySilent() {
        val uid = authPrefs.getString(KEY_UID, null) ?: return
        authPrefs.edit()
            .putString(KEY_DEVICE_REGISTERED_UID, uid)
            .putLong(KEY_DEVICE_REGISTERED_AT, System.currentTimeMillis())
            .apply()
    }

    private fun getOrCreateDeviceId(): String {
        var id = authPrefs.getString(KEY_DEVICE_ID, null)
        if (id.isNullOrBlank()) {
            val androidId = Settings.Secure.getString(
                reactContext.contentResolver,
                Settings.Secure.ANDROID_ID
            ) ?: UUID.randomUUID().toString()
            id = "mrp_${androidId.take(16)}_${UUID.randomUUID().toString().take(8)}"
            authPrefs.edit().putString(KEY_DEVICE_ID, id).apply()
        }
        return id
    }

    private fun buildAuthMap(): WritableMap {
        val uid = authPrefs.getString(KEY_UID, null)
        val email = authPrefs.getString(KEY_EMAIL, null) ?: ""
        val signedIn = !uid.isNullOrBlank()
        return Arguments.createMap().apply {
            putBoolean("signedIn", signedIn)
            if (signedIn) {
                putString("uid", uid)
                putString("email", email)
                putString("emailMasked", maskEmail(email))
                putString("displayName", authPrefs.getString(KEY_DISPLAY_NAME, "") ?: "")
                putString("firebaseUid", FirebaseAuth.getInstance().currentUser?.uid)
                putString("deviceId", getOrCreateDeviceId())
                putDouble("linkedAt", (authPrefs.getLong(KEY_LINKED_AT, 0L)).toDouble())
                putDouble(
                    "deviceRegisteredAt",
                    authPrefs.getLong(KEY_DEVICE_REGISTERED_AT, 0L).toDouble()
                )
            }
        }
    }

    private fun maskEmail(email: String): String {
        if (email.isBlank() || !email.contains("@")) return ""
        val parts = email.split("@")
        val local = parts[0]
        val domain = parts[1]
        val maskedLocal = if (local.length <= 1) "*" else "${local.first()}••••"
        return "$maskedLocal@$domain"
    }

    companion object {
        private const val TAG = "MrpAuth"
        private const val RC_SIGN_IN = 4402
        private const val PREFS_AUTH = "mrp_auth_prefs"
        private const val KEY_UID = "uid"
        private const val KEY_EMAIL = "email"
        private const val KEY_DISPLAY_NAME = "display_name"
        private const val KEY_LINKED_AT = "linked_at"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_DEVICE_REGISTERED_UID = "device_registered_uid"
        private const val KEY_DEVICE_REGISTERED_AT = "device_registered_at"
    }
}
