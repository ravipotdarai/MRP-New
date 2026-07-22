package com.mrp.util

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Paint
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CaptureRequest
import android.media.Image
import android.util.Log
import android.util.Range
import android.util.Size
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

/**
 * Shared selfie JPEG helpers: pick a better capture size, set quality/orientation,
 * and physically rotate pixels so React Native Image (which ignores EXIF) shows upright.
 */
object SelfieCaptureUtil {

    private const val TAG = "SelfieCapture"
    /** Target ~1.5–2MP for clearer faces without huge files. */
    private const val TARGET_PIXELS = 1280 * 960
    private const val JPEG_QUALITY = 92

    fun chooseJpegSize(sizes: Array<Size>): Size {
        if (sizes.isEmpty()) return Size(1280, 960)
        val candidates = sizes.filter { it.width >= 800 && it.height >= 600 }
        val pool = if (candidates.isNotEmpty()) candidates else sizes.toList()
        return pool.minByOrNull { kotlin.math.abs(it.width * it.height - TARGET_PIXELS) }
            ?: Size(1280, 960)
    }

    fun sensorOrientation(chars: CameraCharacteristics): Int =
        chars.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0

    fun isFrontFacing(chars: CameraCharacteristics): Boolean =
        chars.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT

    /**
     * Still-capture tuning for lock-screen / no-preview selfies:
     * auto AE/AWB, slight exposure boost, high-quality color pipeline.
     * Orientation is fixed by rotating pixels on save (RN ignores EXIF).
     */
    fun applyStillCaptureSettings(
        builder: CaptureRequest.Builder,
        sensorOrientation: Int,
        chars: CameraCharacteristics? = null,
    ) {
        builder.set(CaptureRequest.JPEG_QUALITY, JPEG_QUALITY.toByte())
        builder.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
        builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
        builder.set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO)
        builder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_OFF)

        // Prefer continuous AF when available (front cameras often support it)
        val afModes = chars?.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES)
        if (afModes != null && afModes.contains(CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)) {
            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
        }

        // Brighten a bit — silent captures without preview often underexpose
        val aeRange: Range<Int>? = chars?.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE)
        if (aeRange != null) {
            val boost = (aeRange.upper.coerceAtMost(2)).coerceAtLeast(aeRange.lower)
            if (boost != 0) {
                builder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, boost)
            }
        } else {
            try {
                builder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, 1)
            } catch (_: Exception) { /* ignore */ }
        }

        try {
            builder.set(
                CaptureRequest.COLOR_CORRECTION_MODE,
                CaptureRequest.COLOR_CORRECTION_MODE_HIGH_QUALITY,
            )
        } catch (_: Exception) { /* ignore */ }
        try {
            builder.set(
                CaptureRequest.NOISE_REDUCTION_MODE,
                CaptureRequest.NOISE_REDUCTION_MODE_HIGH_QUALITY,
            )
        } catch (_: Exception) { /* ignore */ }
        try {
            builder.set(CaptureRequest.EDGE_MODE, CaptureRequest.EDGE_MODE_HIGH_QUALITY)
        } catch (_: Exception) { /* ignore */ }
    }

    fun saveUprightJpeg(
        image: Image,
        destFile: File,
        sensorOrientationDeg: Int,
        mirrorFront: Boolean = false,
    ): String {
        val buffer = image.planes[0].buffer
        val raw = ByteArray(buffer.remaining())
        buffer.get(raw)
        val corrected = rotateAndEnhanceJpeg(raw, sensorOrientationDeg, mirrorFront)
        destFile.parentFile?.mkdirs()
        FileOutputStream(destFile).use { it.write(corrected) }
        Log.d(
            TAG,
            "Saved selfie ${destFile.name} orient=${sensorOrientationDeg}° size=${corrected.size}",
        )
        return destFile.absolutePath
    }

    fun rotateAndEnhanceJpeg(
        jpegBytes: ByteArray,
        sensorOrientationDeg: Int,
        mirrorFront: Boolean = false,
    ): ByteArray {
        val bitmap = BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size)
            ?: return jpegBytes
        return try {
            var working = bitmap
            if (sensorOrientationDeg % 360 != 0 || mirrorFront) {
                val matrix = Matrix()
                matrix.postRotate(sensorOrientationDeg.toFloat())
                if (mirrorFront) matrix.postScale(-1f, 1f)
                val rotated = Bitmap.createBitmap(
                    bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true,
                )
                if (rotated !== bitmap) bitmap.recycle()
                working = rotated
            }
            val enhanced = enhanceBrightnessAndWarmth(working)
            if (enhanced !== working) working.recycle()
            val baos = ByteArrayOutputStream()
            enhanced.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, baos)
            enhanced.recycle()
            baos.toByteArray()
        } catch (e: Exception) {
            Log.w(TAG, "rotateAndEnhanceJpeg failed, writing raw", e)
            jpegBytes
        }
    }

    /**
     * Lift shadows and reduce cool/blue cast common on front-camera silent captures.
     */
    private fun enhanceBrightnessAndWarmth(src: Bitmap): Bitmap {
        val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        // R/G slightly up, B slightly down + lift brightness (last column)
        val matrix = ColorMatrix(
            floatArrayOf(
                1.12f, 0f, 0f, 0f, 18f,
                0f, 1.08f, 0f, 0f, 14f,
                0f, 0f, 0.90f, 0f, 8f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
        val paint = Paint(Paint.FILTER_BITMAP_FLAG)
        paint.colorFilter = ColorMatrixColorFilter(matrix)
        canvas.drawBitmap(src, 0f, 0f, paint)
        return out
    }

    fun jpegOutputSizes(chars: CameraCharacteristics): Array<Size> {
        val map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        return map?.getOutputSizes(ImageFormat.JPEG) ?: emptyArray()
    }
}
