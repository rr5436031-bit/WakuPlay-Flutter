package com.wakuplay.app

import android.app.Activity
import android.app.Dialog
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.net.http.SslError
import android.text.TextUtils
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject

/** Dulu PayPlugin.java: jendela pembayaran Premium (SociaBuzz) dengan isi form otomatis + tangkap QR. */
class PayModule(private val act: Activity, private val em: Emitter) {
    private var dialog: Dialog? = null
    private var web: WebView? = null
    private var basePath = ""
    private var lastReported = ""
    private var fillJson = "{}"
    private var autoFill = true
    private var fillScript: String? = null

    private fun dp(v: Int): Int = Math.round(v * act.resources.displayMetrics.density)

    private fun loadScript(): String {
        fillScript?.let { return it }
        val s = try { act.assets.open("wp-pay-fill.js").bufferedReader(Charsets.UTF_8).use { it.readText() } } catch (_: Exception) { "" }
        fillScript = s
        return s
    }

    private fun isSocia(url: String?): Boolean = try {
        val u = Uri.parse(url ?: "")
        val h = u.host
        "https" == u.scheme && h != null && (h == "sociabuzz.com" || h.endsWith(".sociabuzz.com"))
    } catch (_: Exception) { false }

    private fun injectFill(v: WebView, url: String?) {
        if (url == null || !isSocia(url)) return
        val s = loadScript()
        if (s.isEmpty()) return
        v.evaluateJavascript("window.__WPAUTO=" + (if (autoFill) "true" else "false") + ";window.__WPFILL=" + fillJson + ";" + s, null)
    }

    private fun reportUrl(url: String?) {
        if (url == null || !isSocia(url)) return
        try {
            val u = Uri.parse(url)
            val clean = u.buildUpon().fragment(null).build().toString()
            val path = u.path ?: ""
            if (path == basePath || path == "$basePath/" || clean == lastReported) return
            lastReported = clean
            em.emit("Pay", "payUrl", JSONObject().put("url", clean).toString())
        } catch (_: Exception) { }
    }

    private inner class Bridge {
        @JavascriptInterface
        fun qr(src: String?) {
            if (src == null || src.length > 400000 || !(src.startsWith("data:image/") || src.startsWith("https://"))) return
            act.runOnUiThread {
                try {
                    val w = web ?: return@runOnUiThread
                    if (!isSocia(w.url)) return@runOnUiThread
                    em.emit("Pay", "qr", JSONObject().put("src", src).toString())
                } catch (_: Exception) { }
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun fillToJson(v: Any?): String = try {
        if (v is Map<*, *>) JSONObject(v as Map<String, Any?>).toString() else "{}"
    } catch (_: Exception) { "{}" }

    fun handle(method: String, args: Map<String, Any?>, result: MethodChannel.Result) {
        when (method) {
            "open" -> open(args, result)
            "close" -> act.runOnUiThread { closeInternal(false); result.success(null) }
            else -> result.notImplemented()
        }
    }

    private fun open(args: Map<String, Any?>, result: MethodChannel.Result) {
        val url = args["url"]?.toString()
        val title = args["title"]?.toString() ?: "Pembayaran Premium"
        autoFill = args["autoFill"] != false
        if (url == null || !isSocia(url)) { result.error("BAD", "Alamat pembayaran tidak valid", null); return }
        fillJson = fillToJson(args["fill"])
        lastReported = ""
        basePath = try { Uri.parse(args["basePath"]?.toString() ?: url).path ?: "" } catch (_: Exception) { "" }

        act.runOnUiThread {
            try {
                closeInternal(false)
                val dlg = Dialog(act, android.R.style.Theme_Black_NoTitleBar)
                dialog = dlg
                dlg.window?.let { w ->
                    w.statusBarColor = Color.parseColor("#0a0b0d")
                    w.navigationBarColor = Color.parseColor("#0a0b0d")
                    w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
                }
                val root = LinearLayout(act)
                root.orientation = LinearLayout.VERTICAL
                root.setBackgroundColor(Color.WHITE)

                val bar = LinearLayout(act)
                bar.orientation = LinearLayout.HORIZONTAL
                bar.gravity = Gravity.CENTER_VERTICAL
                bar.setBackgroundColor(Color.parseColor("#0a0b0d"))
                bar.setPadding(dp(16), 0, dp(4), 0)
                val tv = TextView(act)
                tv.text = title
                tv.setTextColor(Color.WHITE)
                tv.textSize = 16f
                tv.setTypeface(null, Typeface.BOLD)
                tv.isSingleLine = true
                tv.ellipsize = TextUtils.TruncateAt.END
                bar.addView(tv, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                val x = TextView(act)
                x.text = "\u2715"
                x.setTextColor(Color.WHITE)
                x.textSize = 22f
                x.gravity = Gravity.CENTER
                x.contentDescription = "Tutup"
                x.setOnClickListener { closeInternal(true) }
                bar.addView(x, LinearLayout.LayoutParams(dp(52), dp(52)))
                root.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)))

                val pb = ProgressBar(act, null, android.R.attr.progressBarStyleHorizontal)
                pb.max = 100
                root.addView(pb, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)))

                val wv = WebView(act)
                web = wv
                wv.addJavascriptInterface(Bridge(), "WPPay")
                val s = wv.settings
                s.javaScriptEnabled = true
                s.domStorageEnabled = true
                s.allowFileAccess = false
                s.allowContentAccess = false
                s.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                s.setSupportMultipleWindows(false)
                val cookies = CookieManager.getInstance()
                cookies.setAcceptCookie(true)
                cookies.setAcceptThirdPartyCookies(wv, true)

                wv.webChromeClient = object : WebChromeClient() {
                    override fun onProgressChanged(view: WebView?, p: Int) {
                        pb.progress = p
                        pb.visibility = if (p >= 100) View.GONE else View.VISIBLE
                    }
                }
                wv.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView?, r: WebResourceRequest?): Boolean {
                        val u = r?.url ?: return true
                        val sc = u.scheme
                        if ("https" == sc) return false
                        if ("http" == sc) return true
                        try {
                            val it = if ("intent" == sc) Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) else Intent(Intent.ACTION_VIEW, u)
                            it.addCategory(Intent.CATEGORY_BROWSABLE)
                            it.component = null
                            act.startActivity(it)
                        } catch (_: Exception) { }
                        return true
                    }
                    override fun onPageStarted(v: WebView?, u: String?, f: Bitmap?) { reportUrl(u) }
                    override fun onPageFinished(v: WebView?, u: String?) { if (v != null) injectFill(v, u); reportUrl(u) }
                    override fun doUpdateVisitedHistory(v: WebView?, u: String?, isReload: Boolean) { reportUrl(u) }
                    override fun onReceivedSslError(v: WebView?, h: SslErrorHandler?, e: SslError?) { h?.cancel() }
                }

                root.addView(wv, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
                dlg.setContentView(root)
                dlg.setOnKeyListener { _, code, ev ->
                    if (code == KeyEvent.KEYCODE_BACK && ev.action == KeyEvent.ACTION_UP) {
                        val w = web
                        if (w != null && w.canGoBack()) w.goBack() else closeInternal(true)
                        true
                    } else code == KeyEvent.KEYCODE_BACK
                }
                dlg.setCancelable(false)
                dlg.show()
                wv.loadUrl(url)
                result.success(null)
            } catch (_: Exception) {
                result.error("OPEN", "Gagal membuka pembayaran", null)
            }
        }
    }

    private fun closeInternal(notify: Boolean) {
        try {
            web?.let { it.stopLoading(); it.destroy() }
            web = null
            dialog?.dismiss()
            dialog = null
        } catch (_: Exception) { }
        if (notify) em.emit("Pay", "closed", "{}")
    }

    fun dispose() { closeInternal(false) }
}
