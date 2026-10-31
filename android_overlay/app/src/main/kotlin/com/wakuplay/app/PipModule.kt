package com.wakuplay.app

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Build
import android.provider.Settings
import android.util.Rational
import android.view.WindowManager
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject

/** PiP, layar penuh, orientasi, dan inset sistem (dulu PipPlugin.java). */
class PipModule(private val act: Activity, private val em: Emitter) {
    private var insetTop = 0.0
    private var insetBottom = 0.0
    private var insetKb = 0.0

    fun load() {
        act.runOnUiThread {
            try {
                val w = act.window
                WindowCompat.setDecorFitsSystemWindows(w, false)
                w.statusBarColor = Color.TRANSPARENT
                w.navigationBarColor = Color.TRANSPARENT
                if (Build.VERSION.SDK_INT >= 29) {
                    w.isNavigationBarContrastEnforced = false
                    w.isStatusBarContrastEnforced = false
                }
                if (Build.VERSION.SDK_INT >= 28) {
                    val lp = w.attributes
                    lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                    w.attributes = lp
                }
                val c = WindowCompat.getInsetsController(w, w.decorView)
                c.isAppearanceLightStatusBars = false
                c.isAppearanceLightNavigationBars = false

                val density = act.resources.displayMetrics.density.toDouble()
                ViewCompat.setOnApplyWindowInsetsListener(w.decorView) { v, insets ->
                    val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
                    insetTop = bars.top / density
                    insetBottom = bars.bottom / density
                    val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
                    insetKb = if (insets.isVisible(WindowInsetsCompat.Type.ime())) ime.bottom / density else 0.0
                    em.emit("Pip", "insets", insetsJson().toString())
                    ViewCompat.onApplyWindowInsets(v, insets)
                }
                ViewCompat.requestApplyInsets(w.decorView)
            } catch (_: Exception) { }
        }
    }

    private fun insetsJson() = JSONObject().put("top", insetTop).put("bottom", insetBottom).put("kb", insetKb)

    private fun params(autoEnter: Boolean): PictureInPictureParams {
        val b = PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9))
        if (Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(autoEnter)
        return b.build()
    }

    fun handle(method: String, args: Map<String, Any?>, result: MethodChannel.Result) {
        when (method) {
            "getDeviceId" -> {
                var id = ""
                try { id = Settings.Secure.getString(act.contentResolver, Settings.Secure.ANDROID_ID) ?: "" } catch (_: Exception) { }
                result.success(mapOf("id" to id))
            }
            "getInsets" -> result.success(mapOf("top" to insetTop, "bottom" to insetBottom, "kb" to insetKb))
            "setActive" -> {
                val active = args["active"] == true
                if (Build.VERSION.SDK_INT < 26) { result.success(null); return }
                act.runOnUiThread {
                    try { act.setPictureInPictureParams(params(active)) } catch (_: Exception) { }
                    result.success(null)
                }
            }
            "isActive" -> result.success(mapOf("active" to (Build.VERSION.SDK_INT >= 24 && act.isInPictureInPictureMode)))
            "enter" -> {
                if (Build.VERSION.SDK_INT < 26) { result.error("PIP", "PiP tidak didukung", null); return }
                act.runOnUiThread {
                    try { act.enterPictureInPictureMode(params(false)); result.success(null) }
                    catch (e: Exception) { result.error("PIP", "PiP gagal: " + e.message, null) }
                }
            }
            "setLandscape" -> {
                val on = args["enabled"] == true
                act.runOnUiThread {
                    try {
                        act.requestedOrientation = if (on) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                        if (Build.VERSION.SDK_INT >= 28) {
                            val lp = act.window.attributes
                            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                            act.window.attributes = lp
                        }
                    } catch (_: Exception) { }
                    result.success(null)
                }
            }
            "setImmersive" -> {
                val on = args["enabled"] == true
                act.runOnUiThread {
                    try {
                        val w = act.window
                        val c = WindowCompat.getInsetsController(w, w.decorView)
                        if (on) {
                            c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                            c.hide(WindowInsetsCompat.Type.systemBars())
                        } else c.show(WindowInsetsCompat.Type.systemBars())
                    } catch (_: Exception) { }
                    result.success(null)
                }
            }
            else -> result.notImplemented()
        }
    }
}
