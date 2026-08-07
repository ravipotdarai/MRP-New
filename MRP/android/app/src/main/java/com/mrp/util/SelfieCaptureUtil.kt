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
import kotlin.math.abs

/**
 * Shared selfie JPEG helpers: pick a high-res capture size, set quality/orientation,
 * and physically rotate pixels so React Native Image (which ignores EXIF) shows upright.
 */
object SelfieCaptureUtil {

    private const val TAG = "SelfieCapture"
    /**
     * Aim for ~5MP stills (clear faces on web/phone). Cap below ~8MP so vault sync stays
     * within Drive appData budgets (see SelfieVaultPackager.MAX_FILE_BYTES).
     */
    private const val TARGET_PIXELS = 2592 * 1944 // ~5.0 MP
    private const val MAX_PIXELS = 3264 * 2448 // ~8.0 MP
    private const val MIN_PIXELS = 1280 * 720
    private const val JPEG_QUALITY = 96

    fun chooseJpegSize(sizes: Array<Size>): Size {
        if (sizes.isEmpty()) return Size(1920, 1080)
        val usable = sizes.filter { s ->
            val p = s.width.toLong() * s.height
            p in MIN_PIXELS.toLong()..MAX_PIXELS.toLong()
        }.ifEmpty {
            sizes.filter { it.width * it.height.toLong() <= MAX_PIXELS }.ifEmpty { sizes.toList() }
        }
        // Closest to ~5MP; prefer the larger of two equally close options.
        return usable.minWithOrNull(
            compareBy<Size> { abs(it.width.toLong() * it.height - TARGET_PIXELS) }
                .thenByDescending { it.width.toLong() * it.height },
        ) ?: Size(1920, 1080)
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
        @Suppress("UNUSED_PARAMETER") sensorOrientation: Int,
        chars: CameraCharacteristics? = null,
    ) {
        builder.set(CaptureRequest.JPEG_QUALITY, JPEG_QUALITY.toByte())
        builder.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
        builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
        builder.set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO)
        builder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_OFF)

        val afModes = chars?.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES)
        if (afModes != null && afModes.contains(CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)) {
            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
        }

        // Mild lift only — heavy positive EV washes detail / looks soft.
        val aeRange: Range<Int>? = chars?.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE)
        if (aeRange != null && aeRange.upper > 0) {
            val step = chars?.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP)?.toFloat() ?: 0.33f
            // Aim for about +0.3 to +0.5 EV
            val steps = ((0.4f / step).toInt()).coerceIn(1, aeRange.upper.coerceAtMost(2))
            builder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, steps)
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
            "Saved selfie ${destFile.name} orient=${sensorOrientationDeg}° bytes=${corrected.size}",
        )
        return destFile.absolutePath
    }

    fun rotateAndEnhanceJpeg(
        jpegBytes: ByteArray,
        sensorOrientationDeg: Int,
        mirrorFront: Boolean = false,
    ): ByteArray {
        val options = BitmapFactory.Options().apply {
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val bitmap = BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size, options)
            ?: return jpegBytes
        return try {
            val needsTransform = sensorOrientationDeg % 360 != 0 || mirrorFront
            var working = bitmap
            if (needsTransform) {
                val matrix = Matrix()
                matrix.postRotate(sensorOrientationDeg.toFloat())
                if (mirrorFront) matrix.postScale(-1f, 1f)
                val rotated = Bitmap.createBitmap(
                    bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true,
                )
                if (rotated !== bitmap) bitmap.recycle()
                working = rotated
            }
            // Only lift shadows when the frame is dark (silent captures).
            // Skipping preserve camera JPEG detail when already bright.
            val enhanced = if (needsShadowLift(working)) {
                val e = enhanceBrightnessAndWarmth(working)
                if (e !== working) working.recycle()
                e
            } else {
                working
            }
            val baos = ByteArrayOutputStream(enhanced.byteCount.coerceAtLeast(jpegBytes.size))
            enhanced.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, baos)
            enhanced.recycle()
            baos.toByteArray()
        } catch (e: Exception) {
            Log.w(TAG, "rotateAndEnhanceJpeg failed, writing raw", e)
            jpegBytes
        }
    }

    /** Sample a few pixels; return true when the frame is underexposed. */
    private fun needsShadowLift(src: Bitmap): Boolean {
        val w = src.width
        val h = src.height
        if (w < 8 || h < 8) return true
        var sum = 0L
        var n = 0
        val stepX = (w / 8).coerceAtLeast(1)
        val stepY = (h / 8).coerceAtLeast(1)
        var y = stepY / 2
        while (y < h) {
            var x = stepX / 2
            while (x < w) {
                val c = src.getPixel(x, y)
                val r = (c shr 16) and 0xff
                val g = (c shr 8) and 0xff
                val b = c and 0xff
                sum += (r * 3 + g * 6 + b) / 10
                n++
                x += stepX
            }
            y += stepY
        }
        val avg = if (n > 0) sum / n else 128
        return avg < 95
    }

    /**
     * Mild shadow lift + slight warmth. Kept gentle so faces stay sharp after recompress.
     */
    private fun enhanceBrightnessAndWarmth(src: Bitmap): Bitmap {
        val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val matrix = ColorMatrix(
            floatArrayOf(
                1.06f, 0f, 0f, 0f, 10f,
                0f, 1.04f, 0f, 0f, 8f,
                0f, 0f, 0.98f, 0f, 4f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
        val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
        paint.colorFilter = ColorMatrixColorFilter(matrix)
        canvas.drawBitmap(src, 0f, 0f, paint)
        return out
    }

    fun jpegOutputSizes(chars: CameraCharacteristics): Array<Size> {
        val map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        return map?.getOutputSizes(ImageFormat.JPEG) ?: emptyArray()
    }
}
