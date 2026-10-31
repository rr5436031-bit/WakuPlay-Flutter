package com.wakuplay.app.notify

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Inti notifikasi tanpa Firebase: polling ke Supabase (RPC notif_poll) + layanan latar + alarm penjaga. */
object NotifyCore {
    const val PREF = "wp_notify"
    const val ACTION_POLL = "com.wakuplay.notify.POLL"
    const val CHANNEL = "wakuplay_notif_v2"
    const val DEFAULT_INTERVAL_MS = 5 * 60 * 1000L
    const val FIRST_DELAY_MS = 60 * 1000L
    const val WATCHDOG_MS = 5 * 60 * 1000L
    const val FAST_BELOW_MS = 120 * 1000L

    @Volatile var foreground = false
    @Volatile var lastOk = true

    fun sp(c: Context): SharedPreferences = c.applicationContext.getSharedPreferences(PREF, Context.MODE_PRIVATE)

    fun configured(c: Context): Boolean {
        val p = sp(c)
        return !p.getString("url", "").isNullOrEmpty() && !p.getString("device", "").isNullOrEmpty() && !p.getString("secret", "").isNullOrEmpty()
    }

    /** Mode cepat = layanan latar permanen (interval < 2 menit). Selain itu hanya alarm (hemat baterai). */
    fun fast(c: Context): Boolean = sp(c).getLong("interval", DEFAULT_INTERVAL_MS) < FAST_BELOW_MS

    fun startService(c: Context): Boolean = try {
        val app = c.applicationContext
        ContextCompat.startForegroundService(app, Intent(app, PollService::class.java))
        true
    } catch (_: Throwable) { false }

    fun stopService(c: Context) {
        try {
            val app = c.applicationContext
            app.stopService(Intent(app, PollService::class.java))
        } catch (_: Throwable) { }
    }

    /** Terapkan mode sesuai interval tersimpan: cepat -> layanan latar + alarm penjaga; hemat -> alarm saja. */
    fun apply(c: Context) {
        if (!configured(c)) return
        if (fast(c)) {
            if (!PollService.running && !startService(c)) schedule(c, FIRST_DELAY_MS)
            else schedule(c, WATCHDOG_MS)
        } else {
            stopService(c)
            schedule(c, FIRST_DELAY_MS)
        }
    }

    private fun alarmIntent(c: Context): PendingIntent {
        val i = Intent(c.applicationContext, PollReceiver::class.java).setAction(ACTION_POLL)
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= 23) flags = flags or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(c.applicationContext, 4711, i, flags)
    }

    fun schedule(c: Context, delayMs: Long) {
        try {
            val am = c.applicationContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val at = System.currentTimeMillis() + maxOf(15000L, delayMs)
            if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarmIntent(c))
            else am.set(AlarmManager.RTC_WAKEUP, at, alarmIntent(c))
        } catch (_: Throwable) { }
    }

    fun cancel(c: Context) {
        try {
            val am = c.applicationContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            am?.cancel(alarmIntent(c))
        } catch (_: Throwable) { }
    }

    fun clear(c: Context) {
        cancel(c)
        stopService(c)
        sp(c).edit().clear().apply()
        try { NotificationManagerCompat.from(c.applicationContext).cancelAll() } catch (_: Throwable) { }
    }

    private fun post(base: String, key: String, path: String, json: String, timeoutMs: Int): String {
        val h = URL(base + path).openConnection() as HttpURLConnection
        try {
            h.connectTimeout = timeoutMs
            h.readTimeout = timeoutMs
            h.requestMethod = "POST"
            h.doOutput = true
            h.setRequestProperty("Content-Type", "application/json")
            h.setRequestProperty("Accept", "application/json")
            h.setRequestProperty("apikey", key)
            if (key.startsWith("eyJ")) h.setRequestProperty("Authorization", "Bearer $key")
            val body = json.toByteArray(Charsets.UTF_8)
            h.setFixedLengthStreamingMode(body.size)
            h.outputStream.use { it.write(body) }
            val code = h.responseCode
            val stream = if (code in 200..299) h.inputStream else h.errorStream
            if (stream == null) throw Exception("HTTP $code")
            val sb = StringBuilder()
            stream.bufferedReader(Charsets.UTF_8).use { r ->
                val buf = CharArray(4096)
                while (sb.length < 400000) {
                    val n = r.read(buf)
                    if (n <= 0) break
                    sb.append(buf, 0, n)
                }
            }
            if (code !in 200..299) throw Exception("HTTP $code")
            return sb.toString()
        } finally {
            h.disconnect()
        }
    }

    private fun poster(url: String?): Bitmap? {
        if (url == null || !url.startsWith("https://")) return null
        var h: HttpURLConnection? = null
        return try {
            h = URL(url).openConnection() as HttpURLConnection
            h.connectTimeout = 4000
            h.readTimeout = 4000
            val o = BitmapFactory.Options()
            o.inSampleSize = 2
            h.inputStream.use { BitmapFactory.decodeStream(it, null, o) }
        } catch (_: Throwable) { null } finally { h?.disconnect() }
    }

    fun pollOnce(c: Context): Boolean {
        val app = c.applicationContext
        val p = sp(app)
        val url = p.getString("url", "") ?: ""
        val key = p.getString("key", "") ?: ""
        val device = p.getString("device", "") ?: ""
        val secret = p.getString("secret", "") ?: ""
        val since = p.getString("since", "") ?: ""
        if (url.isEmpty() || key.isEmpty() || device.isEmpty() || secret.isEmpty()) return false
        val deadline = System.currentTimeMillis() + 22000L
        return try {
            val req = JSONObject()
            req.put("p_device", device)
            req.put("p_secret", secret)
            req.put("p_since", if (since.isEmpty()) JSONObject.NULL else since)
            val res = JSONObject(post(url, key, "/rest/v1/rpc/notif_poll", req.toString(), 8000))
            if (!res.optBoolean("ok", false)) return false
            val items = res.optJSONArray("items")
            if (items != null && !foreground) {
                for (i in 0 until items.length()) {
                    val it = items.optJSONObject(i)
                    if (it != null) show(app, it, System.currentTimeMillis() < deadline - 6000L)
                }
            }
            val cur = res.optString("cursor", "")
            if (cur.isNotEmpty() && !foreground) p.edit().putString("since", newer(since, cur)).apply()
            lastOk = true
            true
        } catch (_: Throwable) {
            lastOk = false
            true
        }
    }

    fun newer(a: String?, b: String?): String {
        if (a.isNullOrEmpty()) return b ?: ""
        if (b.isNullOrEmpty()) return a
        return if (a.replace("Z", "+00:00") >= b.replace("Z", "+00:00")) a else b
    }

    fun ensureChannel(c: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        if (nm.getNotificationChannel(CHANNEL) != null) return
        val ch = NotificationChannel(CHANNEL, "WakuPlay", NotificationManager.IMPORTANCE_HIGH)
        ch.description = "Tag, balasan, teman, clan, chat pribadi, anime dan episode baru"
        ch.enableVibration(true)
        nm.createNotificationChannel(ch)
    }

    fun smallIcon(c: Context): Int {
        val icon = c.resources.getIdentifier("ic_stat_wakuplay", "drawable", c.packageName)
        return if (icon == 0) c.applicationInfo.icon else icon
    }

    fun show(c: Context, it: JSONObject, withPoster: Boolean) {
        try {
            if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return
            ensureChannel(c)
            val id = it.optLong("id", 0)
            val type = it.optString("type", "")
            val title = it.optString("title", "WakuPlay")
            val body = it.optString("body", "")
            val data = it.optJSONObject("data") ?: JSONObject()

            val open = c.packageManager.getLaunchIntentForPackage(c.packageName) ?: return
            open.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            open.putExtra("wp_nid", id)
            open.putExtra("wp_type", type)
            open.putExtra("wp_title", title)
            open.putExtra("wp_data", data.toString())
            var flags = PendingIntent.FLAG_UPDATE_CURRENT
            if (Build.VERSION.SDK_INT >= 23) flags = flags or PendingIntent.FLAG_IMMUTABLE
            val nid = (id % 2000000000L).toInt()
            val pi = PendingIntent.getActivity(c, nid, open, flags)

            val b = NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(smallIcon(c))
                .setColor(0xFF2F86FF.toInt())
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            if (withPoster && (type == "episode" || type == "new_anime")) {
                val bm = poster(data.optString("poster", ""))
                if (bm != null) b.setLargeIcon(bm)
            }
            NotificationManagerCompat.from(c).notify(nid, b.build())
        } catch (_: SecurityException) {
        } catch (_: Throwable) {
        }
    }
}
