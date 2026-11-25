package com.mrp

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.util.Size
import android.widget.FrameLayout
import android.widget.Toast
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.mrp.util.BatteryPowerPolicy
import com.mrp.util.CameraSessionGate
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * CameraX + ML Kit QR scanner. Returns RESULT_OK with EXTRA_PAYLOAD.
 * Never auto-opens payment or URL intents.
 * Power-aware: refuses to open under low battery; throttled analysis.
 */
class QrScanActivity : Activity(), LifecycleOwner {

    private val lifecycleRegistry = LifecycleRegistry(this)
    private val scanned = AtomicBoolean(false)
    private val analysisExecutor = Executors.newSingleThreadExecutor()
    private val lastAnalyzeMs = AtomicLong(0L)
    private var cameraProvider: ProcessCameraProvider? = null

    override val lifecycle: Lifecycle
        get() = lifecycleRegistry

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycleRegistry.currentState = Lifecycle.State.CREATED

        if (BatteryPowerPolicy.shouldBlockOptionalCamera(this)) {
            val pct = BatteryPowerPolicy.batteryPercent(this)
            Toast.makeText(
                this,
                "Battery low ($pct%). Charge to ${BatteryPowerPolicy.QR_MIN_PERCENT}%+ to use QR Protection.",
                Toast.LENGTH_LONG,
            ).show()
            setResult(RESULT_CANCELED)
            finish()
            return
        }

        val root = FrameLayout(this)
        val previewView = PreviewView(this)
        root.addView(
            previewView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )
        setContentView(root)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), REQ_CAMERA)
            return
        }
        startCamera(previewView)
    }

    override fun onStart() {
        super.onStart()
        lifecycleRegistry.currentState = Lifecycle.State.STARTED
    }

    override fun onResume() {
        super.onResume()
        lifecycleRegistry.currentState = Lifecycle.State.RESUMED
    }

    override fun onPause() {
        lifecycleRegistry.currentState = Lifecycle.State.STARTED
        releaseCamera()
        super.onPause()
    }

    override fun onStop() {
        lifecycleRegistry.currentState = Lifecycle.State.CREATED
        super.onStop()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_CAMERA && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            val previewView = PreviewView(this)
            setContentView(previewView)
            startCamera(previewView)
        } else {
            Toast.makeText(this, "Camera permission required", Toast.LENGTH_SHORT).show()
            setResult(RESULT_CANCELED)
            finish()
        }
    }

    private fun startCamera(previewView: PreviewView) {
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            try {
                if (BatteryPowerPolicy.shouldBlockOptionalCamera(this)) {
                    setResult(RESULT_CANCELED)
                    finish()
                    return@addListener
                }
                val provider = providerFuture.get()
                cameraProvider = provider
                CameraSessionGate.markQrActive(true)
                val preview = Preview.Builder().build()
                preview.setSurfaceProvider(previewView.surfaceProvider)
                val analysis = ImageAnalysis.Builder()
                    .setTargetResolution(Size(640, 480))
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                val scanner = BarcodeScanning.getClient()
                analysis.setAnalyzer(analysisExecutor) { imageProxy ->
                    if (scanned.get()) {
                        imageProxy.close()
                        return@setAnalyzer
                    }
                    val now = System.currentTimeMillis()
                    val last = lastAnalyzeMs.get()
                    if (now - last < ANALYZE_MIN_INTERVAL_MS) {
                        imageProxy.close()
                        return@setAnalyzer
                    }
                    lastAnalyzeMs.set(now)
                    val media = imageProxy.image
                    if (media == null) {
                        imageProxy.close()
                        return@setAnalyzer
                    }
                    val image = InputImage.fromMediaImage(media, imageProxy.imageInfo.rotationDegrees)
                    scanner.process(image)
                        .addOnSuccessListener { barcodes ->
                            val value = barcodes.firstOrNull { it.rawValue != null }?.rawValue
                            if (!value.isNullOrBlank() && scanned.compareAndSet(false, true)) {
                                runOnUiThread {
                                    setResult(
                                        RESULT_OK,
                                        android.content.Intent().putExtra(EXTRA_PAYLOAD, value.take(4096)),
                                    )
                                    finish()
                                }
                            }
                        }
                        .addOnCompleteListener { imageProxy.close() }
                }
                provider.unbindAll()
                provider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    analysis,
                )
            } catch (e: Exception) {
                Log.e(TAG, "Camera start failed", e)
                CameraSessionGate.markQrActive(false)
                Toast.makeText(this, "Camera unavailable", Toast.LENGTH_SHORT).show()
                setResult(RESULT_CANCELED)
                finish()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun releaseCamera() {
        try {
            cameraProvider?.unbindAll()
        } catch (_: Exception) {
        }
        CameraSessionGate.markQrActive(false)
    }

    override fun onDestroy() {
        releaseCamera()
        lifecycleRegistry.currentState = Lifecycle.State.DESTROYED
        analysisExecutor.shutdown()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_PAYLOAD = "payload"
        private const val REQ_CAMERA = 4201
        private const val TAG = "QrScanActivity"
        private const val ANALYZE_MIN_INTERVAL_MS = 220L
    }
}
