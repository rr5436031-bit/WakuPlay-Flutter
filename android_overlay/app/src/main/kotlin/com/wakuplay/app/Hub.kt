package com.wakuplay.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject
import com.wakuplay.app.notify.NotifyModule
import com.wakuplay.app.notify.LocalNotifModule

/** Pintu masuk semua panggilan native dari Dart (menggantikan registry plugin Capacitor). */
class Hub(private val act: Activity, messenger: BinaryMessenger) : MethodChannel.MethodCallHandler {
    private val ch = MethodChannel(messenger, "com.wakuplay.app/native")
    private val emitter = Emitter { plugin, event, json ->
        act.runOnUiThread {
            try {
                ch.invokeMethod("event", mapOf("plugin" to plugin, "event" to event, "json" to json))
            } catch (_: Throwable) { }
        }
    }
    private val pip = PipModule(act, emitter)
    private val notify = NotifyModule(act)
    private val ln = LocalNotifModule(act)
    private val gif = GifUrlModule(act, emitter)
    private val pay = PayModule(act, emitter)
    private var ready = false

    init {
        ch.setMethodCallHandler(this)
        pip.load()
    }

    fun dispose() {
        try { ch.setMethodCallHandler(null) } catch (_: Throwable) { }
        gif.dispose()
        pay.dispose()
    }

    fun onNewIntent(intent: Intent?) { if (ready) emitTap(intent) }

    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) { gif.onActivityResult(requestCode, resultCode, data) }

    fun onPermissionResult(requestCode: Int, grantResults: IntArray) { ln.onPermissionResult(requestCode, grantResults) }

    /** Ketukan notifikasi (aplikasi dibuka dari notifikasi) -> JS. */
    private fun emitTap(intent: Intent?) {
        if (intent == null) return
        if (intent.hasExtra("wp_type")) {
            val o = JSONObject()
            o.put("nid", intent.getLongExtra("wp_nid", 0L).toString())
            o.put("type", intent.getStringExtra("wp_type"))
            o.put("title", intent.getStringExtra("wp_title"))
            o.put("data", intent.getStringExtra("wp_data"))
            intent.removeExtra("wp_type")
            emitter.emit("WpNotify", "notifTap", o.toString())
        }
        if (intent.hasExtra("wp_ln_extra")) {
            val extra = try { JSONObject(intent.getStringExtra("wp_ln_extra") ?: "{}") } catch (_: Throwable) { JSONObject() }
            intent.removeExtra("wp_ln_extra")
            val o = JSONObject().put("notification", JSONObject().put("extra", extra))
            emitter.emit("LocalNotifications", "localNotificationActionPerformed", o.toString())
        }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        val name = call.method
        val dot = name.indexOf('.')
        if (dot < 0) { result.notImplemented(); return }
        val plugin = name.substring(0, dot)
        val m = name.substring(dot + 1)
        val args: Map<String, Any?> = (call.arguments as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value } ?: emptyMap()
        try {
            when (plugin) {
                "Pip" -> pip.handle(m, args, result)
                "WpNotify" -> notify.handle(m, args, result)
                "LocalNotifications" -> ln.handle(m, args, result)
                "GifUrl" -> gif.handle(m, args, result)
                "Pay" -> pay.handle(m, args, result)
                "App" -> when (m) {
                    "ready" -> { ready = true; emitTap(act.intent); result.success(null) }
                    "openUrl" -> {
                        try {
                            val i = Intent(Intent.ACTION_VIEW, Uri.parse(args["url"]?.toString() ?: ""))
                            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            act.startActivity(i)
                        } catch (_: Throwable) { }
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
                else -> result.notImplemented()
            }
        } catch (t: Throwable) {
            result.error("ERR", t.message ?: t.toString(), null)
        }
    }
}
