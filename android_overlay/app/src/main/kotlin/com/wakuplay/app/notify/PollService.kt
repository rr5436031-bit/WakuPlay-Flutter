package com.wakuplay.app.notify

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Layanan latar (foreground service) yang menanyakan notifikasi baru ke server setiap beberapa detik
 * walau aplikasi ditutup. Alarm biasa ditunda Android (Doze) sampai berjam-jam; layanan ini tidak.
 */
class PollService : Service() {
    companion object {
        const val NID = 7101
        const val SVC_CHANNEL = "wakuplay_service"
        @Volatile var running = false
    }

    @Volatile private var alive = false
    private var worker: Thread? = null
    private var wl: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val app = applicationContext
        try {
            startFg(app)
        } catch (_: Throwable) {
            running = false
            NotifyCore.schedule(app, NotifyCore.FIRST_DELAY_MS)
            stopSelf()
            return START_NOT_STICKY
        }
        if (!NotifyCore.configured(app) || !NotifyCore.fast(app)) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (!alive) {
            alive = true
            running = true
            try {
                val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
                if (pm != null) {
                    wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WakuPlay:notify")
                    wl?.setReferenceCounted(false)
                    wl?.acquire()
                }
            } catch (_: Throwable) { }
            worker = Thread({ loop() }, "wp-notify-poll").also { it.start() }
        }
        return START_STICKY
    }

    private fun startFg(app: Context) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(SVC_CHANNEL) == null) {
            val ch = NotificationChannel(SVC_CHANNEL, "WakuPlay aktif di latar", NotificationManager.IMPORTANCE_MIN)
            ch.description = "Menjaga notifikasi tetap cepat datang walau aplikasi ditutup"
            ch.setShowBadge(false)
            nm.createNotificationChannel(ch)
        }
        var pi: PendingIntent? = null
        val open = app.packageManager.getLaunchIntentForPackage(app.packageName)
        if (open != null) {
            open.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            var f = PendingIntent.FLAG_UPDATE_CURRENT
            if (Build.VERSION.SDK_INT >= 23) f = f or PendingIntent.FLAG_IMMUTABLE
            pi = PendingIntent.getActivity(app, 7102, open, f)
        }
        val b = NotificationCompat.Builder(app, SVC_CHANNEL)
            .setSmallIcon(NotifyCore.smallIcon(app))
            .setColor(0xFF2F86FF.toInt())
            .setContentTitle("WakuPlay aktif")
            .setContentText("Menunggu notifikasi baru")
            .setOngoing(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
        if (pi != null) b.setContentIntent(pi)
        val n: Notification = b.build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NID, n)
    }

    private fun loop() {
        val app = applicationContext
        var fails = 0
        while (alive) {
            if (!NotifyCore.configured(app) || !NotifyCore.fast(app)) break
            val interval = maxOf(5000L, NotifyCore.sp(app).getLong("interval", 5000L))
            var wait = interval
            if (NotifyCore.foreground) {
                wait = 3000L
            } else {
                val keep = NotifyCore.pollOnce(app)
                if (!keep) { NotifyCore.clear(app); break }
                if (NotifyCore.lastOk) fails = 0
                else { fails = minOf(fails + 1, 5); wait = minOf(60000L, interval * (1L shl fails)) }
            }
            try { Thread.sleep(wait) } catch (_: InterruptedException) { break }
        }
        val wasAlive = alive
        alive = false
        running = false
        release()
        if (wasAlive) stopSelf()
    }

    private fun release() {
        try { if (wl?.isHeld == true) wl?.release() } catch (_: Throwable) { }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        NotifyCore.schedule(applicationContext, 15000L)
    }

    override fun onDestroy() {
        alive = false
        running = false
        worker?.interrupt()
        release()
        super.onDestroy()
    }
}
