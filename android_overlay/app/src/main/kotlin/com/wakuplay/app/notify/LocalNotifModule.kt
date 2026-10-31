package com.wakuplay.app.notify

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject

/** Pengganti @capacitor/local-notifications (izin, channel, tampilkan notifikasi lokal). */
class LocalNotifModule(private val act: Activity) {
    private val REQ = 7771
    private var pending: MethodChannel.Result? = null
    private val prefs get() = act.applicationContext.getSharedPreferences("wp_ln", Context.MODE_PRIVATE)

    private fun state(): String {
        val enabled = NotificationManagerCompat.from(act).areNotificationsEnabled()
        if (Build.VERSION.SDK_INT >= 33) {
            val g = ContextCompat.checkSelfPermission(act, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            if (g && enabled) return "granted"
            return if (!g && !prefs.getBoolean("asked", false)) "prompt" else "denied"
        }
        return if (enabled) "granted" else "denied"
    }

    fun onPermissionResult(requestCode: Int, grantResults: IntArray) {
        if (requestCode != REQ) return
        val r = pending ?: return
        pending = null
        prefs.edit().putBoolean("asked", true).apply()
        r.success(mapOf("display" to state()))
    }

    private fun str(v: Any?): String? = v?.toString()

    fun handle(method: String, args: Map<String, Any?>, result: MethodChannel.Result) {
        when (method) {
            "checkPermissions" -> result.success(mapOf("display" to state()))
            "requestPermissions" -> {
                if (Build.VERSION.SDK_INT < 33 || state() == "granted") { result.success(mapOf("display" to state())); return }
                pending?.success(mapOf("display" to state()))
                pending = result
                ActivityCompat.requestPermissions(act, arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ)
            }
            "createChannel" -> {
                if (Build.VERSION.SDK_INT >= 26) {
                    val id = str(args["id"]) ?: "wakuplay_app"
                    val importance = (args["importance"] as? Number)?.toInt() ?: NotificationManager.IMPORTANCE_HIGH
                    val ch = NotificationChannel(id, str(args["name"]) ?: "WakuPlay", importance)
                    ch.description = str(args["description"])
                    ch.enableVibration(args["vibration"] != false)
                    (act.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
                }
                result.success(null)
            }
            "schedule" -> {
                val list = args["notifications"] as? List<*> ?: emptyList<Any>()
                for (n in list) {
                    val m = n as? Map<*, *> ?: continue
                    try { show(m) } catch (_: Throwable) { }
                }
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    private fun show(m: Map<*, *>) {
        if (!NotificationManagerCompat.from(act).areNotificationsEnabled()) return
        val c = act.applicationContext
        val id = (m["id"] as? Number)?.toInt() ?: (System.currentTimeMillis() % 2000000000L).toInt()
        val channel = str(m["channelId"]) ?: "wakuplay_app"
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(channel) == null) {
                nm.createNotificationChannel(NotificationChannel(channel, "WakuPlay", NotificationManager.IMPORTANCE_HIGH))
            }
        }
        @Suppress("UNCHECKED_CAST")
        val extra = (m["extra"] as? Map<String, Any?>)?.let { JSONObject(it) } ?: JSONObject()
        val open = c.packageManager.getLaunchIntentForPackage(c.packageName) ?: return
        open.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        open.putExtra("wp_ln_extra", extra.toString())
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= 23) flags = flags or PendingIntent.FLAG_IMMUTABLE
        val pi = PendingIntent.getActivity(c, id, open, flags)
        val body = str(m["body"]) ?: ""
        val b = NotificationCompat.Builder(c, channel)
            .setSmallIcon(NotifyCore.smallIcon(c))
            .setColor(0xFF2F86FF.toInt())
            .setContentTitle(str(m["title"]) ?: "WakuPlay")
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
        try { NotificationManagerCompat.from(c).notify(id, b.build()) } catch (_: SecurityException) { }
    }
}
