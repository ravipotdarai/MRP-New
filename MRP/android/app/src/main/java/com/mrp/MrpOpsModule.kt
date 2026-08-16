package com.mrp

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.FirebaseDatabase
import com.mrp.billing.EntitlementCache
import com.mrp.data.local.DeviceConfigMirror
import com.mrp.ops.OpsAdmin
import java.util.concurrent.TimeUnit

/**
 * Admin catalog / broadcasts / subscription grants on RTDB `mrp_ops`.
 */
class MrpOpsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MrpOps"

    private fun db(): FirebaseDatabase {
        val url = try {
            val fromRes = reactContext.getString(R.string.firebase_database_url)
            if (fromRes.isNotBlank()) fromRes else DEFAULT_URL
        } catch (_: Exception) {
            DEFAULT_URL
        }
        return FirebaseDatabase.getInstance(url)
    }

    private fun requireUser(): com.google.firebase.auth.FirebaseUser? =
        FirebaseAuth.getInstance().currentUser

    private fun requireAdminUser(): com.google.firebase.auth.FirebaseUser? {
        val u = requireUser() ?: return null
        if (!OpsAdmin.isAdmin(u.email)) return null
        return u
    }

    @ReactMethod
    fun isCurrentUserAdmin(promise: Promise) {
        val u = requireUser()
        promise.resolve(OpsAdmin.isAdmin(u?.email))
    }

    @ReactMethod
    fun fetchOps(promise: Promise) {
        Thread {
            try {
                val root = Tasks.await(db().getReference("mrp_ops").get(), 12, TimeUnit.SECONDS)
                val catalog = root.child("catalog")
                val broadcasts = root.child("broadcasts")
                val uid = requireUser()?.uid
                val grant = if (uid != null) root.child("grants").child(uid) else null
                val inbox = Arguments.createArray()
                var latest = 0L
                val kids = mutableListOf<DataSnapshot>()
                broadcasts.children.forEach { kids.add(it) }
                kids.sortByDescending { it.child("atMs").getValue(Long::class.java) ?: 0L }
                for (b in kids.take(40)) {
                    val at = b.child("atMs").getValue(Long::class.java) ?: 0L
                    if (at > latest) latest = at
                    inbox.pushMap(
                        Arguments.createMap().apply {
                            putString("id", b.key)
                            putString("title", b.child("title").getValue(String::class.java) ?: "")
                            putString("body", b.child("body").getValue(String::class.java) ?: "")
                            putString("kind", b.child("kind").getValue(String::class.java) ?: "notice")
                            putDouble("atMs", at.toDouble())
                        },
                    )
                }
                val lastSeen = inboxPrefs().getLong(KEY_SEEN, 0L)
                val unread = kids.count { (it.child("atMs").getValue(Long::class.java) ?: 0L) > lastSeen }
                val map = Arguments.createMap().apply {
                    putMap("catalog", snapshotToMap(catalog))
                    putArray("inbox", inbox)
                    putInt("unread", unread)
                    putDouble("latestAtMs", latest.toDouble())
                    if (grant != null && grant.exists()) {
                        putMap("grant", snapshotToMap(grant))
                    } else {
                        putNull("grant")
                    }
                    putBoolean("admin", OpsAdmin.isAdmin(requireUser()?.email))
                }
                applyGrantToCache(grant)
                try {
                    DeviceConfigMirror.push(reactContext)
                } catch (_: Exception) {
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("OPS_FETCH", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun markInboxRead(promise: Promise) {
        inboxPrefs().edit().putLong(KEY_SEEN, System.currentTimeMillis()).apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun adminListUsers(promise: Promise) {
        if (requireAdminUser() == null) {
            promise.reject("OPS_ADMIN", "Admin only")
            return
        }
        Thread {
            try {
                val snap = Tasks.await(db().getReference("device_config").get(), 12, TimeUnit.SECONDS)
                val grants = Tasks.await(db().getReference("mrp_ops/grants").get(), 8, TimeUnit.SECONDS)
                val arr = Arguments.createArray()
                for (child in snap.children) {
                    val uid = child.key ?: continue
                    val g = grants.child(uid)
                    arr.pushMap(
                        Arguments.createMap().apply {
                            putString("uid", uid)
                            putString("accountEmail", child.child("accountEmail").getValue(String::class.java) ?: "")
                            putString("displayName", child.child("displayName").getValue(String::class.java) ?: "")
                            putString("phoneNumber", child.child("phoneNumber").getValue(String::class.java) ?: "")
                            putString("deviceMac", child.child("deviceMac").getValue(String::class.java) ?: "")
                            putString("tier", g.child("tier").getValue(String::class.java) ?: "")
                            putString("productId", g.child("productId").getValue(String::class.java) ?: "")
                            putString("note", g.child("note").getValue(String::class.java) ?: "")
                        },
                    )
                }
                promise.resolve(arr)
            } catch (e: Exception) {
                promise.reject("OPS_USERS", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun adminSaveCatalog(json: String, promise: Promise) {
        val admin = requireAdminUser()
        if (admin == null) {
            promise.reject("OPS_ADMIN", "Admin only")
            return
        }
        Thread {
            try {
                val parsed = org.json.JSONObject(json)
                val map = jsonToMap(parsed).toMutableMap()
                map["updatedAtMs"] = System.currentTimeMillis()
                map["updatedBy"] = admin.email ?: ""
                Tasks.await(db().getReference("mrp_ops/catalog").setValue(map), 12, TimeUnit.SECONDS)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("OPS_CATALOG", e.message, e)
            }
        }.start()
    }

    private fun jsonToMap(obj: org.json.JSONObject): Map<String, Any> {
        val out = HashMap<String, Any>()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            val v = obj.get(k)
            out[k] = jsonValue(v)
        }
        return out
    }

    private fun jsonValue(v: Any): Any {
        return when (v) {
            is org.json.JSONObject -> jsonToMap(v)
            is org.json.JSONArray -> {
                val list = ArrayList<Any>()
                for (i in 0 until v.length()) list.add(jsonValue(v.get(i)))
                list
            }
            org.json.JSONObject.NULL -> ""
            else -> v
        }
    }

    @ReactMethod
    fun adminPushBroadcast(title: String, body: String, kind: String, promise: Promise) {
        val admin = requireAdminUser()
        if (admin == null) {
            promise.reject("OPS_ADMIN", "Admin only")
            return
        }
        Thread {
            try {
                val ref = db().getReference("mrp_ops/broadcasts").push()
                val row = hashMapOf<String, Any>(
                    "title" to title.trim(),
                    "body" to body.trim(),
                    "kind" to kind.trim().ifBlank { "notice" },
                    "atMs" to System.currentTimeMillis(),
                    "actorEmail" to (admin.email ?: ""),
                )
                Tasks.await(ref.setValue(row), 12, TimeUnit.SECONDS)
                promise.resolve(ref.key)
            } catch (e: Exception) {
                promise.reject("OPS_PUSH", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun adminSetGrant(uid: String, tier: String, productId: String, note: String, promise: Promise) {
        val admin = requireAdminUser()
        if (admin == null) {
            promise.reject("OPS_ADMIN", "Admin only")
            return
        }
        val target = uid.trim()
        if (target.isEmpty()) {
            promise.reject("OPS_GRANT", "uid required")
            return
        }
        Thread {
            try {
                val t = tier.trim().lowercase().ifBlank { "free" }
                val row = hashMapOf<String, Any>(
                    "tier" to t,
                    "productId" to productId.trim(),
                    "note" to note.trim(),
                    "updatedAtMs" to System.currentTimeMillis(),
                    "actorEmail" to (admin.email ?: ""),
                )
                Tasks.await(db().getReference("mrp_ops/grants").child(target).setValue(row), 12, TimeUnit.SECONDS)
                val bRef = db().getReference("mrp_ops/broadcasts").push()
                Tasks.await(
                    bRef.setValue(
                        hashMapOf(
                            "title" to "Plan updated",
                            "body" to "Your MRP plan is now ${t.replaceFirstChar { it.uppercase() }}.",
                            "kind" to "subscription",
                            "atMs" to System.currentTimeMillis(),
                            "actorEmail" to (admin.email ?: ""),
                            "targetUid" to target,
                        ),
                    ),
                    12,
                    TimeUnit.SECONDS,
                )
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("OPS_GRANT", e.message, e)
            }
        }.start()
    }

    private fun applyGrantToCache(grant: DataSnapshot?) {
        if (grant == null || !grant.exists()) return
        val me = requireUser()?.uid ?: return
        if (grant.key != null && grant.key != me && grant.ref.parent?.key == "grants") {
            // grant snapshot is the uid node
        }
        val tier = grant.child("tier").getValue(String::class.java) ?: return
        val productId = grant.child("productId").getValue(String::class.java)
        val cache = EntitlementCache(reactContext)
        if (tier == "free") {
            cache.clearToFree()
            return
        }
        val expiry = System.currentTimeMillis() + 365L * 24 * 60 * 60 * 1000
        cache.writePaid(tier, "admin", productId, expiry)
    }

    private fun snapshotToMap(snap: DataSnapshot): com.facebook.react.bridge.WritableMap {
        val out = Arguments.createMap()
        if (!snap.exists()) return out
        val v = snap.value
        if (v is Map<*, *>) {
            putAny(out, v)
        }
        return out
    }

    @Suppress("UNCHECKED_CAST")
    private fun putAny(out: com.facebook.react.bridge.WritableMap, map: Map<*, *>) {
        for ((k, v) in map) {
            val key = k?.toString() ?: continue
            when (v) {
                null -> out.putNull(key)
                is Boolean -> out.putBoolean(key, v)
                is Long -> out.putDouble(key, v.toDouble())
                is Int -> out.putDouble(key, v.toDouble())
                is Double -> out.putDouble(key, v)
                is Float -> out.putDouble(key, v.toDouble())
                is String -> out.putString(key, v)
                is Map<*, *> -> {
                    val nested = Arguments.createMap()
                    putAny(nested, v)
                    out.putMap(key, nested)
                }
                is List<*> -> {
                    val arr = Arguments.createArray()
                    for (item in v) {
                        when (item) {
                            is Map<*, *> -> {
                                val nested = Arguments.createMap()
                                putAny(nested, item)
                                arr.pushMap(nested)
                            }
                            is Boolean -> arr.pushBoolean(item)
                            is Number -> arr.pushDouble(item.toDouble())
                            else -> arr.pushString(item?.toString() ?: "")
                        }
                    }
                    out.putArray(key, arr)
                }
                else -> out.putString(key, v.toString())
            }
        }
    }

    private fun inboxPrefs() =
        reactContext.getSharedPreferences("mrp_ops_inbox", android.content.Context.MODE_PRIVATE)

    companion object {
        private const val KEY_SEEN = "last_seen_ms"
        private const val DEFAULT_URL =
            "https://mobileresilienceplatform-default-rtdb.firebaseio.com"
    }
}
