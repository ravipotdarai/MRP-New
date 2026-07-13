package com.mrp.service

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.hardware.camera2.*
import android.media.Image
import android.media.ImageReader
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.WindowManager
import androidx.core.app.ActivityCompat
import com.mrp.data.local.TimelineStorage
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.*

class CameraCaptureActivity : Activity() {

    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var backgroundThread: HandlerThread? = null
    private var backgroundHandler: Handler? = null
    private var eventName: String = "unknown"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "CameraCaptureActivity created")

        // Show on top of lock screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        // Set window to transparent and minimize size to avoid blank screen flash on lockscreen
        window.setBackgroundDrawableResource(android.R.color.transparent)
        window.setDimAmount(0f)
        val params = window.attributes
        params.alpha = 0.0f
        params.width = 1
        params.height = 1
        window.attributes = params

        eventName = intent.getStringExtra("eventName") ?: "unknown"

        startBackgroundThread()
        takeSelfie()
    }

    private fun startBackgroundThread() {
        backgroundThread = HandlerThread("CameraCaptureBgThread").also { it.start() }
        backgroundHandler = Handler(backgroundThread!!.looper)
        
        // Failsafe: Force close the activity after 3 seconds if the image never arrives
        backgroundHandler?.postDelayed({
            if (!isFinishing && !isDestroyed) {
                Log.w(TAG, "Camera capture timed out. Force finishing to prevent blank screen.")
                cleanupAndFinish()
            }
        }, 3000)
    }

    private fun stopBackgroundThread() {
        backgroundThread?.quitSafely()
        try {
            if (Thread.currentThread() !== backgroundThread) {
                backgroundThread?.join()
            }
            backgroundThread = null
            backgroundHandler = null
        } catch (e: InterruptedException) {
            Log.e(TAG, "Interrupted stopping background thread", e)
        }
    }

    private fun takeSelfie() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "Camera permission not granted")
            finish()
            return
        }

        val cameraManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
        try {
            val cameraId = getFrontCameraId(cameraManager)
            if (cameraId == null) {
                Log.e(TAG, "No front camera found")
                finish()
                return
            }

            cameraManager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    cameraDevice = camera
                    createCaptureSession()
                }

                override fun onDisconnected(camera: CameraDevice) {
                    camera.close()
                    cameraDevice = null
                    finish()
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    Log.e(TAG, "Camera error: $error")
                    camera.close()
                    cameraDevice = null
                    finish()
                }
            }, backgroundHandler)
        } catch (e: Exception) {
            Log.e(TAG, "Error opening camera", e)
            finish()
        }
    }

    private fun getFrontCameraId(cameraManager: CameraManager): String? {
        for (cameraId in cameraManager.cameraIdList) {
            val characteristics = cameraManager.getCameraCharacteristics(cameraId)
            val facing = characteristics.get(CameraCharacteristics.LENS_FACING)
            if (facing == CameraCharacteristics.LENS_FACING_FRONT) {
                return cameraId
            }
        }
        return null
    }

    private fun createCaptureSession() {
        val camera = cameraDevice ?: return
        try {
            imageReader = ImageReader.newInstance(640, 480, ImageFormat.JPEG, 2).apply {
                setOnImageAvailableListener({ reader ->
                    val image = reader.acquireLatestImage()
                    if (image != null) {
                        savePhoto(image)
                        image.close()
                    }
                    cleanupAndFinish()
                }, backgroundHandler)
            }

            val surface = imageReader!!.surface
            val captureRequestBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE).apply {
                addTarget(surface)
                set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
                set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_OFF)
            }

            camera.createCaptureSession(
                listOf(surface),
                object : CameraCaptureSession.StateCallback() {
                    override fun onConfigured(session: CameraCaptureSession) {
                        captureSession = session
                        try {
                            session.capture(captureRequestBuilder.build(), object : CameraCaptureSession.CaptureCallback() {
                                override fun onCaptureCompleted(session: CameraCaptureSession, request: CaptureRequest, result: TotalCaptureResult) {
                                    Log.d(TAG, "Selfie capture completed")
                                }
                            }, backgroundHandler)
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to capture photo in session", e)
                            cleanupAndFinish()
                        }
                    }

                    override fun onConfigureFailed(session: CameraCaptureSession) {
                        Log.e(TAG, "Configuration failed")
                        cleanupAndFinish()
                    }
                },
                backgroundHandler
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create capture session", e)
            cleanupAndFinish()
        }
    }

    private fun savePhoto(image: Image) {
        val storage = TimelineStorage(this)
        val photosDir = storage.getPhotosDirectory()
        if (!photosDir.exists()) {
            photosDir.mkdirs()
        }

        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val safeEventName = eventName.replace(Regex("[^a-zA-Z0-9_]"), "_").uppercase(Locale.getDefault())
        val photoFile = File(photosDir, "${safeEventName}_$timestamp.jpg")

        try {
            val buffer = image.planes[0].buffer
            val bytes = ByteArray(buffer.remaining())
            buffer.get(bytes)
            FileOutputStream(photoFile).use { fos ->
                fos.write(bytes)
            }
            Log.d(TAG, "Photo saved successfully: ${photoFile.path}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save photo", e)
        }
    }

    private fun cleanupAndFinish() {
        try {
            captureSession?.close()
            cameraDevice?.close()
            imageReader?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error cleaning up camera", e)
        } finally {
            stopBackgroundThread()
            finish()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cleanupAndFinish()
    }

    companion object {
        private const val TAG = "CameraCaptureActivity"
    }
}
