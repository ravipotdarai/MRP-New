package com.mrp.domain.usecase

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHeadset
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.ActivityCompat
import com.mrp.data.local.SettingsStorage

/**
 * Reliable Bluetooth device connect/disconnect logging.
 * Broadcasts alone are flaky on Android 12+ without [BLUETOOTH_CONNECT];
 * profile proxies + ACL/profile intents cover both.
 */
class BluetoothConnectionMonitor(
    private val context: Context,
    private val onLink: (connected: Boolean, name: String, address: String) -> Unit
) {
    private val TAG = "BtConnectionMonitor"
    private val connected = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()
    private var headsetProxy: BluetoothProfile? = null
    private var a2dpProxy: BluetoothProfile? = null
    private var registered = false
    private val handler = Handler(Looper.getMainLooper())

    private val profileListener = object : BluetoothProfile.ServiceListener {
        override fun onServiceConnected(profile: Int, proxy: BluetoothProfile?) {
            when (profile) {
                BluetoothProfile.HEADSET -> {
                    headsetProxy = proxy
                    Log.i(TAG, "HEADSET proxy connected")
                }
                BluetoothProfile.A2DP -> {
                    a2dpProxy = proxy
                    Log.i(TAG, "A2DP proxy connected")
                }
            }
            refreshConnectedFromProxies()
        }

        override fun onServiceDisconnected(profile: Int) {
            when (profile) {
                BluetoothProfile.HEADSET -> headsetProxy = null
                BluetoothProfile.A2DP -> a2dpProxy = null
            }
        }
    }

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent == null) return
            if (!SettingsStorage(context).getSettings().captureOnBluetooth) return
            if (!hasConnectPermission()) {
                Log.w(TAG, "BLUETOOTH_CONNECT not granted — cannot read device link")
                return
            }
            val action = intent.action ?: return
            val device = readDevice(intent)
            when (action) {
                BluetoothDevice.ACTION_ACL_CONNECTED ->
                    emit(true, device)
                BluetoothDevice.ACTION_ACL_DISCONNECTED ->
                    emit(false, device)
                BluetoothAdapter.ACTION_CONNECTION_STATE_CHANGED -> {
                    val state = intent.getIntExtra(
                        BluetoothAdapter.EXTRA_CONNECTION_STATE,
                        BluetoothAdapter.STATE_DISCONNECTED
                    )
                    when (state) {
                        BluetoothAdapter.STATE_CONNECTED -> emit(true, device)
                        BluetoothAdapter.STATE_DISCONNECTED -> emit(false, device)
                    }
                }
                BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED -> {
                    val state = intent.getIntExtra(
                        BluetoothHeadset.EXTRA_STATE,
                        BluetoothProfile.STATE_DISCONNECTED
                    )
                    when (state) {
                        BluetoothProfile.STATE_CONNECTED -> emit(true, device)
                        BluetoothProfile.STATE_DISCONNECTED -> emit(false, device)
                    }
                }
                "android.bluetooth.a2dp.profile.action.CONNECTION_STATE_CHANGED" -> {
                    val state = intent.getIntExtra(
                        BluetoothProfile.EXTRA_STATE,
                        BluetoothProfile.STATE_DISCONNECTED
                    )
                    when (state) {
                        BluetoothProfile.STATE_CONNECTED -> emit(true, device)
                        BluetoothProfile.STATE_DISCONNECTED -> emit(false, device)
                    }
                }
            }
        }
    }

    /** Start if not already running; safe to call after permission is granted later. */
    fun ensureStarted() {
        if (registered) return
        start()
    }

    @SuppressLint("MissingPermission")
    fun start() {
        if (registered) return
        if (!hasConnectPermission()) {
            Log.w(TAG, "start skipped — grant Nearby devices / BLUETOOTH_CONNECT")
            return
        }
        val filter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
            addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
            addAction(BluetoothAdapter.ACTION_CONNECTION_STATE_CHANGED)
            addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED)
            addAction("android.bluetooth.a2dp.profile.action.CONNECTION_STATE_CHANGED")
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Context.RECEIVER_EXPORTED
        } else {
            0
        }
        try {
            context.registerReceiver(receiver, filter, flags)
            registered = true
            Log.i(TAG, "BluetoothConnectionMonitor registered")
        } catch (e: Exception) {
            Log.e(TAG, "registerReceiver", e)
            return
        }

        val adapter = bluetoothAdapter() ?: return
        try {
            adapter.getProfileProxy(context, profileListener, BluetoothProfile.HEADSET)
            adapter.getProfileProxy(context, profileListener, BluetoothProfile.A2DP)
        } catch (e: Exception) {
            Log.w(TAG, "getProfileProxy", e)
        }

        handler.postDelayed({ refreshConnectedFromProxies() }, 1500)
    }

    fun stop() {
        if (registered) {
            try {
                context.unregisterReceiver(receiver)
            } catch (_: Exception) {
            }
            registered = false
        }
        val adapter = bluetoothAdapter()
        try {
            headsetProxy?.let { adapter?.closeProfileProxy(BluetoothProfile.HEADSET, it) }
            a2dpProxy?.let { adapter?.closeProfileProxy(BluetoothProfile.A2DP, it) }
        } catch (_: Exception) {
        }
        headsetProxy = null
        a2dpProxy = null
        connected.clear()
    }

    @SuppressLint("MissingPermission")
    private fun refreshConnectedFromProxies() {
        if (!hasConnectPermission()) return
        val now = linkedSetOf<String>()
        val byAddr = mutableMapOf<String, BluetoothDevice>()
        for (proxy in listOfNotNull(headsetProxy, a2dpProxy)) {
            try {
                for (d in proxy.connectedDevices.orEmpty()) {
                    val addr = try {
                        d.address
                    } catch (_: SecurityException) {
                        null
                    } ?: continue
                    now.add(addr)
                    byAddr[addr] = d
                }
            } catch (e: SecurityException) {
                Log.w(TAG, "refreshConnected SecurityException", e)
            } catch (e: Exception) {
                Log.w(TAG, "refreshConnected", e)
            }
        }
        for (addr in now) {
            if (connected.add(addr)) {
                emit(true, byAddr[addr], force = true)
            }
        }
        for (addr in connected.toList()) {
            if (addr !in now) {
                connected.remove(addr)
                onLink(false, addr, addr)
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun emit(connectedNow: Boolean, device: BluetoothDevice?, force: Boolean = false) {
        if (!SettingsStorage(context).getSettings().captureOnBluetooth) return
        val address = try {
            device?.address
        } catch (_: SecurityException) {
            null
        } ?: "unknown"
        val name = try {
            device?.name
        } catch (_: SecurityException) {
            null
        } ?: if (address != "unknown") address else "Bluetooth device"

        if (connectedNow) {
            if (!force && address != "unknown" && !connected.add(address)) return
            if (force && address != "unknown") connected.add(address)
        } else {
            if (address != "unknown") connected.remove(address)
        }
        Log.i(TAG, "${if (connectedNow) "CONNECTED" else "DISCONNECTED"} $name ($address)")
        onLink(connectedNow, name, address)
    }

    private fun readDevice(intent: Intent): BluetoothDevice? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
        }
    }

    private fun bluetoothAdapter(): BluetoothAdapter? {
        return try {
            val bm = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            bm?.adapter
        } catch (_: Exception) {
            null
        }
    }

    private fun hasConnectPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return ActivityCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED
    }
}
