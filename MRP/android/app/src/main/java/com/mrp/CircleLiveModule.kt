package com.mrp

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ValueEventListener
import com.mrp.domain.usecase.CircleCrypto

/**
 * Firebase RTDB: circle directory + encrypted live relay (P4).
 *
 * circle_by_code/{code} -> circleId
 * circles/{circleId} -> metadata + members + groupKey
 * circle_live/{circleId}/{uid} -> encrypted point
 */
class CircleLiveModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var valueListener: ValueEventListener? = null
    private var listenRefPath: String? = null
    private var listenGroupKey: String? = null
    private var listenInviteCode: String? = null

    override fun getName(): String = "CircleLive"

    @ReactMethod
    fun getFirebaseUid(promise: Promise) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        promise.resolve(uid)
    }

    /** Create / upsert circle in RTDB so a second device can join by invite code. */
    @ReactMethod
    fun publishCircleDirectory(
        circleId: String,
        name: String,
        category: String,
        inviteCode: String,
        maxMembers: Int,
        groupKey: String,
        displayName: String,
        promise: Promise
    ) {
        val user = FirebaseAuth.getInstance().currentUser
        if (user == null) {
            promise.reject("NO_AUTH", "Sign in with Google for multi-device Circle")
            return
        }
        val code = inviteCode.trim().uppercase()
        val key = if (groupKey.isNotBlank()) groupKey else CircleCrypto.generateGroupKey()
        val circleRef = database().getReference("circles").child(circleId)
        val payload = hashMapOf<String, Any>(
            "id" to circleId,
            "name" to name,
            "category" to category,
            "inviteCode" to code,
            "maxMembers" to maxMembers,
            "groupKey" to key,
            "updatedAtMs" to System.currentTimeMillis(),
            "ownerUid" to user.uid
        )
        circleRef.updateChildren(payload)
            .continueWithTask {
                circleRef.child("members").child(user.uid).setValue(
                    mapOf(
                        "displayName" to displayName.ifBlank { "You" },
                        "role" to "owner",
                        "consentLive" to false,
                        "joinedAtMs" to System.currentTimeMillis()
                    )
                )
            }
            .continueWithTask {
                database().getReference("circle_by_code").child(code).setValue(circleId)
            }
            .addOnSuccessListener {
                val map = Arguments.createMap()
                map.putBoolean("ok", true)
                map.putString("groupKey", key)
                map.putString("circleId", circleId)
                promise.resolve(map)
            }
            .addOnFailureListener { e -> promise.reject("DIR_PUBLISH", e.message, e) }
    }

    @ReactMethod
    fun joinCircleByInvite(
        inviteCode: String,
        displayName: String,
        promise: Promise
    ) {
        val user = FirebaseAuth.getInstance().currentUser
        if (user == null) {
            promise.reject("NO_AUTH", "Sign in with Google to join a Circle")
            return
        }
        val code = inviteCode.trim().uppercase()
        database().getReference("circle_by_code").child(code).get()
            .addOnSuccessListener { snap ->
                val circleId = snap.getValue(String::class.java)
                if (circleId.isNullOrBlank()) {
                    promise.reject("NOT_FOUND", "No circle for that invite code")
                    return@addOnSuccessListener
                }
                val circleRef = database().getReference("circles").child(circleId)
                circleRef.get().addOnSuccessListener { circleSnap ->
                    if (!circleSnap.exists()) {
                        promise.reject("NOT_FOUND", "Circle missing")
                        return@addOnSuccessListener
                    }
                    val maxMembers = circleSnap.child("maxMembers").getValue(Int::class.java) ?: 8
                    val membersSnap = circleSnap.child("members")
                    if (membersSnap.childrenCount >= maxMembers && !membersSnap.hasChild(user.uid)) {
                        promise.reject("FULL", "Circle is full")
                        return@addOnSuccessListener
                    }
                    val member = mapOf(
                        "displayName" to displayName.ifBlank { "Member" },
                        "role" to if (membersSnap.hasChild(user.uid)) {
                            membersSnap.child(user.uid).child("role").getValue(String::class.java) ?: "member"
                        } else {
                            "member"
                        },
                        "consentLive" to (
                            membersSnap.child(user.uid).child("consentLive").getValue(Boolean::class.java)
                                ?: false
                            ),
                        "joinedAtMs" to System.currentTimeMillis()
                    )
                    circleRef.child("members").child(user.uid).setValue(member)
                        .addOnSuccessListener {
                            // Re-read so joiner gets groupKey + full roster after write.
                            circleRef.get()
                                .addOnSuccessListener { fresh ->
                                    promise.resolve(
                                        snapshotToCircleMap(
                                            if (fresh.exists()) fresh else circleSnap,
                                            circleId,
                                            user.uid
                                        )
                                    )
                                }
                                .addOnFailureListener {
                                    promise.resolve(snapshotToCircleMap(circleSnap, circleId, user.uid))
                                }
                        }
                        .addOnFailureListener { e -> promise.reject("JOIN", e.message, e) }
                }.addOnFailureListener { e -> promise.reject("JOIN", e.message, e) }
            }
            .addOnFailureListener { e -> promise.reject("JOIN", e.message, e) }
    }

    @ReactMethod
    fun setRemoteConsent(circleId: String, consentLive: Boolean, promise: Promise) {
        val user = FirebaseAuth.getInstance().currentUser
        if (user == null) {
            promise.reject("NO_AUTH", "Sign in required")
            return
        }
        database().getReference("circles").child(circleId).child("members").child(user.uid)
            .child("consentLive").setValue(consentLive)
            .addOnSuccessListener { promise.resolve(true) }
            .addOnFailureListener { e -> promise.reject("CONSENT", e.message, e) }
    }

    @ReactMethod
    fun fetchRemoteCircle(circleId: String, promise: Promise) {
        val user = FirebaseAuth.getInstance().currentUser
        if (user == null) {
            promise.reject("NO_AUTH", "Sign in required")
            return
        }
        database().getReference("circles").child(circleId).get()
            .addOnSuccessListener { snap ->
                if (!snap.exists()) {
                    promise.reject("NOT_FOUND", "Circle not found")
                    return@addOnSuccessListener
                }
                promise.resolve(snapshotToCircleMap(snap, circleId, user.uid))
            }
            .addOnFailureListener { e -> promise.reject("FETCH", e.message, e) }
    }

    @ReactMethod
    fun publishLivePoint(
        circleId: String,
        lat: Double,
        lng: Double,
        displayName: String,
        colorIndex: Int,
        shareOn: Boolean,
        groupKey: String,
        inviteCode: String,
        promise: Promise
    ) {
        val user = FirebaseAuth.getInstance().currentUser
        if (user == null) {
            promise.reject("NO_AUTH", "Sign in with Google (Firebase Auth) to publish live points")
            return
        }
        try {
            val ref = database().getReference("circle_live").child(circleId).child(user.uid)
            if (!shareOn) {
                ref.removeValue()
                    .addOnSuccessListener { promise.resolve(true) }
                    .addOnFailureListener { e -> promise.reject("LIVE_OFF", e.message, e) }
                return
            }
            val key = when {
                groupKey.isNotBlank() -> CircleCrypto.keyFromGroupKey(groupKey)
                inviteCode.isNotBlank() -> CircleCrypto.keyFromInviteCode(inviteCode)
                else -> {
                    promise.reject("NO_KEY", "Missing group key for encryption")
                    return
                }
            }
            val (iv, ct) = CircleCrypto.encryptLatLng(lat, lng, key)
            val payload = mapOf(
                "iv" to iv,
                "ct" to ct,
                "atMs" to System.currentTimeMillis(),
                "shareOn" to true,
                "displayName" to displayName,
                "colorIndex" to colorIndex
            )
            ref.setValue(payload)
                .addOnSuccessListener { promise.resolve(true) }
                .addOnFailureListener { e -> promise.reject("LIVE_PUBLISH", e.message, e) }
        } catch (e: Exception) {
            promise.reject("LIVE_PUBLISH", e.message, e)
        }
    }

    @ReactMethod
    fun stopSharing(circleId: String, promise: Promise) {
        publishLivePoint(circleId, 0.0, 0.0, "", 0, false, "", "", promise)
    }

    @ReactMethod
    fun startListening(
        circleId: String,
        groupKey: String,
        inviteCode: String,
        ttlMs: Double,
        promise: Promise
    ) {
        try {
            stopListeningInternal()
            listenRefPath = circleId
            listenGroupKey = groupKey
            listenInviteCode = inviteCode
            val ttl = if (ttlMs > 0) ttlMs.toLong() else DEFAULT_TTL_MS
            val key = when {
                groupKey.isNotBlank() -> CircleCrypto.keyFromGroupKey(groupKey)
                inviteCode.isNotBlank() -> CircleCrypto.keyFromInviteCode(inviteCode)
                else -> null
            }
            val ref = database().getReference("circle_live").child(circleId)
            val listener = object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    val now = System.currentTimeMillis()
                    val arr = Arguments.createArray()
                    for (child in snapshot.children) {
                        val atMs = child.child("atMs").getValue(Long::class.java) ?: 0L
                        val shareOn = child.child("shareOn").getValue(Boolean::class.java) ?: false
                        if (!shareOn || atMs <= 0 || now - atMs > ttl) {
                            // TTL: ignore stale; best-effort delete own stale node
                            if (child.key == FirebaseAuth.getInstance().currentUser?.uid && atMs > 0 && now - atMs > ttl) {
                                child.ref.removeValue()
                            }
                            continue
                        }
                        var lat = child.child("lat").getValue(Double::class.java)
                        var lng = child.child("lng").getValue(Double::class.java)
                        val iv = child.child("iv").getValue(String::class.java)
                        val ct = child.child("ct").getValue(String::class.java)
                        if ((lat == null || lng == null) && key != null && !iv.isNullOrBlank() && !ct.isNullOrBlank()) {
                            val dec = CircleCrypto.decryptLatLng(iv, ct, key)
                            if (dec != null) {
                                lat = dec.first
                                lng = dec.second
                            }
                        }
                        if (lat == null || lng == null) continue
                        val map = Arguments.createMap()
                        map.putString("uid", child.key)
                        map.putDouble("lat", lat)
                        map.putDouble("lng", lng)
                        map.putDouble("atMs", atMs.toDouble())
                        map.putBoolean("shareOn", true)
                        map.putString(
                            "displayName",
                            child.child("displayName").getValue(String::class.java) ?: "Member"
                        )
                        map.putInt(
                            "colorIndex",
                            child.child("colorIndex").getValue(Int::class.java) ?: 0
                        )
                        arr.pushMap(map)
                    }
                    sendEvent("CircleLivePoints", arr)
                }

                override fun onCancelled(error: DatabaseError) {
                    Log.w(TAG, "listen cancelled: ${error.message}")
                }
            }
            valueListener = listener
            ref.addValueEventListener(listener)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("LIVE_LISTEN", e.message, e)
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        stopListeningInternal()
        promise.resolve(true)
    }

    private fun snapshotToCircleMap(snap: DataSnapshot, circleId: String, myUid: String): WritableMap {
        val members = Arguments.createArray()
        var liveReady = true
        var memberCount = 0
        for (m in snap.child("members").children) {
            memberCount++
            val consent = m.child("consentLive").getValue(Boolean::class.java) ?: false
            if (!consent) liveReady = false
            val mm = Arguments.createMap()
            mm.putString("id", m.key)
            mm.putString("displayName", m.child("displayName").getValue(String::class.java) ?: "Member")
            mm.putString("role", m.child("role").getValue(String::class.java) ?: "member")
            mm.putBoolean("consentLive", consent)
            mm.putDouble(
                "joinedAtMs",
                (m.child("joinedAtMs").getValue(Long::class.java) ?: 0L).toDouble()
            )
            members.pushMap(mm)
        }
        if (memberCount < 2) liveReady = false
        return Arguments.createMap().apply {
            putString("id", circleId)
            putString("name", snap.child("name").getValue(String::class.java) ?: "")
            putString("category", snap.child("category").getValue(String::class.java) ?: "family")
            putString("inviteCode", snap.child("inviteCode").getValue(String::class.java) ?: "")
            putInt("maxMembers", snap.child("maxMembers").getValue(Int::class.java) ?: 8)
            putInt("memberCount", memberCount)
            putBoolean("liveReady", liveReady)
            putString("groupKey", snap.child("groupKey").getValue(String::class.java) ?: "")
            putString("myUid", myUid)
            putArray("members", members)
        }
    }

    private fun stopListeningInternal() {
        val path = listenRefPath ?: return
        val listener = valueListener ?: return
        try {
            database().getReference("circle_live").child(path).removeEventListener(listener)
        } catch (e: Exception) {
            Log.w(TAG, "stopListening", e)
        }
        valueListener = null
        listenRefPath = null
        listenGroupKey = null
        listenInviteCode = null
    }

    private fun sendEvent(name: String, params: WritableArray) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(name, params)
    }

    companion object {
        private const val TAG = "CircleLive"
        private const val DEFAULT_TTL_MS = 15L * 60L * 1000L
        private const val DEFAULT_RTDB_URL =
            "https://mobileresilienceplatform-default-rtdb.firebaseio.com"
    }

    private fun databaseUrl(): String {
        return try {
            val fromRes = reactContext.getString(R.string.firebase_database_url)
            if (fromRes.isNotBlank()) fromRes else DEFAULT_RTDB_URL
        } catch (_: Exception) {
            DEFAULT_RTDB_URL
        }
    }

    private fun database(): FirebaseDatabase {
        return FirebaseDatabase.getInstance(databaseUrl())
    }
}
