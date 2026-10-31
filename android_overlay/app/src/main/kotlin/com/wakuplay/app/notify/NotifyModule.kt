package com.wakuplay.app.notify

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import io.flutter.plugin.common.MethodChannel

/** Dulu WpNotifyPlugin.java: konfigurasi polling notifikasi, status, dan jalan pintas pengaturan sistem. */
class NotifyModule(private val act: Activity) {
    private val ctx: Context get() = act.applicationContext

    private fun num(v: Any?, def: Long): Long = (v as? Number)?.toLong() ?: def

    private fun ignoringBattery(): Boolean = try {
        if (Build.VERSION.SDK_INT < 23) true
        else (ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isIgnoringBatteryOptimizations(ctx.packageName) == true
    } catch (_: Throwable) { false }

    private fun start(i: Intent) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        act.startActivity(i)
    }

    fun handle(method: String, args: Map<String, Any?>, result: MethodChannel.Result) {
        when (method) {
            "configure" -> {
                var url = args["url"]?.toString() ?: ""
                val key = args["key"]?.toString() ?: ""
                val device = args["device"]?.toString() ?: ""
                val secret = args["secret"]?.toString() ?: ""
                if (!url.startsWith("https://") || key.isEmpty() || device.isEmpty() || secret.length < 32) {
                    result.error("BAD", "data tidak valid", null); return
                }
                while (url.endsWith("/")) url = url.substring(0, url.length - 1)
                val interval = maxOf(5000L, num(args["interval"], NotifyCore.DEFAULT_INTERVAL_MS))
                NotifyCore.sp(ctx).edit()
                    .putString("url", url).putString("key", key).putString("device", device).putString("secret", secret)
                    .putString("uid", args["uid"]?.toString() ?: "")
                    .putString("since", args["since"]?.toString() ?: "")
                    .putLong("interval", interval).apply()
                NotifyCore.apply(ctx)
                result.success(null)
            }
            "setSpeed" -> {
                val interval = maxOf(5000L, num(args["interval"], NotifyCore.DEFAULT_INTERVAL_MS))
                NotifyCore.sp(ctx).edit().putLong("interval", interval).apply()
                NotifyCore.apply(ctx)
                result.success(null)
            }
            "status" -> result.success(mapOf(
                "configured" to NotifyCore.configured(ctx),
                "uid" to (NotifyCore.sp(ctx).getString("uid", "") ?: ""),
                "device" to (NotifyCore.sp(ctx).getString("device", "") ?: ""),
                "enabled" to NotificationManagerCompat.from(ctx).areNotificationsEnabled(),
                "ignoringBattery" to ignoringBattery(),
                "service" to PollService.running,
            ))
            "advance" -> {
                val t = args["since"]?.toString() ?: ""
                if (t.isNotEmpty()) {
                    val cur = NotifyCore.sp(ctx).getString("since", "")
                    NotifyCore.sp(ctx).edit().putString("since", NotifyCore.newer(cur, t)).apply()
                }
                result.success(null)
            }
            "setForeground" -> { NotifyCore.foreground = args["on"] == true; result.success(null) }
            "clear" -> { NotifyCore.clear(ctx); result.success(null) }
            "openBatterySettings" -> {
                val ignoring = ignoringBattery()
                var opened = false
                if (!ignoring && Build.VERSION.SDK_INT >= 23) {
                    try {
                        start(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + act.packageName)))
                        opened = true
                    } catch (_: Throwable) {
                        try { start(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); opened = true } catch (_: Throwable) { }
                    }
                }
                if (!opened) {
                    try { start(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + act.packageName))) } catch (_: Throwable) { }
                }
                result.success(mapOf("ignoring" to ignoring))
            }
            "openNotifSettings" -> {
                try {
                    val i = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    i.putExtra(Settings.EXTRA_APP_PACKAGE, act.packageName)
                    start(i)
                } catch (_: Throwable) {
                    try { start(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + act.packageName))) } catch (_: Throwable) { }
                }
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }
}
