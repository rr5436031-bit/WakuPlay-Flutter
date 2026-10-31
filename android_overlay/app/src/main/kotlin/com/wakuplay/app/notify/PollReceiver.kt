package com.wakuplay.app.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class PollReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (!NotifyCore.configured(context)) return
        val app = context.applicationContext

        // Mode cepat: alarm ini hanya penjaga. Pastikan layanan latar hidup; kalau Android menolak memulainya
        // dari latar, jatuh ke satu kali pengecekan biasa di bawah.
        if (NotifyCore.fast(app)) {
            if (PollService.running || NotifyCore.startService(app)) {
                NotifyCore.schedule(app, NotifyCore.WATCHDOG_MS)
                return
            }
        }

        val pr = goAsync()
        Thread {
            var keep = true
            try {
                if (!NotifyCore.foreground) keep = NotifyCore.pollOnce(app)
            } catch (_: Throwable) {
                keep = true
            } finally {
                if (keep) {
                    val next = if (NotifyCore.fast(app)) 30000L else NotifyCore.sp(app).getLong("interval", NotifyCore.DEFAULT_INTERVAL_MS)
                    NotifyCore.schedule(app, next)
                } else NotifyCore.clear(app)
                pr.finish()
            }
        }.start()
    }
}
