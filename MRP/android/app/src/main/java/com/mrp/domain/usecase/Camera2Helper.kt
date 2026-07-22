package com.mrp.domain.usecase

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.*
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import com.mrp.util.SelfieCaptureUtil
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class Camera2Helper(private val context: Context) {

    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var backgroundHandler: Handler? = null
    private var backgroundThread: HandlerThread? = null
    private var sensorOrientation: Int = 0
    private var cameraChars: CameraCharacteristics? = null

    init {
        startBackgroundThread()
    }

    private fun startBackgroundThread() {
        backgroundThread = HandlerThread("CameraBackground").also { it.start() }
        backgroundHandler = Handler(backgroundThread!!.looper)
    }

    @SuppressLint("MissingPermission")
    fun takePicture(eventName: String, callback: (String) -> Unit) {
        val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val cameraId = getFrontCameraId(cameraManager) ?: run {
            Log.e(TAG, "No front camera found")
            return
        }

        try {
            val chars = cameraManager.getCameraCharacteristics(cameraId)
            cameraChars = chars
            sensorOrientation = SelfieCaptureUtil.sensorOrientation(chars)
            val chosen = SelfieCaptureUtil.chooseJpegSize(SelfieCaptureUtil.jpegOutputSizes(chars))

            imageReader = ImageReader.newInstance(chosen.width, chosen.height, ImageFormat.JPEG, 1).apply {
                setOnImageAvailableListener({ reader ->
                    val image = reader.acquireLatestImage()
                    if (image != null) {
                        val path = savePhoto(image, eventName)
                        image.close()
                        callback(path)
                    }
                }, backgroundHandler)
            }

            cameraManager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    cameraDevice = camera
                    createCaptureSession(eventName, callback)
                }

                override fun onDisconnected(camera: CameraDevice) {
                    camera.close()
                    cameraDevice = null
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    camera.close()
                    cameraDevice = null
                    Log.e(TAG, "Camera error: $error")
                }
            }, backgroundHandler)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open camera", e)
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

    private fun createCaptureSession(eventName: String, callback: (String) -> Unit) {
        val camera = cameraDevice ?: return
        val reader = imageReader ?: return

        try {
            val surface = reader.surface
            val captureRequestBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
            captureRequestBuilder.addTarget(surface)
            captureRequestBuilder.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
            SelfieCaptureUtil.applyStillCaptureSettings(
                captureRequestBuilder,
                sensorOrientation,
                cameraChars,
            )

            camera.createCaptureSession(
                listOf(surface),
                object : CameraCaptureSession.StateCallback() {
                    override fun onConfigured(session: CameraCaptureSession) {
                        captureSession = session
                        capturePhoto(eventName, callback)
                    }

                    override fun onConfigureFailed(session: CameraCaptureSession) {
                        Log.e(TAG, "Capture session configuration failed")
                    }
                },
                backgroundHandler
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create capture session", e)
        }
    }

    private fun capturePhoto(eventName: String, callback: (String) -> Unit) {
        val camera = cameraDevice ?: return
        val session = captureSession ?: return
        val reader = imageReader ?: return

        try {
            val captureBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
            captureBuilder.addTarget(reader.surface)
            captureBuilder.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
            SelfieCaptureUtil.applyStillCaptureSettings(captureBuilder, sensorOrientation, cameraChars)

            session.capture(captureBuilder.build(), object : CameraCaptureSession.CaptureCallback() {
                override fun onCaptureCompleted(
                    session: CameraCaptureSession,
                    request: CaptureRequest,
                    result: TotalCaptureResult
                ) {
                    closeCamera()
                }

                override fun onCaptureFailed(
                    session: CameraCaptureSession,
                    request: CaptureRequest,
                    failure: CaptureFailure
                ) {
                    Log.e(TAG, "Capture failed: ${failure.reason}")
                    closeCamera()
                }
            }, backgroundHandler)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to capture photo", e)
        }
    }

    private fun savePhoto(image: android.media.Image, eventName: String): String {
        val photosDir = File(context.getExternalFilesDir(null), "MRP").also {
            if (!it.exists()) it.mkdirs()
        }
        if (!photosDir.exists()) photosDir.mkdirs()

        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val safeEventName = eventName.replace(Regex("[^a-zA-Z0-9]"), "_").uppercase(Locale.getDefault())
        val photoFile = File(photosDir, "${safeEventName}_$timestamp.jpg")

        return try {
            SelfieCaptureUtil.saveUprightJpeg(
                image = image,
                destFile = photoFile,
                sensorOrientationDeg = sensorOrientation,
                mirrorFront = false,
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save photo", e)
            photoFile.absolutePath
        }
    }

    private fun closeCamera() {
        try {
            captureSession?.close()
            captureSession = null
            cameraDevice?.close()
            cameraDevice = null
            imageReader?.close()
            imageReader = null
        } catch (e: Exception) {
            Log.e(TAG, "Error closing camera", e)
        }
    }

    fun release() {
        closeCamera()
        backgroundThread?.quitSafely()
    }

    companion object {
        private const val TAG = "Camera2Helper"
    }
}
